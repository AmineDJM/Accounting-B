import { D, ZERO, type Decimal } from "@/lib/engine/money";
import { isMoney } from "@/lib/engine/tax/events";
import { unitInEur } from "@/lib/engine/fx";
import type { ValuedTx } from "@/lib/engine/model";
import type { PriceTable } from "@/lib/engine/valuation";
import { zonedYear } from "@/lib/engine/tz";
import { RRPT_THRESHOLD_USD, type Dac8Bucket } from "./types";

/**
 * Recomputes, from the imported transaction history, the very aggregates a
 * provider reports under CARF. Comparing the two is the point: the tax
 * administration receives the provider's figures, so a taxpayer wants to know
 * where their own books diverge before a control does.
 *
 * **Fees are the trap.** The directive and the schema do not say the same
 * thing. DAC8, annex VI, section II, B(3)(b) and (c) require the "aggregate
 * gross amount paid" and the "aggregate gross amount received", and points (d)
 * to (i) simply require a fair market value. The OECD CARF XML schema v1.5 adds
 * "net of transaction fees" to every one of the eight elements. Both figures are
 * therefore computed and kept; the engine reports one of them and can show the
 * other, so a divergence of exactly the fees is named as such instead of being
 * chased as an error.
 *
 * Two further rules drive the arithmetic:
 *  - a payment for goods or services above USD 50 000 is an RRPT and is then
 *    **not** counted again as an outbound transfer (CARF603 is expressly
 *    reserved for payments other than those reported as RRPT);
 *  - `TransferWallet` repeats the part of the outbound transfers that goes to
 *    an address not known to belong to a provider, and carries no count.
 */
export type FeeTreatment = "NET" | "GROSS";

export interface ComputedBucket {
  asset: string;
  bucket: Dac8Bucket;
  count: number;
  units: Decimal;
  /** The amount under the treatment asked for. */
  amount: Decimal;
  /** Before any fee adjustment: the wording of the directive. */
  amountGross: Decimal;
  /** After the fee adjustment: the wording of the XML schema. */
  amountNet: Decimal;
  /** Fees attributed to this bucket, the whole difference between the two. */
  fees: Decimal;
  txIds: string[];
}

export interface ComputedAggregates {
  year: number;
  feeTreatment: FeeTreatment;
  buckets: ComputedBucket[];
  /** Outside CARF, kept for the domestic statements that do ask for one. */
  holdings: { asset: string; units: Decimal }[];
  /** Threshold actually applied for RRPT, expressed in the books' currency. */
  rrptThreshold: { amount: Decimal; source: string } | null;
  notes: string[];
}

export interface AggregateOptions {
  accountIds?: string[];
  /** Defaults to NET, the wording of the CARF XML schema that providers populate. */
  feeTreatment?: FeeTreatment;
  /**
   * Price table used to convert the USD 50 000 RRPT threshold into the books'
   * currency. Without it, no transaction is classified as an RRPT and a note
   * says so rather than the engine silently guessing.
   */
  prices?: PriceTable;
  /** Currency the valued transactions are expressed in. */
  currency?: string;
}

/** Amounts reported under CARF are never negative: a fee larger than the leg floors at zero. */
const floorZero = (v: Decimal): Decimal => (v.lt(0) ? ZERO : v);

