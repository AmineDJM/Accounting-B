import { D, ZERO, cents, Decimal } from "../money";
import { collectRefs, count, date, money, qty as qtyVal, step, text, days, type LegalRef, type TraceStep } from "../trace";
import { LotLedger, type Consumption } from "./lots";
import { buildEconomicEvents } from "./events";
import type { DisposalKind, FormLine, IncomeItem, TaxComputationInput, TaxComputationResult, TaxableEvent, YearSummary } from "./types";
import type { CountryPack, GainsRules, GainsYearParams, IncomeKindRule } from "@/lib/countries/types";
import { pick } from "@/lib/countries/types";
import { zonedEndOfDay, zonedYear } from "../tz";

/**
 * Lot-based capital gains engine.
 *
 * Shared by every country that taxes realised gains on crypto-assets
 * (Germany, Austria, Spain, Italy, Portugal, Belgium). What differs from one
 * country to the next is expressed as data in the country pack: which
 * disposals are taxable, the cost method, holding-period exemptions,
 * grandfathering, allowances, rates and loss rules.
 *
 * France is deliberately not handled here: article 150 VH bis prices a
 * disposal against the whole portfolio rather than against lots, so it has its
 * own engine.
 */
export function gainsEngine(input: TaxComputationInput, pack: CountryPack): TaxComputationResult {
  const rules = pack.individual as GainsRules;
  const cur = input.currency;
  const locale = "fr";
  const warnings: TaxComputationResult["warnings"] = [];
  const assumptions: string[] = [];
  const events: TaxableEvent[] = [];
  const income: IncomeItem[] = [];

  const legacyBefore = rules.legacyBefore ? new Date(rules.legacyBefore) : undefined;
  const stepUpValues = new Map<string, Decimal>();
  if (rules.legacyTreatment === "STEP_UP" && legacyBefore) {
    // Reference value of each asset on the day before the regime started.
    for (const a of new Set(input.valued.flatMap((t) => t.legs.map((l) => l.asset.toUpperCase())))) {
      const q = input.prices.get(a, new Date(legacyBefore.getTime() - 1));
      if (q) stepUpValues.set(a, q.priceEur);
    }
    assumptions.push(
      `Valeur de référence des actifs détenus avant le ${legacyBefore.toISOString().slice(0, 10)} : cours de clôture de la veille, utilisé comme prix d'acquisition. Une valeur officielle communiquée par la plateforme ou l'administration prime sur cette estimation.`,
    );
  }

  const ledger = new LotLedger({
    method: rules.costMethod,
    perWallet: rules.perWallet,
    legacyBefore,
    legacyStepUp: rules.legacyTreatment === "STEP_UP" ? (asset) => stepUpValues.get(asset) : undefined,
  });

  const economic = buildEconomicEvents(input.valued, {
    feeAssetIsDisposal: rules.taxableDisposals.includes("FEE"),
    capitaliseAcquisitionFees: rules.capitaliseAcquisitionFees,
  });

  /**
   * A swap the country does not tax carries the cost — and often the
   * acquisition date — of the asset given up onto the asset received. The
   * carry-over is recorded when the disposal is processed and consumed by the
   * acquisition of the same transaction.
   */
  const rollover = new Map<string, { cost: Decimal; acquiredAt: Date; legacy: boolean }>();
  /** Income received in tokens whose cost is nil under local law. */
  const zeroCostAcquisitions = new Set<string>();

  const incomeRuleFor = (kind: string): IncomeKindRule => ({ ...rules.income, ...(rules.income.byKind?.[kind as keyof typeof rules.income.byKind] ?? {}) });

  /** Position held at the end of each calendar year, for levies on the stock held. */
  const yearEndPositions = new Map<number, { asset: string; qty: Decimal }[]>();
  let cursorYear = economic.length ? zonedYear(economic[0].at) : zonedYear(input.now ?? new Date());

  let seq = 0;
  for (const ev of economic) {
    const evYear = zonedYear(ev.at);
    while (evYear > cursorYear) {
      yearEndPositions.set(cursorYear, ledger.positions().map((p) => ({ asset: p.asset, qty: p.qty })));
      cursorYear++;
    }
    if (ev.kind === "ACQUIRE") {
      const carried = rollover.get(ev.txId);
      const zeroCost = zeroCostAcquisitions.has(`${ev.txId}|${ev.asset.toUpperCase()}`);
      if (carried && rules.deferredSwap?.rollsOverCost) {
        const lot = ledger.acquire(ev.asset, ev.qty, carried.cost, rules.deferredSwap.carriesAcquisitionDate ? carried.acquiredAt : ev.at, ev.wallet, ev.txId);
        if (lot && rules.deferredSwap.carriesAcquisitionDate) lot.legacy = carried.legacy;
        rollover.delete(ev.txId);
        continue;
      }
      ledger.acquire(ev.asset, ev.qty, zeroCost ? ZERO : ev.costBase, ev.at, ev.wallet, ev.txId);
      continue;
    }
    if (ev.kind === "INCOME") {
      const rule = incomeRuleFor(ev.incomeKind);
      const taxable = rule.taxedAtReceipt;
      if (rule.acquisitionCost === "ZERO") zeroCostAcquisitions.add(`${ev.txId}|${ev.asset.toUpperCase()}`);
      income.push({
        id: `I${++seq}`,
        txId: ev.txId,
        date: ev.at,
        asset: ev.asset,
        qty: ev.qty,
        valueBase: ev.valueBase,
        incomeKind: ev.incomeKind,
        category: pick(rule.category, locale),
        taxable,
        exemptReason: taxable ? undefined : pick(rule.note ?? rule.category, locale),
        trace: step(`income-${seq}`, `Revenu en jetons — ${ev.incomeKind}`, {
          formula: "revenu imposable = quantité reçue × cours du jour",
          inputs: [qtyVal("Quantité reçue", ev.qty.toString(), ev.asset, ev.txId), date("Date de réception", ev.at)],
          output: taxable ? money("Valeur imposable à la réception", ev.valueBase.toString(), cur) : text("Traitement", "non imposé à la réception"),
          note: `${pick(rule.category, locale)}${rule.acquisitionCost === "ZERO" ? " — prix d'acquisition nul : la totalité sera imposée lors de la cession." : ""}`,
          refs: rule.refs ?? [],
        }),
      });
      continue;
    }
    if (ev.kind === "TRANSFER") continue;

    // --- disposal -------------------------------------------------------
    const out = ledger.dispose(ev.asset, ev.qty, ev.proceedsBase, ev.at, ev.wallet);
    if (out.shortfall.gt("1e-12")) {
      warnings.push({ level: "warning", txId: ev.txId, message: `${out.shortfall.toString()} ${ev.asset} cédés sans acquisition connue : le prix d'acquisition est sous-estimé, importez l'historique manquant.` });
    }
    const kindTaxable = rules.taxableDisposals.includes(ev.disposalKind);
    if (!kindTaxable && ev.disposalKind === "CRYPTO" && rules.deferredSwap?.rollsOverCost) {
      const oldest = out.consumed.reduce<Date | null>((acc, c) => (acc === null || c.lot.acquiredAt < acc ? c.lot.acquiredAt : acc), null);
      rollover.set(ev.txId, { cost: out.cost, acquiredAt: oldest ?? ev.at, legacy: out.allLegacy });
    }
    for (const f of rules.flagDisposals ?? []) {
      if (f.matches(ev.asset, ev.counterAsset, ev.disposalKind)) {
        warnings.push({ level: "info", txId: ev.txId, message: pick(f.message, locale) });
      }
    }

    // Split the disposal when the units consumed do not share the same tax treatment.
    const groups = splitByTreatment(out.consumed, rules, ev.disposalKind, ev.at);
    const totalQty = out.consumed.reduce((a, c) => a.plus(c.qty), ZERO);
    for (const g of groups) {
      const share = totalQty.isZero() ? ZERO : g.qty.div(totalQty);
      const proceeds = ev.proceedsBase.mul(share);
      const fees = rules.deductFees ? ev.feesBase.mul(share) : ZERO;
      const net = proceeds.minus(fees);
      const cost = g.cost;
      const gain = net.minus(cost);
      const exempt = !kindTaxable || g.exempt;
      const reason = !kindTaxable ? deferredReason(ev.disposalKind, rules, locale) : g.reason;
      events.push({
        id: `E${++seq}`,
        txId: ev.txId,
        date: ev.at,
        asset: ev.asset,
        qty: g.qty,
        disposalKind: ev.disposalKind,
        counterAsset: ev.counterAsset,
        proceeds,
        fees,
        netProceeds: net,
        costBasis: cost,
        gain,
        exempt,
        exemptReason: exempt ? reason : undefined,
        holdingDays: g.maxHoldingDays,
        extra: { method: rules.costMethod, lots: String(g.consumed.length) },
        warnings: out.shortfall.gt("1e-12") ? ["Acquisition manquante"] : [],
        trace: disposalTrace(seq, ev.asset, g, { proceeds, fees, net, cost, gain, exempt, reason, at: ev.at, txId: ev.txId, kind: ev.disposalKind, counter: ev.counterAsset }, rules, cur, locale),
      });
    }
  }

  const lastYear = zonedYear(input.now ?? new Date());
  while (cursorYear <= lastYear) {
    yearEndPositions.set(cursorYear, ledger.positions().map((p) => ({ asset: p.asset, qty: p.qty })));
    cursorYear++;
  }

  const years = summarise(events, income, rules, input, cur, locale, assumptions, yearEndPositions);
  const refs = dedupeRefs([...(pack.refs ?? []), ...collectRefs(years.map((y) => y.trace))]);

  return {
    country: pack.code,
    currency: cur,
    regime: "GAINS",
    regimeLabel: pick(rules.costMethodLabel, locale),
    events,
    income,
    years,
    wealth: [],
    warnings,
    refs,
    // The pack's own assumptions come first: they are what a professional has
    // to check, and they are written by the person who read the law, not
    // derived from the data.
    assumptions: [
      ...(pack.assumptions ?? []).map((a) => pick(a, locale)),
      ...(rules.caveats ?? []).map((c) => pick(c, locale)),
      ...assumptions,
    ],
    computedAt: input.now ?? new Date(),
  };
}

