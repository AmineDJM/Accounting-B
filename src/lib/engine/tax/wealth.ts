import { D, ZERO, cents, Decimal } from "../money";
import { collectRefs, count, date as dateVal, money, qty as qtyVal, step, text, type TraceStep } from "../trace";
import { buildEconomicEvents, isMoney } from "./events";
import { LotLedger } from "./lots";
import { dedupeRefs } from "./gains";
import type { IncomeItem, TaxComputationInput, TaxComputationResult, TaxableEvent, WealthSnapshot, YearSummary } from "./types";
import type { CountryPack, WealthRules } from "@/lib/countries/types";
import { pick } from "@/lib/countries/types";
import { zonedMidnight, zonedYear } from "../tz";

/**
 * Engine for countries that tax the stock rather than the flow.
 *
 * Switzerland exempts capital gains on private movable assets but levies a
 * cantonal wealth tax on the 31 December position; the Netherlands taxes a
 * deemed return on the 1 January position in Box 3. Both still tax income
 * received in tokens, and both have a test that moves an active trader into a
 * business regime — so realised gains are computed and traced anyway, marked
 * as not taxable, because that is exactly the figure a taxpayer needs if the
 * administration challenges the private-investor qualification.
 */
export function wealthEngine(input: TaxComputationInput, pack: CountryPack): TaxComputationResult {
  const rules = pack.individual as WealthRules;
  const cur = input.currency;
  const locale = "fr";
  const warnings: TaxComputationResult["warnings"] = [];
  const events: TaxableEvent[] = [];
  const income: IncomeItem[] = [];
  const assumptions = [
    "Les quantités détenues sont reconstituées à partir des comptes importés et des avoirs externes déclarés.",
    `Position évaluée au ${String(rules.referenceDate.day).padStart(2, "0")}/${String(rules.referenceDate.month).padStart(2, "0")} de chaque année, au dernier cours disponible.`,
  ];

  const ledger = new LotLedger({ method: "FIFO" });
  const economic = buildEconomicEvents(input.valued, { feeAssetIsDisposal: false, capitaliseAcquisitionFees: true });
  const holdingsOverTime: { at: Date; asset: string; delta: Decimal }[] = [];
  let seq = 0;

  for (const ev of economic) {
    if (ev.kind === "ACQUIRE") {
      ledger.acquire(ev.asset, ev.qty, ev.costBase, ev.at, ev.wallet, ev.txId);
      holdingsOverTime.push({ at: ev.at, asset: ev.asset.toUpperCase(), delta: ev.qty });
      continue;
    }
    if (ev.kind === "INCOME") {
      income.push({
        id: `I${++seq}`, txId: ev.txId, date: ev.at, asset: ev.asset, qty: ev.qty, valueBase: ev.valueBase, incomeKind: ev.incomeKind,
        category: pick(rules.income.category, locale), taxable: rules.income.taxedAtReceipt,
        trace: step(`w-income-${seq}`, "Revenu en jetons", {
          inputs: [qtyVal("Quantité", ev.qty.toString(), ev.asset, ev.txId), dateVal("Date", ev.at)],
          output: money("Valeur à la réception", ev.valueBase.toString(), cur),
          note: pick(rules.income.note ?? rules.income.category, locale),
          refs: rules.income.refs ?? [],
        }),
      });
      continue;
    }
    if (ev.kind === "TRANSFER") continue;

    const out = ledger.dispose(ev.asset, ev.qty, ev.proceedsBase, ev.at, ev.wallet);
    holdingsOverTime.push({ at: ev.at, asset: ev.asset.toUpperCase(), delta: ev.qty.neg() });
    if (out.shortfall.gt("1e-12")) warnings.push({ level: "warning", txId: ev.txId, message: `${out.shortfall.toString()} ${ev.asset} cédés sans acquisition connue.` });
    events.push({
      id: `E${++seq}`, txId: ev.txId, date: ev.at, asset: ev.asset, qty: ev.qty, disposalKind: ev.disposalKind, counterAsset: ev.counterAsset,
      proceeds: ev.proceedsBase, fees: ev.feesBase, netProceeds: ev.proceedsBase.minus(ev.feesBase), costBasis: out.cost, gain: out.gain,
      exempt: rules.capitalGainsExempt, exemptReason: rules.capitalGainsExempt ? pick(rules.capitalGainsNote, locale) : undefined,
      holdingDays: out.maxHoldingDays, extra: { informational: "true" }, warnings: [],
      trace: step(`w-disposal-${seq}`, `Cession de ${ev.qty.toString()} ${ev.asset}`, {
        formula: "résultat = prix de cession − prix d'acquisition (PEPS)",
        inputs: [dateVal("Date", ev.at, ev.txId), money("Prix de cession", ev.proceedsBase.toString(), cur), money("Prix d'acquisition", out.cost.toString(), cur)],
        output: money("Résultat (information)", out.gain.toString(), cur),
        note: pick(rules.capitalGainsNote, locale),
      }),
    });
  }

  // --- wealth snapshots ---------------------------------------------------
  const externals = new Map(Object.entries(input.externalHoldings ?? {}).map(([k, v]) => [k.toUpperCase(), D(v)]));
  const activityYears = [...new Set(holdingsOverTime.map((h) => zonedYear(h.at)))].sort((a, b) => a - b);
  const lastYear = zonedYear(input.now ?? new Date());
  const snapYears: number[] = [];
  for (let y = (activityYears[0] ?? lastYear); y <= lastYear; y++) snapYears.push(y);
  const wealth: WealthSnapshot[] = [];

  for (const year of snapYears.filter((y) => !input.years || input.years.includes(y))) {
    const at = zonedMidnight(year, rules.referenceDate.month, rules.referenceDate.day + 1);
    const cutoff = new Date(at.getTime() - 1);
    const qtyByAsset = new Map<string, Decimal>(externals);
    for (const h of holdingsOverTime) {
      if (h.at > cutoff) continue;
      qtyByAsset.set(h.asset, (qtyByAsset.get(h.asset) ?? ZERO).plus(h.delta));
    }
    const lines: WealthSnapshot["holdings"] = [];
    const missing: string[] = [];
    let total = ZERO;
    for (const [asset, q] of [...qtyByAsset.entries()].sort()) {
      if (q.lte("1e-12") || isMoney(asset)) continue;
      const quote = input.prices.get(asset, cutoff);
      if (!quote) { missing.push(asset); lines.push({ asset, qty: q, unitValue: null, value: ZERO, source: "cours manquant" }); continue; }
      const value = q.mul(quote.priceEur);
      total = total.plus(value);
      lines.push({ asset, qty: q, unitValue: quote.priceEur, value, source: quote.source });
    }
    lines.sort((a, b) => b.value.comparedTo(a.value));
    const params = rules.years[year] ?? rules.years[Math.max(...Object.keys(rules.years).map(Number).filter((y) => y <= year))] ?? {};
    const notes: string[] = [];
    const steps: TraceStep[] = [
      step(`w-${year}-holdings`, "Position retenue", {
        inputs: lines.slice(0, 20).map((l) => ({ label: l.asset, value: `${l.qty.toFixed(8).replace(/0+$/, "")} × ${l.unitValue ? l.unitValue.toFixed(2) : "?"} ${cur}`, raw: l.value.toString(), unit: "MONEY" as const, currency: cur, note: l.source })),
        output: money("Valeur totale", total.toString(), cur),
        warning: missing.length ? `Cours manquants : ${missing.join(", ")}` : undefined,
      }),
    ];
    const formLines: WealthSnapshot["formLines"] = [];
    let estimated: Decimal | null = null;

    if (params.deemedReturnRate) {
      const deemed = total.mul(D(params.deemedReturnRate));
      const exemptCapital = params.exemptCapital ? D(params.exemptCapital) : ZERO;
      const base = Decimal.max(total.minus(exemptCapital), ZERO);
      const deemedOnBase = base.mul(D(params.deemedReturnRate));
      estimated = params.rate ? deemedOnBase.mul(D(params.rate)) : null;
      steps.push(step(`w-${year}-deemed`, pick(params.rateLabel ?? { fr: "Rendement forfaitaire", en: "Deemed return" }, locale), {
        formula: "rendement forfaitaire = (valeur des actifs − capital exonéré) × taux forfaitaire ; impôt = rendement × taux",
        inputs: [
          money("Valeur des actifs numériques", total.toString(), cur),
          money("Capital exonéré", exemptCapital.toString(), cur),
          { label: "Taux forfaitaire", value: `${(Number(params.deemedReturnRate) * 100).toFixed(2).replace(".", ",")} %`, raw: params.deemedReturnRate, unit: "RATE" },
          ...(params.rate ? [{ label: "Taux d'imposition", value: `${(Number(params.rate) * 100).toFixed(2).replace(".", ",")} %`, raw: params.rate, unit: "RATE" as const }] : []),
        ],
        output: estimated ? money("Impôt estimé", estimated.toString(), cur) : money("Rendement forfaitaire", deemed.toString(), cur),
        warning: "Estimation portant sur les seuls actifs numériques : l'impôt réel porte sur l'ensemble du patrimoine de la catégorie et tient compte du partenaire fiscal.",
      }));
    }
    for (const n of params.notes ?? []) notes.push(pick(n, locale));
    wealth.push({
      year, at: cutoff, currency: cur, holdings: lines, total: cents(total), missing, notes, formLines,
      trace: step(`w-year-${year}`, `${pick(rules.referenceLabel, locale)} ${year}`, { steps, output: money("Valeur déclarée", total.toString(), cur) }),
    });
    if (estimated) {
      wealth[wealth.length - 1].formLines.push({ form: "—", box: "estimation", label: "Impôt estimé sur la catégorie", value: cents(estimated).toFixed(2), raw: estimated.toString() });
    }
  }

  // --- yearly summaries (income + informational gains) ---------------------
  const years: YearSummary[] = [];
  for (const w of wealth) {
    const yearIncome = income.filter((i) => zonedYear(i.date) === w.year);
    const yearEvents = events.filter((e) => zonedYear(e.date) === w.year);
    const incomeTotal = yearIncome.reduce((a, i) => a.plus(i.valueBase), ZERO);
    const gains = yearEvents.filter((e) => e.gain.gt(0)).reduce((a, e) => a.plus(e.gain), ZERO);
    const losses = yearEvents.filter((e) => e.gain.lt(0)).reduce((a, e) => a.plus(e.gain.abs()), ZERO);
    years.push({
      year: w.year, currency: cur, disposalCount: yearEvents.length,
      grossProceeds: cents(yearEvents.reduce((a, e) => a.plus(e.proceeds), ZERO)),
      gains: cents(gains), losses: cents(losses), netGain: cents(gains.minus(losses)),
      taxableBase: ZERO, estimatedTax: null, taxBreakdown: [],
      incomeTotal: cents(incomeTotal), incomeTaxable: cents(rules.income.taxedAtReceipt ? incomeTotal : ZERO),
      lossCarryForward: ZERO,
      notes: [pick(rules.capitalGainsNote, locale), ...w.notes],
      formLines: w.formLines,
      trace: step(`wy-${w.year}`, `Année ${w.year}`, {
        steps: [
          w.trace,
          step(`wy-${w.year}-gains`, "Résultat des cessions (information)", {
            inputs: [count("Cessions", yearEvents.length), money("Plus-values", gains.toString(), cur), money("Moins-values", losses.toString(), cur)],
            output: text("Traitement", pick(rules.capitalGainsNote, locale)),
          }),
          ...(incomeTotal.gt(0) ? [step(`wy-${w.year}-income`, pick(rules.income.category, locale), {
            inputs: [money("Revenus en jetons", incomeTotal.toString(), cur), count("Opérations", yearIncome.length)],
            output: money("Imposable", rules.income.taxedAtReceipt ? incomeTotal.toString() : "0", cur),
            refs: rules.income.refs ?? [],
          })] : []),
        ],
      }),
    });
  }

  return {
    country: pack.code,
    currency: cur,
    regime: "WEALTH",
    regimeLabel: pick(rules.referenceLabel, locale),
    events, income, years, wealth,
    warnings,
    refs: dedupeRefs([...(pack.refs ?? []), ...collectRefs(years.map((y) => y.trace))]),
    assumptions: [...assumptions, ...rules.businessTest.map((b) => pick(b, locale))],
    computedAt: input.now ?? new Date(),
  };
}