export function computeDac8Aggregates(valued: ValuedTx[], year: number, options: AggregateOptions | string[] = {}): ComputedAggregates {
  const opts: AggregateOptions = Array.isArray(options) ? { accountIds: options } : options;
  const accountIds = opts.accountIds;
  const feeTreatment = opts.feeTreatment ?? "NET";
  const currency = (opts.currency ?? "EUR").toUpperCase();
  const notes: string[] = [];

  // --- RRPT threshold, converted once at mid-year --------------------------
  let rrptThreshold: ComputedAggregates["rrptThreshold"] = null;
  if (currency === "USD") {
    rrptThreshold = { amount: D(RRPT_THRESHOLD_USD), source: "seuil CARF exprimé en USD" };
  } else if (opts.prices) {
    const mid = new Date(Date.UTC(year, 5, 30));
    const usd = unitInEur(opts.prices, "USD", mid);
    const base = currency === "EUR" ? { value: D(1), source: "base" } : unitInEur(opts.prices, currency, mid);
    if (usd && base && !base.value.isZero()) {
      rrptThreshold = { amount: D(RRPT_THRESHOLD_USD).mul(usd.value).div(base.value), source: `USD/${currency} au 30/06/${year} — ${usd.source}` };
    }
  }
  if (!rrptThreshold) {
    notes.push(`Le seuil de 50 000 USD des paiements de détail déclarables n'a pas pu être converti en ${currency} : aucun paiement n'est classé en RRPT et les règlements en biens et services restent en CryptoTransferOut.`);
  }

  const buckets = new Map<string, ComputedBucket>();
  const holdings = new Map<string, Decimal>();
  const add = (asset: string, bucket: Dac8Bucket, units: Decimal, gross: Decimal, fees: Decimal, txId: string) => {
    const key = `${asset.toUpperCase()}|${bucket}`;
    const b = buckets.get(key) ?? { asset: asset.toUpperCase(), bucket, count: 0, units: ZERO, amount: ZERO, amountGross: ZERO, amountNet: ZERO, fees: ZERO, txIds: [] };
    b.count += 1;
    b.units = b.units.plus(units);
    b.amountGross = b.amountGross.plus(floorZero(gross));
    b.fees = b.fees.plus(fees);
    b.amountNet = floorZero(b.amountGross.minus(b.fees));
    b.amount = feeTreatment === "NET" ? b.amountNet : b.amountGross;
    if (b.txIds.length < 500) b.txIds.push(txId);
    buckets.set(key, b);
  };

  for (const tx of valued) {
    if (accountIds && accountIds.length && !accountIds.includes(tx.accountId)) continue;
    const txYear = zonedYear(tx.timestamp);

    if (txYear <= year) {
      for (const l of tx.legs) {
        if (isMoney(l.asset)) continue;
        const k = l.asset.toUpperCase();
        holdings.set(k, (holdings.get(k) ?? ZERO).plus(l.role === "IN" ? l.amount : l.amount.neg()));
      }
    }
    if (txYear !== year) continue;

    const ins = tx.legs.filter((l) => l.role === "IN");
    const outs = tx.legs.filter((l) => l.role === "OUT");
    const cryptoIns = ins.filter((l) => !isMoney(l.asset));
    const cryptoOuts = outs.filter((l) => !isMoney(l.asset));
    const fee = tx.feeValueEur ?? ZERO;

    switch (tx.type) {
      case "TRADE": {
        const fiatOut = outs.filter((l) => isMoney(l.asset));
        const fiatIn = ins.filter((l) => isMoney(l.asset));
        const againstFiat = fiatOut.length > 0 || fiatIn.length > 0;
        const fiatPaid = fiatOut.reduce((a, f) => a.plus(f.valueEur), ZERO);
        const fiatReceived = fiatIn.reduce((a, f) => a.plus(f.valueEur), ZERO);

        // Acquisitions. Against fiat the amount is the consideration paid; the
        // gross figure adds the fee back, because that is what actually left
        // the account. Against crypto it is the fair market value acquired.
        const inTotal = cryptoIns.reduce((a, l) => a.plus(l.valueEur), ZERO);
        for (const l of cryptoIns) {
          const share = inTotal.isZero() ? ZERO : l.valueEur.div(inTotal);
          const feeShare = fee.mul(share);
          const consideration = againstFiat && fiatOut.length ? fiatPaid.mul(share) : l.valueEur;
          add(l.asset, againstFiat ? "CryptoFiatIn" : "CryptotoCryptoIn", l.amount, againstFiat ? consideration.plus(feeShare) : consideration, feeShare, tx.id);
        }

        // Disposals. Against fiat the gross figure is what the sale produced
        // before the provider took its fee.
        const outTotal = cryptoOuts.reduce((a, l) => a.plus(l.valueEur), ZERO);
        for (const l of cryptoOuts) {
          const share = outTotal.isZero() ? ZERO : l.valueEur.div(outTotal);
          const feeShare = fee.mul(share);
          const consideration = againstFiat && fiatIn.length ? fiatReceived.mul(share) : l.valueEur;
          add(l.asset, againstFiat ? "CryptoFiatOut" : "CryptotoCryptoOut", l.amount, consideration, feeShare, tx.id);
        }
        break;
      }

      case "CRYPTO_DEPOSIT":
      case "REWARD": {
        const total = cryptoIns.reduce((a, l) => a.plus(l.valueEur), ZERO);
        for (const l of cryptoIns) {
          const share = total.isZero() ? ZERO : l.valueEur.div(total);
          add(l.asset, "CryptoTransferIn", l.amount, l.valueEur, fee.mul(share), tx.id);
        }
        break;
      }

      case "CRYPTO_WITHDRAWAL": {
        const total = cryptoOuts.reduce((a, l) => a.plus(l.valueEur), ZERO);
        const unhosted = tx.counterparty ? tx.counterparty.kind !== "EXCHANGE" && tx.counterparty.kind !== "BANK" : false;
        for (const l of cryptoOuts) {
          const share = total.isZero() ? ZERO : l.valueEur.div(total);
          const feeShare = fee.mul(share);
          const net = floorZero(l.valueEur.minus(feeShare));
          const isPayment = tx.category === "PURCHASE_GOODS";
          const isRrpt = isPayment && rrptThreshold !== null && net.gt(rrptThreshold.amount);
          // CARF603 is reserved for payments *other* than those reported as
          // RRPT, so a payment above the threshold leaves CryptoTransferOut.
          add(l.asset, isRrpt ? "RRPT" : "CryptoTransferOut", l.amount, l.valueEur, feeShare, tx.id);
          if (unhosted && !isRrpt) add(l.asset, "TransferWallet", l.amount, l.valueEur, feeShare, tx.id);
        }
        break;
      }

      default:
        break;
    }
  }

  const list = [...buckets.values()];
  if (list.some((b) => b.bucket === "TransferWallet")) {
    notes.push("TransferWallet reprend la part des transferts sortants adressés à une adresse que le prestataire ne rattache pas à un prestataire de services sur actifs virtuels : ces montants figurent déjà dans CryptoTransferOut et ne doivent pas être additionnés.");
  }
  const totalFees = list.reduce((a, b) => a.plus(b.fees), ZERO);
  if (totalFees.gt(0)) {
    notes.push(
      feeTreatment === "NET"
        ? `Montants nets de frais, conformément au schéma XML CARF v1.5. La directive DAC8 retient pour sa part le « montant brut payé » et le « montant brut reçu » : l'écart avec un relevé établi en brut vaut ${totalFees.toFixed(2)} ${currency} sur l'année.`
        : `Montants bruts, conformément à la rédaction de la directive DAC8. Le schéma XML CARF v1.5 retient des montants nets de frais : l'écart avec un relevé établi en net vaut ${totalFees.toFixed(2)} ${currency} sur l'année.`,
    );
  }

  return {
    year,
    feeTreatment,
    buckets: list.sort((a, b) => a.asset.localeCompare(b.asset) || a.bucket.localeCompare(b.bucket)),
    holdings: [...holdings.entries()].filter(([, q]) => q.abs().gt("1e-12")).map(([asset, units]) => ({ asset, units })).sort((a, b) => a.asset.localeCompare(b.asset)),
    rrptThreshold,
    notes,
  };
}

export const toDecimal = (v: string | number | null | undefined): Decimal | null => (v === null || v === undefined || v === "" ? null : D(v));