/* ------------------------------------------------------------------ helpers */

interface Group {
  qty: Decimal;
  cost: Decimal;
  consumed: Consumption[];
  exempt: boolean;
  reason?: string;
  maxHoldingDays: number;
}

const addYears = (d: Date, years: number): Date => {
  const out = new Date(d.getTime());
  out.setUTCFullYear(out.getUTCFullYear() + years);
  return out;
};

function splitByTreatment(consumed: Consumption[], rules: GainsRules, kind: DisposalKind, disposedAt: Date): Group[] {
  const buckets = new Map<string, Group>();
  const add = (key: string, c: Consumption, exempt: boolean, reason?: string) => {
    const g = buckets.get(key) ?? { qty: ZERO, cost: ZERO, consumed: [], exempt, reason, maxHoldingDays: 0 };
    g.qty = g.qty.plus(c.qty);
    g.cost = g.cost.plus(c.cost);
    g.consumed.push(c);
    g.maxHoldingDays = Math.max(g.maxHoldingDays, c.holdingDays);
    buckets.set(key, g);
  };
  for (const c of consumed) {
    if (rules.legacyTreatment === "EXEMPT" && c.legacy) {
      add("legacy", c, true, rules.legacyLabel?.fr ?? "Actif acquis avant l'entrée en vigueur du régime");
      continue;
    }
    if (rules.exemptAfterYears !== undefined && disposedAt > addYears(c.lot.acquiredAt, rules.exemptAfterYears)) {
      add("held", c, true, rules.exemptAfterDaysLabel?.fr ?? `Détention supérieure à ${rules.exemptAfterYears} an(s)`);
      continue;
    }
    if (rules.exemptAfterDays !== undefined && c.holdingDays >= rules.exemptAfterDays) {
      add("held", c, true, rules.exemptAfterDaysLabel?.fr ?? `Détention d'au moins ${rules.exemptAfterDays} jours`);
      continue;
    }
    add("taxable", c, false);
  }
  if (buckets.size === 0) {
    // disposal with no known acquisition: still report it, with a zero cost
    return [{ qty: ZERO, cost: ZERO, consumed: [], exempt: !rules.taxableDisposals.includes(kind), maxHoldingDays: 0 }];
  }
  return [...buckets.values()];
}

