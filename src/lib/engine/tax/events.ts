import { ZERO, type Decimal } from "../money";
import { isFiat, FIAT_WRAPPERS, type ValuedTx, type ValuedLeg } from "../model";
import type { DisposalKind, EconomicEvent, IncomeKind } from "./types";

/**
 * Turns valued transactions into a chronological stream of economic events.
 *
 * No tax rule is applied here: the stream says what happened (an asset came in
 * against something, an asset went out against something, income was received),
 * and each country engine decides which of those events it taxes.
 */
export interface EventOptions {
  /** Treat a fee paid in crypto as a disposal of that crypto (economically it is). */
  feeAssetIsDisposal?: boolean;
  /** Add acquisition fees to the cost of the asset acquired. */
  capitaliseAcquisitionFees?: boolean;
  /** Wallet identifier to use when a transaction has no account attached. */
  defaultWallet?: string;
}

const INCOME_CATEGORIES: Record<string, IncomeKind> = {
  STAKING_INCOME: "STAKING",
  AIRDROP: "AIRDROP",
  GIFT_RECEIVED: "OTHER",
  FOUND: "OTHER",
};

/** Legal-tender currencies are money; stablecoins are crypto-assets. */
export const isMoney = (asset: string): boolean => isFiat(asset) && !FIAT_WRAPPERS[asset.toUpperCase()];

export function buildEconomicEvents(valued: ValuedTx[], opts: EventOptions = {}): EconomicEvent[] {
  const feeIsDisposal = opts.feeAssetIsDisposal ?? true;
  const capitalise = opts.capitaliseAcquisitionFees ?? true;
  const out: EconomicEvent[] = [];
  const sorted = [...valued].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  for (const tx of sorted) {
    const wallet = tx.accountId || opts.defaultWallet || "*";
    const ins = tx.legs.filter((l) => l.role === "IN");
    const outs = tx.legs.filter((l) => l.role === "OUT");
    const fees = tx.legs.filter((l) => l.role === "FEE");
    const feeTotal = fees.reduce((a, f) => a.plus(f.valueEur), ZERO);
    const src = tx.source;

    const pushFees = (attachedTo?: string) => {
      for (const f of fees) {
        if (isMoney(f.asset)) continue; // paying a fee in euros is not a disposal of an asset
        if (!feeIsDisposal) continue;
        out.push({ kind: "DISPOSE", txId: tx.id, at: tx.timestamp, asset: f.asset, qty: f.amount, proceedsBase: f.valueEur, feesBase: ZERO, disposalKind: "FEE", counterAsset: attachedTo, wallet, source: src, note: "frais" });
      }
    };

    switch (tx.type) {
      case "FIAT_DEPOSIT":
      case "FIAT_WITHDRAWAL":
        // moving legal tender in or out of the platform is not an event on crypto-assets
        break;

      case "TRADE": {
        const inn = ins[0], o = outs[0];
        if (!inn || !o) break;
        const counterKind: DisposalKind = isMoney(inn.asset) ? "FIAT" : "CRYPTO";
        for (const l of outs) {
          if (isMoney(l.asset)) continue;
          out.push({ kind: "DISPOSE", txId: tx.id, at: tx.timestamp, asset: l.asset, qty: l.amount, proceedsBase: l.valueEur, feesBase: shareOf(feeTotal, l, outs), disposalKind: counterKind, counterAsset: inn.asset, wallet, source: src });
        }
        for (const l of ins) {
          if (isMoney(l.asset)) continue;
          const extra = capitalise ? shareOf(feeTotal, l, ins) : ZERO;
          out.push({ kind: "ACQUIRE", txId: tx.id, at: tx.timestamp, asset: l.asset, qty: l.amount, costBase: l.valueEur.plus(extra), counterAsset: o.asset, wallet, source: src });
        }
        pushFees(inn.asset);
        break;
      }

      case "REWARD": {
        for (const l of ins) {
          const kind = INCOME_CATEGORIES[tx.category] ?? "STAKING";
          out.push({ kind: "INCOME", txId: tx.id, at: tx.timestamp, asset: l.asset, qty: l.amount, valueBase: l.valueEur, incomeKind: kind, wallet, source: src, note: tx.note });
          out.push({ kind: "ACQUIRE", txId: tx.id, at: tx.timestamp, asset: l.asset, qty: l.amount, costBase: l.valueEur, wallet, source: src, note: "revenu" });
        }
        pushFees();
        break;
      }

      case "CRYPTO_DEPOSIT": {
        for (const l of ins) {
          if (tx.category === "INTERNAL_TRANSFER") {
            out.push({ kind: "TRANSFER", txId: tx.id, at: tx.timestamp, asset: l.asset, qty: l.amount, from: "external", to: wallet, feesBase: feeTotal });
            out.push({ kind: "ACQUIRE", txId: tx.id, at: tx.timestamp, asset: l.asset, qty: l.amount, costBase: l.valueEur, wallet, source: src, note: "transfert interne (coût repris si le wallet source est suivi)" });
            continue;
          }
          const kind = INCOME_CATEGORIES[tx.category];
          if (kind) out.push({ kind: "INCOME", txId: tx.id, at: tx.timestamp, asset: l.asset, qty: l.amount, valueBase: l.valueEur, incomeKind: kind, wallet, source: src, note: tx.note });
          out.push({ kind: "ACQUIRE", txId: tx.id, at: tx.timestamp, asset: l.asset, qty: l.amount, costBase: l.valueEur, wallet, source: src, note: tx.category });
        }
        pushFees();
        break;
      }

      case "CRYPTO_WITHDRAWAL": {
        for (const l of outs) {
          if (tx.category === "INTERNAL_TRANSFER") {
            out.push({ kind: "TRANSFER", txId: tx.id, at: tx.timestamp, asset: l.asset, qty: l.amount, from: wallet, to: "external", feesBase: feeTotal });
            continue;
          }
          const kind: DisposalKind = tx.category === "PURCHASE_GOODS" ? "GOODS" : tx.category === "GIFT_GIVEN" || tx.category === "OWNER_WITHDRAWAL" ? "GIFT" : tx.category === "LOST" ? "LOST" : "GOODS";
          out.push({ kind: "DISPOSE", txId: tx.id, at: tx.timestamp, asset: l.asset, qty: l.amount, proceedsBase: l.valueEur, feesBase: feeTotal, disposalKind: kind, wallet, source: src, note: tx.note });
        }
        pushFees();
        break;
      }

      case "ADJUSTMENT": {
        for (const l of ins) out.push({ kind: "ACQUIRE", txId: tx.id, at: tx.timestamp, asset: l.asset, qty: l.amount, costBase: l.valueEur, wallet, source: src, note: "ajustement" });
        for (const l of outs) out.push({ kind: "DISPOSE", txId: tx.id, at: tx.timestamp, asset: l.asset, qty: l.amount, proceedsBase: ZERO, feesBase: ZERO, disposalKind: "LOST", wallet, source: src, note: "ajustement" });
        break;
      }

      case "FEE": {
        pushFees();
        break;
      }
    }
  }
  return out.sort((a, b) => a.at.getTime() - b.at.getTime());
}

function shareOf(total: Decimal, leg: ValuedLeg, group: ValuedLeg[]): Decimal {
  if (total.isZero() || group.length === 0) return ZERO;
  const sum = group.reduce((a, l) => a.plus(l.valueEur), ZERO);
  if (sum.isZero()) return total.div(group.length);
  return total.mul(leg.valueEur).div(sum);
}
