import { D, ZERO, cents, Decimal } from "../money";
import { collectRefs, count, date, money, qty as qtyVal, step, text, type TraceStep } from "../trace";
import { buildEconomicEvents, isMoney } from "./events";
import { dedupeRefs, paramsFor } from "./gains";
import type { IncomeItem, TaxComputationInput, TaxComputationResult, TaxableEvent, YearSummary } from "./types";
import type { CountryPack, GainsRules } from "@/lib/countries/types";
import { pick } from "@/lib/countries/types";
import { zonedYear } from "../tz";

/**
 * France — article 150 VH bis of the Code général des impôts.
 *
 * Unlike every other country in the pack, a French disposal is not priced
 * against the lots sold but against the whole portfolio:
 *
 *   PV = prix de cession net − prix total d'acquisition net × prix de cession net / valeur globale du portefeuille
 *
 * The "prix total d'acquisition" accumulates every euro (and every taxed
 * receipt) ever put into the portfolio, less the fractions of initial capital
 * already deducted by earlier disposals. Only disposals against legal tender
 * or against a good or a service are taxable: swaps between digital assets,
 * stablecoins included, stay in abeyance.
 */
const REFS = {
  art150: { jurisdiction: "FR" as const, code: "CGI, art. 150 VH bis", title: "Plus-values de cession d'actifs numériques des particuliers", url: "https://www.legifrance.gouv.fr/codes/id/LEGISCTA000037943257/", asOf: "2026-01-01" },
  pfu: { jurisdiction: "FR" as const, code: "CGI, art. 200 C", title: "Imposition au taux forfaitaire de 12,8 % et option pour le barème", url: "https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000046860518", asOf: "2026-01-01" },
  social: { jurisdiction: "FR" as const, code: "CSS, art. L136-6 et L136-8", title: "Prélèvements sociaux de 17,2 %", asOf: "2026-01-01" },
  form: { jurisdiction: "FR" as const, code: "Formulaire n° 2086", title: "Déclaration des plus-values de cessions d'actifs numériques", url: "https://www.impots.gouv.fr/formulaire/2086/declaration-des-plus-values-de-cession-dactifs-numeriques", asOf: "2026-01-01" },
};