function deferredReason(kind: DisposalKind, rules: GainsRules, locale: string): string {
  void rules;
  void locale;
  switch (kind) {
    case "CRYPTO": return "Échange entre actifs numériques : pas d'imposition à ce stade (sursis).";
    case "FEE": return "Frais : non traités comme une cession imposable dans ce pays.";
    case "GIFT": return "Donation : régime propre, hors du calcul des plus-values.";
    case "LOST": return "Perte constatée : non imposable.";
    default: return "Non imposable dans ce pays.";
  }
}

function disposalTrace(
  n: number,
  asset: string,
  g: Group,
  v: { proceeds: Decimal; fees: Decimal; net: Decimal; cost: Decimal; gain: Decimal; exempt: boolean; reason?: string; at: Date; txId: string; kind: DisposalKind; counter?: string },
  rules: GainsRules,
  cur: string,
  locale: string,
): TraceStep {
  const costStep = step(`cost-${n}`, `Prix d'acquisition (${pick(rules.costMethodLabel, locale)})`, {
    formula: rules.costMethod === "AVERAGE" ? "coût = quantité cédée × coût unitaire moyen" : "coût = Σ (quantité prélevée sur chaque lot × prix unitaire du lot)",
    inputs: g.consumed.slice(0, 20).map((c) => ({
      label: `Lot du ${c.lot.acquiredAt.toISOString().slice(0, 10)}${c.legacy ? " (antérieur au régime)" : ""}`,
      value: `${c.qty.toString()} ${asset} × ${c.lot.unitCost.toFixed(4)} ${cur} = ${cents(c.cost).toFixed(2)} ${cur}`,
      raw: c.cost.toString(),
      unit: "MONEY" as const,
      currency: cur,
      ref: c.lot.txId,
      note: `détention ${c.holdingDays} j`,
    })),
    output: money("Prix d'acquisition retenu", v.cost.toString(), cur),
    note: g.consumed.length > 20 ? `${g.consumed.length} lots consommés, 20 premiers affichés.` : undefined,
  });

  const children: TraceStep[] = [costStep];
  if (rules.exemptAfterDays !== undefined || rules.exemptAfterYears !== undefined) {
    children.push(step(`holding-${n}`, "Durée de détention", {
      formula: rules.exemptAfterYears !== undefined ? `exonéré si la cession intervient plus de ${rules.exemptAfterYears} an(s) après l'acquisition` : `exonéré si détention ≥ ${rules.exemptAfterDays} jours`,
      inputs: [days("Détention la plus longue", g.maxHoldingDays), days("Seuil", rules.exemptAfterDays ?? (rules.exemptAfterYears ?? 0) * 365)],
      output: text("Résultat", g.exempt ? "exonéré" : "imposable"),
      refs: [],
    }));
  }
  children.push(step(`gain-${n}`, "Plus ou moins-value", {
    formula: rules.deductFees ? "PV = prix de cession − frais − prix d'acquisition" : "PV = prix de cession − prix d'acquisition",
    inputs: [money("Prix de cession", v.proceeds.toString(), cur), money("Frais déduits", v.fees.toString(), cur), money("Prix d'acquisition", v.cost.toString(), cur)],
    output: money("Plus ou moins-value", v.gain.toString(), cur),
  }));

  return step(`disposal-${n}`, `Cession de ${g.qty.toString()} ${asset} le ${v.at.toISOString().slice(0, 10)}`, {
    inputs: [
      date("Date", v.at, v.txId),
      text("Nature", v.kind === "FIAT" ? "vente contre monnaie ayant cours légal" : v.kind === "CRYPTO" ? `échange contre ${v.counter ?? "un autre actif numérique"}` : v.kind === "GOODS" ? "paiement d'un bien ou service" : v.kind === "FEE" ? "paiement de frais" : v.kind.toLowerCase()),
      money("Contrepartie reçue", v.proceeds.toString(), cur),
    ],
    output: v.exempt ? text("Résultat", `non imposable — ${v.reason ?? ""}`) : money("Plus ou moins-value imposable", v.gain.toString(), cur),
    steps: children,
    note: v.exempt ? v.reason : undefined,
  });
}

