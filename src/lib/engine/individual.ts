import { cents, ZERO, D, type Decimal } from "./money";
import { isLegalTender, type ValuedTx } from "./model";
import type { PriceTable } from "./valuation";
import { zonedYear } from "./tz";

/**
 * Régime des particuliers — article 150 VH bis du CGI (plus-values sur actifs
 * numériques, formulaire 2086).
 *
 *   PV = prix de cession net − prix total d'acquisition net × prix de cession net / valeur globale du portefeuille
 *
 * - seules les cessions à titre onéreux contre une monnaie ayant cours légal, ou
 *   contre un bien/service, sont imposables ; les échanges crypto ↔ crypto
 *   (stablecoins compris) sont en sursis d'imposition ;
 * - le prix de cession est réduit des frais de cession ;
 * - le prix total d'acquisition est réduit des fractions de capital initial
 *   déjà déduites lors des cessions antérieures ;
 * - exonération lorsque la somme des prix de cession de l'année ≤ 305 € ;
 * - PFU 30 % (12,8 % IR + 17,2 % PS) ou option pour le barème (12,8 % remplacé par le TMI).
 */

/*
 * Kept deliberately, although the application computes French tax through the
 * country pack's engine.
 *
 * This is the implementation written straight from article 150 VH bis, without
 * the pack framework around it, and `tests/engine/fr-cross-check.test.ts` runs
 * the same history through both and pins the results against each other. Two
 * independently written implementations agreeing on a legal formula is stronger
 * evidence than one implementation passing its own tests; the day they diverge,
 * the cross-check fails here rather than in a client's return.
 */

export interface IndividualOptions {
  /** Include acquisition fees paid in fiat in the total acquisition price (default true). */
  includeAcquisitionFees?: boolean;
  /** Tokens received for free (staking, airdrops…) enter the acquisition price at their market value when they were taxed as income on receipt (default true). */
  rewardsAtMarketValue?: boolean;
  /** Assets held outside the tracked accounts, added to the global portfolio value (asset → quantity). */
  externalHoldings?: Record<string, Decimal.Value>;
  exemptionThreshold?: Decimal.Value; // 305 €
  pfuRate?: Decimal.Value; // 0.30
  socialRate?: Decimal.Value; // 0.172
}

export interface TaxableDisposal {
  txId: string;
  date: Date;
  asset: string;
  qty: Decimal;
  /** 212 – valeur globale du portefeuille au moment de la cession */
  portfolioValueEur: Decimal;
  /** 213 – prix de cession (brut) */
  grossProceedsEur: Decimal;
  /** 214 – frais de cession */
  feesEur: Decimal;
  /** 217 – prix de cession net des frais */
  netProceedsEur: Decimal;
  /** 218 – prix total d'acquisition du portefeuille */
  totalAcquisitionEur: Decimal;
  /** 219 – fractions de capital initial déjà déduites */
  fractionsPreviouslyDeductedEur: Decimal;
  /** 220 – prix total d'acquisition net */
  netAcquisitionEur: Decimal;
  /** fraction de capital initial imputée sur cette cession */
  fractionEur: Decimal;
  /** 221 – plus ou moins-value */
  gainEur: Decimal;
  warnings: string[];
}

export interface AnnualSummary {
  year: number;
  disposals: number;
  totalProceedsEur: Decimal;
  totalGainsEur: Decimal;
  totalLossesEur: Decimal;
  netGainEur: Decimal; // gains − losses (floored at 0 for tax, losses are not carried forward)
  exempt: boolean; // total proceeds ≤ 305 €
  taxablePfuEur: Decimal;
  estimatedTaxPfuEur: Decimal; // 30 %
  estimatedSocialOnlyEur: Decimal; // 17,2 % (if option barème with 0 % IR)
}

export interface IndividualResult {
  disposals: TaxableDisposal[];
  years: AnnualSummary[];
  totalAcquisitionEur: Decimal;
  warnings: string[];
}