export function frEngine(input: TaxComputationInput, pack: CountryPack): TaxComputationResult {
  const rules = pack.individual as GainsRules;
  const cur = input.currency;
  const locale = "fr";
  const warnings: TaxComputationResult["warnings"] = [];
  const assumptions = [
    "La valeur globale du portefeuille est calculée à partir des comptes importés et des avoirs externes déclarés : tout actif numérique non déclaré la sous-estime et majore la plus-value imposable.",
    "Les revenus reçus en jetons (staking, airdrops, encaissements clients) sont ajoutés au prix total d'acquisition pour leur valeur imposée à la réception.",
  ];
  const events: TaxableEvent[] = [];
  const income: IncomeItem[] = [];

  const holdings = new Map<string, Decimal>();
  for (const [a, q] of Object.entries(input.externalHoldings ?? {})) holdings.set(a.toUpperCase(), D(q));
  let totalAcquisition = ZERO;
  let fractionsDeducted = ZERO;
  let seq = 0;

  const portfolioValue = (at: Date, notes: string[]): { value: Decimal; lines: { asset: string; qty: Decimal; price: Decimal }[] } => {
    let total = ZERO;
    const lines: { asset: string; qty: Decimal; price: Decimal }[] = [];
    for (const [asset, q] of holdings) {
      if (q.lte("1e-12") || isMoney(asset)) continue;
      const quote = input.prices.get(asset, at);
      if (!quote) { notes.push(`Cours manquant pour ${asset}`); continue; }
      total = total.plus(q.mul(quote.priceEur));
      lines.push({ asset, qty: q, price: quote.priceEur });
    }
    lines.sort((a, b) => b.qty.mul(b.price).comparedTo(a.qty.mul(a.price)));
    return { value: total, lines };
  };

  const economic = buildEconomicEvents(input.valued, { feeAssetIsDisposal: false, capitaliseAcquisitionFees: false });

  for (const ev of economic) {
    if (ev.kind === "ACQUIRE") {
      // Acquisitions paid in legal tender increase the total acquisition price.
      if (ev.counterAsset && isMoney(ev.counterAsset)) totalAcquisition = totalAcquisition.plus(ev.costBase);
      holdings.set(ev.asset.toUpperCase(), (holdings.get(ev.asset.toUpperCase()) ?? ZERO).plus(ev.qty));
      continue;
    }
    if (ev.kind === "INCOME") {
      totalAcquisition = totalAcquisition.plus(ev.valueBase);
      income.push({
        id: `I${++seq}`, txId: ev.txId, date: ev.at, asset: ev.asset, qty: ev.qty, valueBase: ev.valueBase, incomeKind: ev.incomeKind,
        category: pick(rules.income.category, locale), taxable: rules.income.taxedAtReceipt,
        trace: step(`fr-income-${seq}`, "Jetons reçus à titre gratuit ou en rémunération", {
          inputs: [qtyVal("Quantité", ev.qty.toString(), ev.asset, ev.txId), money("Valeur au jour de la réception", ev.valueBase.toString(), cur)],
          output: money("Ajouté au prix total d'acquisition", ev.valueBase.toString(), cur),
          note: "Les revenus de staking et assimilés relèvent en principe des BNC ; leur valeur à la réception entre dans le prix total d'acquisition du portefeuille.",
          refs: [REFS.art150],
        }),
      });
      continue;
    }
    if (ev.kind === "TRANSFER") continue;

    // --- disposal ---------------------------------------------------------
    const key = ev.asset.toUpperCase();
    holdings.set(key, (holdings.get(key) ?? ZERO).minus(ev.qty));
    const taxableKind = ev.disposalKind === "FIAT" || ev.disposalKind === "GOODS";
    if (!taxableKind) {
      events.push({
        id: `E${++seq}`, txId: ev.txId, date: ev.at, asset: ev.asset, qty: ev.qty, disposalKind: ev.disposalKind, counterAsset: ev.counterAsset,
        proceeds: ev.proceedsBase, fees: ev.feesBase, netProceeds: ev.proceedsBase, costBasis: ZERO, gain: ZERO, exempt: true,
        exemptReason: ev.disposalKind === "CRYPTO" ? "Échange entre actifs numériques : sursis d'imposition (art. 150 VH bis, II-A)." : "Opération non imposable.",
        extra: {}, warnings: [],
        trace: step(`fr-defer-${seq}`, `Échange de ${ev.qty.toString()} ${ev.asset}`, {
          inputs: [date("Date", ev.at, ev.txId), text("Contrepartie", ev.counterAsset ?? "—"), money("Valeur", ev.proceedsBase.toString(), cur)],
          output: text("Résultat", "sursis d'imposition"),
          note: "Les échanges entre actifs numériques, stablecoins compris, ne déclenchent pas d'imposition.",
          refs: [REFS.art150],
        }),
      });
      continue;
    }

    const notes: string[] = [];
    const pf = portfolioValue(ev.at, notes);
    // The portfolio is valued including the assets being sold, before the disposal.
    const beforeQty = (holdings.get(key) ?? ZERO).plus(ev.qty);
    const quote = input.prices.get(key, ev.at);
    let V = pf.value;
    if (quote) V = V.plus(ev.qty.mul(quote.priceEur));
    void beforeQty;

    const gross = ev.proceedsBase;
    const fees = ev.feesBase;
    const net = gross.minus(fees);
    const netAcq = totalAcquisition.minus(fractionsDeducted);
    let fraction = ZERO;
    if (V.gt(0)) fraction = netAcq.mul(net).div(V);
    else notes.push("Valeur globale du portefeuille nulle ou inconnue : la fraction de capital initial n'a pas pu être calculée.");
    if (fraction.gt(netAcq) && netAcq.gt(0)) fraction = netAcq;
    const gain = net.minus(fraction);

    const trace = step(`fr-disposal-${seq + 1}`, `Cession de ${ev.qty.toString()} ${ev.asset} le ${ev.at.toISOString().slice(0, 10)}`, {
      formula: "PV = prix de cession net − prix total d'acquisition net × prix de cession net / valeur globale du portefeuille",
      inputs: [
        date("Date", ev.at, ev.txId),
        text("Nature", ev.disposalKind === "FIAT" ? "cession contre monnaie ayant cours légal" : "paiement d'un bien ou d'un service"),
      ],
      output: money("Plus ou moins-value (case 221)", gain.toString(), cur),
      refs: [REFS.art150, REFS.form],
      steps: [
        step(`fr-proceeds-${seq + 1}`, "Prix de cession net (cases 213, 214, 217)", {
          formula: "prix de cession net = prix de cession − frais de cession",
          inputs: [money("Prix de cession", gross.toString(), cur), money("Frais de cession", fees.toString(), cur)],
          output: money("Prix de cession net", net.toString(), cur),
        }),
        step(`fr-portfolio-${seq + 1}`, "Valeur globale du portefeuille (case 212)", {
          formula: "somme des actifs numériques détenus, valorisés au cours du jour de la cession",
          inputs: pf.lines.slice(0, 15).map((l) => ({ label: l.asset, value: `${l.qty.toFixed(8).replace(/0+$/, "")} × ${l.price.toFixed(2)} ${cur}`, raw: l.qty.mul(l.price).toString(), unit: "MONEY" as const, currency: cur })),
          output: money("Valeur globale", V.toString(), cur),
          warning: notes.length ? notes.join(" ") : undefined,
          note: "Le portefeuille est évalué immédiatement avant la cession, tous actifs numériques confondus, y compris ceux détenus hors des comptes importés.",
        }),
        step(`fr-acq-${seq + 1}`, "Prix total d'acquisition net (cases 218, 219, 220)", {
          formula: "PTA net = prix total d'acquisition − fractions de capital initial déjà déduites",
          inputs: [money("Prix total d'acquisition", totalAcquisition.toString(), cur), money("Fractions déjà déduites", fractionsDeducted.toString(), cur)],
          output: money("Prix total d'acquisition net", netAcq.toString(), cur),
        }),
        step(`fr-fraction-${seq + 1}`, "Fraction de capital initial imputée", {
          formula: "fraction = PTA net × prix de cession net / valeur globale",
          inputs: [money("PTA net", netAcq.toString(), cur), money("Prix de cession net", net.toString(), cur), money("Valeur globale", V.toString(), cur)],
          output: money("Fraction imputée", fraction.toString(), cur),
        }),
      ],
    });

    fractionsDeducted = fractionsDeducted.plus(fraction);
    events.push({
      id: `E${++seq}`, txId: ev.txId, date: ev.at, asset: ev.asset, qty: ev.qty, disposalKind: ev.disposalKind, counterAsset: ev.counterAsset,
      proceeds: gross, fees, netProceeds: net, costBasis: fraction, gain, exempt: false,
      extra: { portfolioValue: V.toString(), totalAcquisition: totalAcquisition.toString(), fractionsDeducted: fractionsDeducted.minus(fraction).toString(), netAcquisition: netAcq.toString() },
      warnings: notes,
      trace,
    });
    for (const n of notes) warnings.push({ level: "warning", txId: ev.txId, message: n });
  }

  const years = summariseFr(events, income, rules, cur, locale, input);
  return {
    country: "FR",
    currency: cur,
    regime: "FR_150VHBIS",
    regimeLabel: "Plus-values de cession d'actifs numériques (art. 150 VH bis CGI)",
    events, income, years, wealth: [],
    warnings,
    refs: dedupeRefs([...Object.values(REFS), ...collectRefs(years.map((y) => y.trace))]),
    assumptions,
    computedAt: input.now ?? new Date(),
  };
}