function summarise(
  events: TaxableEvent[],
  income: IncomeItem[],
  rules: GainsRules,
  input: TaxComputationInput,
  cur: string,
  locale: string,
  assumptions: string[],
  yearEndPositions: Map<number, { asset: string; qty: Decimal }[]>,
): YearSummary[] {
  const years = new Set<number>();
  for (const e of events) years.add(zonedYear(e.date));
  for (const i of income) years.add(zonedYear(i.date));
  const ordered = [...years].sort((a, b) => a - b).filter((y) => !input.years || input.years.includes(y));
  const out: YearSummary[] = [];
  let carry = ZERO;

  for (const year of ordered) {
    const params = paramsFor(rules, year);
    const yearEvents = events.filter((e) => zonedYear(e.date) === year && !e.exempt);
    const allDisposals = events.filter((e) => zonedYear(e.date) === year);
    const yearIncome = income.filter((i) => zonedYear(i.date) === year);
    const grossProceeds = yearEvents.reduce((a, e) => a.plus(e.proceeds), ZERO);
    const gains = yearEvents.filter((e) => e.gain.gt(0)).reduce((a, e) => a.plus(e.gain), ZERO);
    const losses = yearEvents.filter((e) => e.gain.lt(0)).reduce((a, e) => a.plus(e.gain.abs()), ZERO);
    const netBeforeCarry = gains.minus(losses);
    const notes: string[] = [];
    const steps: TraceStep[] = [];

    steps.push(step(`y${year}-events`, "Cessions imposables de l'année", {
      inputs: [count("Cessions retenues", yearEvents.length), count("Cessions non imposables (sursis, exonérations)", allDisposals.length - yearEvents.length), money("Total des prix de cession", grossProceeds.toString(), cur)],
      output: money("Plus-values − moins-values", netBeforeCarry.toString(), cur),
      formula: "résultat = Σ plus-values − Σ moins-values",
    }));

    // --- loss carry-forward ---------------------------------------------
    let net = netBeforeCarry;
    let used = ZERO;
    if (carry.gt(0) && net.gt(0) && rules.losses.carryForwardYears !== 0) {
      used = Decimal.min(carry, net);
      net = net.minus(used);
      carry = carry.minus(used);
      steps.push(step(`y${year}-carry`, "Imputation des moins-values reportées", {
        formula: "résultat net = résultat − moins-values antérieures imputées",
        inputs: [money("Moins-values reportées disponibles", used.plus(carry).toString(), cur), money("Imputées cette année", used.toString(), cur)],
        output: money("Résultat après imputation", net.toString(), cur),
        refs: rules.losses.refs ?? [],
        note: pick(rules.losses.note ?? { fr: "", en: "" }, locale) || undefined,
      }));
    }
    if (netBeforeCarry.lt(0)) {
      carry = carry.plus(netBeforeCarry.abs());
      notes.push(
        rules.losses.carryForwardYears === 0
          ? "Moins-value nette non reportable dans ce pays."
          : `Moins-value nette reportable ${rules.losses.carryForwardYears === null ? "sans limite de durée" : `sur ${rules.losses.carryForwardYears} an(s)`}.`,
      );
      net = ZERO;
    }

    // --- thresholds and allowances ---------------------------------------
    let taxable = Decimal.max(net, ZERO);
    let exemptByThreshold = false;
    if (params.proceedsThreshold) {
      const th = D(params.proceedsThreshold.amount);
      const totalProceeds = allDisposals.reduce((a, e) => a.plus(e.proceeds), ZERO);
      exemptByThreshold = totalProceeds.lte(th);
      steps.push(step(`y${year}-threshold`, pick(params.proceedsThreshold.label, locale), {
        formula: "exonération si total des prix de cession ≤ seuil",
        inputs: [money("Total des cessions de l'année", totalProceeds.toString(), cur), money("Seuil", th.toString(), cur)],
        output: text("Résultat", exemptByThreshold ? "exonéré" : "imposable"),
        refs: params.proceedsThreshold.refs ?? [],
      }));
      if (exemptByThreshold) taxable = ZERO;
    }
    if (params.allowance && !exemptByThreshold) {
      const amount = D(params.allowance.amount);
      const before = taxable;
      if (params.allowance.kind === "FREIGRENZE") {
        taxable = before.lt(amount) ? ZERO : before;
      } else {
        taxable = Decimal.max(before.minus(amount), ZERO);
      }
      steps.push(step(`y${year}-allowance`, pick(params.allowance.label, locale), {
        formula: params.allowance.kind === "FREIGRENZE" ? "si résultat < seuil → totalement exonéré, sinon totalement imposable" : "base = résultat − abattement",
        inputs: [money("Résultat", before.toString(), cur), money(params.allowance.kind === "FREIGRENZE" ? "Seuil d'exonération" : "Abattement", amount.toString(), cur)],
        output: money("Base imposable", taxable.toString(), cur),
        refs: params.allowance.refs ?? [],
        note: params.allowance.kind === "FREIGRENZE" ? "Seuil et non abattement : le dépassement rend la totalité imposable." : undefined,
      }));
    }

    // --- tax estimate ------------------------------------------------------
    const breakdown: YearSummary["taxBreakdown"] = [];
    let tax: Decimal | null = null;
    if (taxable.gt(0)) {
      const custom = params.estimator?.(taxable.toString(), input.options ?? {});
      if (custom) {
        for (const c of custom.components) breakdown.push({ label: pick(c.label, locale), amount: D(c.amount), rate: c.rate });
        if (custom.note) notes.push(pick(custom.note, locale));
      } else if (params.estimator) {
        notes.push(pick(params.noEstimateNote ?? { fr: "Impôt non estimable sans vos autres revenus imposables.", en: "Tax cannot be estimated without your other taxable income." }, locale));
      } else {
        const rateGroups = groupByRate(yearEvents, params, taxable, net);
        for (const grp of rateGroups) {
          const amount = grp.base.mul(D(grp.rate));
          breakdown.push({ label: grp.label, amount, rate: grp.rate });
        }
        for (const c of params.components ?? []) {
          breakdown.push({ label: pick(c.label, locale), amount: taxable.mul(D(c.rate)), rate: c.rate });
        }
      }
      tax = breakdown.length ? breakdown.reduce((a, b) => a.plus(b.amount), ZERO) : null;
      if (tax) steps.push(step(`y${year}-tax`, "Impôt estimé", {
        formula: "impôt = base imposable × taux",
        inputs: [money("Base imposable", taxable.toString(), cur), ...breakdown.map((b) => ({ label: b.label, value: `${cents(b.amount).toFixed(2)} ${cur}${b.rate ? ` (${(Number(b.rate) * 100).toFixed(2).replace(".", ",")} %)` : ""}`, raw: b.amount.toString(), unit: "MONEY" as const, currency: cur }))],
        output: money("Total estimé", tax.toString(), cur),
        warning: "Estimation indicative : elle ignore les autres revenus du foyer, les taux progressifs éventuels et les situations personnelles.",
      }));
    }

    // --- income ------------------------------------------------------------
    const incomeTotal = yearIncome.reduce((a, i) => a.plus(i.valueBase), ZERO);
    let incomeTaxable = yearIncome.filter((i) => i.taxable).reduce((a, i) => a.plus(i.valueBase), ZERO);

    if (rules.income.allowance) {
      const amount = D(rules.income.allowance.amount);
      const before = incomeTaxable;
      incomeTaxable = rules.income.allowance.kind === "FREIGRENZE" ? (before.lt(amount) ? ZERO : before) : Decimal.max(before.minus(amount), ZERO);
      steps.push(step(`y${year}-income`, `${pick(rules.income.category, locale)} — ${pick(rules.income.allowance.label, locale)}`, {
        inputs: [money("Revenus en jetons reçus", before.toString(), cur), money("Seuil / abattement", amount.toString(), cur)],
        output: money("Montant imposable", incomeTaxable.toString(), cur),
        refs: rules.income.refs ?? [],
      }));
    } else if (incomeTotal.gt(0)) {
      steps.push(step(`y${year}-income`, pick(rules.income.category, locale), {
        inputs: [money("Revenus en jetons reçus", incomeTotal.toString(), cur), count("Opérations", yearIncome.length)],
        output: money("Montant imposable", incomeTaxable.toString(), cur),
        refs: rules.income.refs ?? [],
        note: pick(rules.income.note ?? { fr: "", en: "" }, locale) || undefined,
      }));
    }

    // --- levy on the value held at year end (Italy: bollo / IVCA at 2 ‰) ------
    if (rules.wealthLevy) {
      const positions = yearEndPositions.get(year) ?? [];
      const at = zonedEndOfDay(year, 12, 31);
      let value = ZERO;
      const lines: { asset: string; qty: Decimal; price: Decimal }[] = [];
      const missingAssets: string[] = [];
      for (const p of positions) {
        const q = input.prices.get(p.asset, at);
        if (!q) { missingAssets.push(p.asset); continue; }
        value = value.plus(p.qty.mul(q.priceEur));
        lines.push({ asset: p.asset, qty: p.qty, price: q.priceEur });
      }
      const levy = value.mul(D(rules.wealthLevy.rate));
      if (value.gt(0)) {
        breakdown.push({ label: pick(rules.wealthLevy.label, locale), amount: levy, rate: rules.wealthLevy.rate });
        tax = (tax ?? ZERO).plus(levy);
        steps.push(step(`y${year}-levy`, pick(rules.wealthLevy.label, locale), {
          formula: "imposition = valeur détenue au 31 décembre × taux",
          inputs: [
            ...lines.slice(0, 15).map((l) => ({ label: l.asset, value: `${l.qty.toFixed(8).replace(/0+$/, "")} × ${l.price.toFixed(2)} ${cur}`, raw: l.qty.mul(l.price).toString(), unit: "MONEY" as const, currency: cur })),
            money("Valeur totale au 31/12", value.toString(), cur),
            { label: "Taux", value: `${(Number(rules.wealthLevy.rate) * 1000).toFixed(2).replace(".", ",")} ‰`, raw: rules.wealthLevy.rate, unit: "RATE" as const },
          ],
          output: money("Montant dû", levy.toString(), cur),
          note: pick(rules.wealthLevy.note, locale),
          refs: rules.wealthLevy.refs,
          warning: missingAssets.length ? `Cours de clôture manquants : ${missingAssets.join(", ")}` : undefined,
        }));
      }
    }

    for (const n of params.notes ?? []) notes.push(pick(n, locale));

    out.push({
      year,
      currency: cur,
      disposalCount: yearEvents.length,
      grossProceeds,
      gains,
      losses,
      netGain: netBeforeCarry,
      taxableBase: cents(taxable),
      // A jurisdiction without a personal income tax shows its notice, never a
      // figure: a zero would read as a computation rather than as an absence.
      estimatedTax: rules.noPersonalTax ? null : tax ? cents(tax) : taxable.isZero() ? ZERO : null,
      taxBreakdown: breakdown.map((b) => ({ ...b, amount: cents(b.amount) })),
      incomeTotal: cents(incomeTotal),
      incomeTaxable: cents(incomeTaxable),
      lossCarryForward: cents(carry),
      notes,
      formLines: [],
      trace: step(`year-${year}`, `Année ${year}`, { steps, output: money("Base imposable", taxable.toString(), cur) }),
    });
  }
  if (rules.costMethod === "AVERAGE") assumptions.push("Coût unitaire moyen pondéré recalculé à chaque acquisition, tous portefeuilles confondus.");
  if (rules.perWallet) assumptions.push("Les lots sont suivis portefeuille par portefeuille : un transfert entre vos comptes conserve la date d'acquisition d'origine uniquement si le compte de départ est importé.");
  return out;
}