export function computeIndividualTax(valued: ValuedTx[], prices: PriceTable, opts: IndividualOptions = {}): IndividualResult {
  const includeFees = opts.includeAcquisitionFees ?? true;
  const rewardsAtMarket = opts.rewardsAtMarketValue ?? true;
  const threshold = D(opts.exemptionThreshold ?? 305);
  const pfu = D(opts.pfuRate ?? "0.30");
  const social = D(opts.socialRate ?? "0.172");
  const external = new Map(Object.entries(opts.externalHoldings ?? {}).map(([k, v]) => [k.toUpperCase(), D(v)]));

  const sorted = [...valued].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  const holdings = new Map<string, Decimal>();
  const warnings: string[] = [];
  const disposals: TaxableDisposal[] = [];
  let totalAcquisition = ZERO;
  let fractionsDeducted = ZERO;

  const portfolioValue = (at: Date, txWarnings: string[]): Decimal => {
    let total = ZERO;
    const all = new Map<string, Decimal>();
    for (const [a, q] of holdings) all.set(a, q);
    for (const [a, q] of external) all.set(a, (all.get(a) ?? ZERO).plus(q));
    for (const [asset, qty] of all) {
      if (qty.lte("1e-12") || isLegalTender(asset)) continue;
      const q = prices.get(asset, at);
      if (!q) { txWarnings.push(`Cours manquant pour ${asset} : valeur globale du portefeuille sous-estimée`); continue; }
      total = total.plus(qty.mul(q.priceEur));
    }
    return total;
  };

  for (const tx of sorted) {
    const ins = tx.legs.filter((l) => l.role === "IN");
    const outs = tx.legs.filter((l) => l.role === "OUT");
    const fees = tx.legs.filter((l) => l.role === "FEE");
    const txWarnings: string[] = [];

    // --- acquisitions against legal tender ---------------------------------
    if (tx.type === "TRADE" && outs.length && ins.length) {
      const out = outs[0], inn = ins[0];
      const outFiat = isLegalTender(out.asset), inFiat = isLegalTender(inn.asset);
      if (outFiat && !inFiat) {
        let price = out.valueEur;
        if (includeFees) price = price.plus(fees.filter((f) => isLegalTender(f.asset)).reduce((a, f) => a.plus(f.valueEur), ZERO));
        totalAcquisition = totalAcquisition.plus(price);
      } else if (!outFiat && inFiat) {
        // --- taxable disposal: crypto -> fiat --------------------------------
        const V = portfolioValue(tx.timestamp, txWarnings);
        const gross = inn.valueEur;
        const feeEur = fees.reduce((a, f) => a.plus(f.valueEur), ZERO);
        const net = gross.minus(feeEur);
        disposals.push(makeDisposal(tx, out.asset, out.amount, V, gross, feeEur, net, txWarnings));
      }
      // crypto -> crypto: sursis d'imposition, nothing to do
    } else if (tx.type === "CRYPTO_WITHDRAWAL" && outs.length && tx.category === "PURCHASE_GOODS") {
      // --- taxable disposal: crypto -> goods / services ---------------------
      const out = outs[0];
      const V = portfolioValue(tx.timestamp, txWarnings);
      const gross = out.valueEur;
      const feeEur = fees.reduce((a, f) => a.plus(f.valueEur), ZERO);
      disposals.push(makeDisposal(tx, out.asset, out.amount, V, gross, feeEur, gross.minus(feeEur), txWarnings));
    } else if ((tx.type === "REWARD" || (tx.type === "CRYPTO_DEPOSIT" && ["STAKING_INCOME", "AIRDROP", "CUSTOMER_RECEIPT"].includes(tx.category))) && ins.length) {
      if (rewardsAtMarket) totalAcquisition = totalAcquisition.plus(ins[0].valueEur);
    }

    // --- update holdings ----------------------------------------------------
    for (const leg of tx.legs) {
      const key = leg.asset.toUpperCase();
      const cur = holdings.get(key) ?? ZERO;
      holdings.set(key, leg.role === "IN" ? cur.plus(leg.amount) : cur.minus(leg.amount));
    }
  }

  function makeDisposal(tx: ValuedTx, asset: string, qty: Decimal, V: Decimal, gross: Decimal, feeEur: Decimal, net: Decimal, txWarnings: string[]): TaxableDisposal {
    const netAcq = totalAcquisition.minus(fractionsDeducted);
    let fraction = ZERO;
    if (V.gt(0)) fraction = netAcq.mul(net).div(V);
    else txWarnings.push("Valeur globale du portefeuille nulle ou inconnue : fraction de capital initial non calculable");
    if (fraction.gt(netAcq) && netAcq.gt(0)) fraction = netAcq; // cannot deduct more than what remains
    const gain = net.minus(fraction);
    const d: TaxableDisposal = {
      txId: tx.id, date: tx.timestamp, asset: asset.toUpperCase(), qty,
      portfolioValueEur: V, grossProceedsEur: gross, feesEur: feeEur, netProceedsEur: net,
      totalAcquisitionEur: totalAcquisition, fractionsPreviouslyDeductedEur: fractionsDeducted, netAcquisitionEur: netAcq,
      fractionEur: fraction, gainEur: gain, warnings: txWarnings,
    };
    fractionsDeducted = fractionsDeducted.plus(fraction);
    return d;
  }

  const byYear = new Map<number, TaxableDisposal[]>();
  for (const d of disposals) {
    const y = zonedYear(d.date);
    byYear.set(y, [...(byYear.get(y) ?? []), d]);
  }
  const years: AnnualSummary[] = [...byYear.entries()].sort((a, b) => a[0] - b[0]).map(([year, ds]) => {
    const totalProceeds = ds.reduce((a, d) => a.plus(d.grossProceedsEur), ZERO);
    const gains = ds.filter((d) => d.gainEur.gt(0)).reduce((a, d) => a.plus(d.gainEur), ZERO);
    const losses = ds.filter((d) => d.gainEur.lt(0)).reduce((a, d) => a.plus(d.gainEur.abs()), ZERO);
    const net = gains.minus(losses);
    const exempt = totalProceeds.lte(threshold);
    const taxable = exempt || net.lte(0) ? ZERO : net;
    return {
      year, disposals: ds.length, totalProceedsEur: totalProceeds, totalGainsEur: gains, totalLossesEur: losses, netGainEur: net, exempt,
      taxablePfuEur: cents(taxable), estimatedTaxPfuEur: cents(taxable.mul(pfu)), estimatedSocialOnlyEur: cents(taxable.mul(social)),
    };
  });
  for (const d of disposals) for (const w of d.warnings) warnings.push(`${d.date.toISOString().slice(0, 10)} ${d.asset}: ${w}`);
  return { disposals, years, totalAcquisitionEur: totalAcquisition, warnings };
}