function summariseFr(events: TaxableEvent[], income: IncomeItem[], rules: GainsRules, cur: string, locale: string, input: TaxComputationInput): YearSummary[] {
  const years = [...new Set([...events.map((e) => zonedYear(e.date)), ...income.map((i) => zonedYear(i.date))])].sort((a, b) => a - b).filter((y) => !input.years || input.years.includes(y));
  const out: YearSummary[] = [];
  for (const year of years) {
    const params = paramsFor(rules, year);
    const taxed = events.filter((e) => zonedYear(e.date) === year && !e.exempt);
    const all = events.filter((e) => zonedYear(e.date) === year);
    const grossProceeds = taxed.reduce((a, e) => a.plus(e.proceeds), ZERO);
    const gains = taxed.filter((e) => e.gain.gt(0)).reduce((a, e) => a.plus(e.gain), ZERO);
    const losses = taxed.filter((e) => e.gain.lt(0)).reduce((a, e) => a.plus(e.gain.abs()), ZERO);
    const net = gains.minus(losses);
    const steps: TraceStep[] = [];
    const notes: string[] = [];

    steps.push(step(`fr-y${year}-events`, "Cessions imposables de l'année", {
      inputs: [count("Cessions imposables", taxed.length), count("Échanges en sursis", all.length - taxed.length), money("Total des prix de cession", grossProceeds.toString(), cur)],
      output: money("Plus-values − moins-values", net.toString(), cur),
    }));

    const threshold = params.proceedsThreshold ? D(params.proceedsThreshold.amount) : D(305);
    const exempt = grossProceeds.lte(threshold);
    steps.push(step(`fr-y${year}-threshold`, "Seuil d'exonération", {
      formula: "exonération si la somme des prix de cession de l'année ≤ 305 €",
      inputs: [money("Somme des prix de cession", grossProceeds.toString(), cur), money("Seuil", threshold.toString(), cur)],
      output: text("Résultat", exempt ? "exonéré" : "imposable"),
      refs: [REFS.art150],
    }));

    const taxable = exempt || net.lte(0) ? ZERO : net;
    const breakdown: YearSummary["taxBreakdown"] = [];
    if (taxable.gt(0)) {
      for (const c of params.components ?? []) breakdown.push({ label: pick(c.label, locale), amount: taxable.mul(D(c.rate)), rate: c.rate });
      steps.push(step(`fr-y${year}-tax`, "Imposition", {
        formula: "PFU 30 % = 12,8 % d'impôt sur le revenu + 17,2 % de prélèvements sociaux",
        inputs: [money("Base imposable (case 3AN)", taxable.toString(), cur), ...breakdown.map((b) => ({ label: b.label, value: `${cents(b.amount).toFixed(2)} ${cur}`, raw: b.amount.toString(), unit: "MONEY" as const, currency: cur }))],
        output: money("Total estimé", breakdown.reduce((a, b) => a.plus(b.amount), ZERO).toString(), cur),
        refs: [REFS.pfu, REFS.social],
        warning: "L'option pour le barème progressif, globale pour tous les revenus de capitaux mobiliers du foyer, n'est pas simulée ici.",
      }));
    }
    if (net.lt(0)) notes.push("Moins-value nette : imputable uniquement sur les plus-values de même nature réalisées la même année, sans report sur les années suivantes.");
    if (exempt && net.gt(0)) notes.push("Plus-value non imposable : le total des cessions de l'année reste sous 305 €. La déclaration 2086 reste recommandée.");

    const incomeYear = income.filter((i) => zonedYear(i.date) === year);
    const incomeTotal = incomeYear.reduce((a, i) => a.plus(i.valueBase), ZERO);

    const formLines = [
      // The article prices each disposal against the portfolio value of that
      // day, so this box holds one figure per disposal and no yearly total.
      { form: "2086", box: "212", label: "Valeur globale du portefeuille", value: "une valeur par cession, voir le détail", kind: "TEXT" as const, note: "renseignée cession par cession" },
      { form: "2086", box: "213", label: "Prix de cession", value: cents(grossProceeds).toFixed(2), raw: grossProceeds.toString() },
      { form: "2086", box: "221", label: "Plus ou moins-value de l'année", value: cents(net).toFixed(2), raw: net.toString() },
      { form: "2042 C", box: "3AN", label: "Plus-value imposable", value: cents(taxable).toFixed(2), raw: taxable.toString() },
      { form: "2042 C", box: "3BN", label: "Moins-value de l'année", value: cents(net.lt(0) ? net.abs() : ZERO).toFixed(2), raw: net.lt(0) ? net.abs().toString() : "0" },
    ];

    out.push({
      year, currency: cur, disposalCount: taxed.length, grossProceeds, gains, losses, netGain: net,
      taxableBase: cents(taxable),
      estimatedTax: taxable.gt(0) ? cents(breakdown.reduce((a, b) => a.plus(b.amount), ZERO)) : ZERO,
      taxBreakdown: breakdown.map((b) => ({ ...b, amount: cents(b.amount) })),
      incomeTotal: cents(incomeTotal), incomeTaxable: cents(incomeTotal),
      lossCarryForward: ZERO,
      notes, formLines,
      trace: step(`fr-year-${year}`, `Année ${year}`, { steps, output: money("Base imposable", taxable.toString(), cur) }),
    });
  }
  return out;
}