function groupByRate(events: TaxableEvent[], params: GainsYearParams, taxable: Decimal, net: Decimal): { label: string; rate: string; base: Decimal }[] {
  const defaultRate = params.flatRate ?? "0";
  if (!params.specialRates?.length) {
    if (params.brackets?.length) return applyBrackets(taxable, params.brackets);
    return [{ label: "Impôt", rate: defaultRate, base: taxable }];
  }
  // Split the taxable base across rate groups, pro rata to each group's net gain.
  const groups = new Map<string, { label: string; rate: string; gain: Decimal }>();
  for (const e of events) {
    const special = params.specialRates.find((s) => s.matches(e.asset));
    const key = special ? special.rate : defaultRate;
    const label = special ? special.label.fr : "Impôt";
    const g = groups.get(key) ?? { label, rate: key, gain: ZERO };
    g.gain = g.gain.plus(e.gain);
    groups.set(key, g);
  }
  const totalGain = [...groups.values()].reduce((a, g) => a.plus(Decimal.max(g.gain, ZERO)), ZERO);
  if (totalGain.isZero() || net.lte(0)) return [{ label: "Impôt", rate: defaultRate, base: taxable }];
  return [...groups.values()]
    .filter((g) => g.gain.gt(0))
    .map((g) => ({ label: g.label, rate: g.rate, base: taxable.mul(g.gain).div(totalGain) }));
}

