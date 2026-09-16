import { ZERO, type Decimal } from "./money";
import type { CanonicalTx } from "./model";
import type { PriceTable } from "./valuation";

/** Quantity held per asset after applying every leg (IN − OUT − FEE). */
export function computeHoldings(txs: Iterable<CanonicalTx>, asOf?: Date): Map<string, Decimal> {
  const h = new Map<string, Decimal>();
  for (const tx of txs) {
    if (asOf && tx.timestamp > asOf) continue;
    for (const leg of tx.legs) {
      const key = leg.asset.toUpperCase();
      const cur = h.get(key) ?? ZERO;
      h.set(key, leg.role === "IN" ? cur.plus(leg.amount) : cur.minus(leg.amount));
    }
  }
  for (const [k, v] of h) if (v.abs().lt("1e-12")) h.delete(k);
  return h;
}

export interface HoldingValue { asset: string; qty: Decimal; priceEur: Decimal | null; valueEur: Decimal }

export function valueHoldings(holdings: Map<string, Decimal>, prices: PriceTable, at: Date): { items: HoldingValue[]; total: Decimal; missing: string[] } {
  const items: HoldingValue[] = [];
  const missing: string[] = [];
  let total = ZERO;
  for (const [asset, qty] of holdings) {
    const q = prices.get(asset, at);
    if (!q) { missing.push(asset); items.push({ asset, qty, priceEur: null, valueEur: ZERO }); continue; }
    const v = qty.mul(q.priceEur);
    total = total.plus(v);
    items.push({ asset, qty, priceEur: q.priceEur, valueEur: v });
  }
  items.sort((a, b) => b.valueEur.comparedTo(a.valueEur));
  return { items, total, missing };
}

/** Daily portfolio value series between two dates (inclusive), for charts. */
export function portfolioTimeline(txs: CanonicalTx[], prices: PriceTable, from: Date, to: Date): { date: Date; valueEur: Decimal }[] {
  const sorted = [...txs].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  const out: { date: Date; valueEur: Decimal }[] = [];
  const holdings = new Map<string, Decimal>();
  let i = 0;
  const day = 24 * 60 * 60 * 1000;
  for (let t = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()); t <= to.getTime(); t += day) {
    const endOfDay = new Date(t + day - 1);
    while (i < sorted.length && sorted[i].timestamp <= endOfDay) {
      for (const leg of sorted[i].legs) {
        const key = leg.asset.toUpperCase();
        const cur = holdings.get(key) ?? ZERO;
        holdings.set(key, leg.role === "IN" ? cur.plus(leg.amount) : cur.minus(leg.amount));
      }
      i++;
    }
    let total = ZERO;
    for (const [asset, qty] of holdings) {
      if (qty.abs().lt("1e-12")) continue;
      const q = prices.get(asset, endOfDay);
      if (q) total = total.plus(qty.mul(q.priceEur));
    }
    out.push({ date: new Date(t), valueEur: total });
  }
  return out;
}