function applyBrackets(base: Decimal, brackets: { upTo: string | null; rate: string }[]): { label: string; rate: string; base: Decimal }[] {
  const out: { label: string; rate: string; base: Decimal }[] = [];
  let remaining = base;
  let floor = ZERO;
  for (const b of brackets) {
    if (remaining.lte(0)) break;
    const ceiling = b.upTo === null ? null : D(b.upTo);
    const width = ceiling === null ? remaining : Decimal.max(ceiling.minus(floor), ZERO);
    const slice = Decimal.min(remaining, width);
    if (slice.gt(0)) out.push({ label: `Tranche jusqu'à ${ceiling === null ? "∞" : ceiling.toFixed(0)}`, rate: b.rate, base: slice });
    remaining = remaining.minus(slice);
    if (ceiling !== null) floor = ceiling;
  }
  return out;
}

export function paramsFor(rules: GainsRules, year: number): GainsYearParams {
  const known = Object.keys(rules.years).map(Number).sort((a, b) => a - b);
  const exact = rules.years[year];
  if (exact) return exact;
  const before = known.filter((y) => y <= year).pop();
  if (before !== undefined) return rules.years[before];
  return rules.years[known[0]] ?? {};
}

export function dedupeRefs(refs: LegalRef[]): LegalRef[] {
  const m = new Map<string, LegalRef>();
  for (const r of refs) m.set(`${r.jurisdiction}|${r.code}`, r);
  return [...m.values()];
}

export type { FormLine };
