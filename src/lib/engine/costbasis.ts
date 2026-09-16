import { D, ZERO, Decimal } from "./money";

/**
 * Cost-flow assumptions accepted by the accounting frameworks in scope:
 * weighted average (CUMP/CMP), first-in first-out (PEPS/FIFO), last-in
 * first-out (LIFO, admitted by §256 HGB and by OIC 13 for inventories) and
 * highest-in first-out (HIFO, used by some German advisers on request).
 */
export type CostMethod = "CUMP" | "FIFO" | "LIFO" | "HIFO";

export interface Lot {
  qty: Decimal;
  unitCost: Decimal; // EUR per unit
  acquiredAt: Date;
  txId: string;
}

export interface AssetPosition {
  asset: string;
  qty: Decimal;
  /** Total book value (EUR) of the position = Σ lots (FIFO) or qty × CUMP. */
  totalCost: Decimal;
  lots: Lot[];
}

export interface DisposalResult {
  asset: string;
  qty: Decimal;
  proceedsEur: Decimal;
  costBasisEur: Decimal;
  gainEur: Decimal;
  /** Quantity disposed that the ledger did not hold (missing acquisitions upstream). */
  shortfallQty: Decimal;
  lotsConsumed: Lot[];
}

/**
 * Cost-basis ledger implementing the two methods allowed by PCG art. 619-15
 * for tokens: weighted average cost (CMP/CUMP) and first-in first-out (PEPS/FIFO).
 */
export class CostBasisLedger {
  private positions = new Map<string, AssetPosition>();

  constructor(public readonly method: CostMethod = "CUMP") {}

  static fromPositions(method: CostMethod, positions: Iterable<AssetPosition>): CostBasisLedger {
    const l = new CostBasisLedger(method);
    for (const p of positions) {
      l.positions.set(p.asset.toUpperCase(), {
        asset: p.asset.toUpperCase(),
        qty: D(p.qty),
        totalCost: D(p.totalCost),
        lots: p.lots.map((lot) => ({ ...lot, qty: D(lot.qty), unitCost: D(lot.unitCost) })),
      });
    }
    return l;
  }

  position(asset: string): AssetPosition {
    const key = asset.toUpperCase();
    let p = this.positions.get(key);
    if (!p) {
      p = { asset: key, qty: ZERO, totalCost: ZERO, lots: [] };
      this.positions.set(key, p);
    }
    return p;
  }

  averageCost(asset: string): Decimal {
    const p = this.position(asset);
    return p.qty.isZero() ? ZERO : p.totalCost.div(p.qty);
  }

  acquire(asset: string, qty: Decimal, totalCostEur: Decimal, at: Date, txId: string): void {
    if (qty.lte(0)) return;
    const p = this.position(asset);
    const unit = totalCostEur.div(qty);
    p.qty = p.qty.plus(qty);
    p.totalCost = p.totalCost.plus(totalCostEur);
    if (this.method !== "CUMP") p.lots.push({ qty, unitCost: unit, acquiredAt: at, txId });
  }

  dispose(asset: string, qty: Decimal, proceedsEur: Decimal): DisposalResult {
    const p = this.position(asset);
    const res: DisposalResult = { asset: p.asset, qty, proceedsEur, costBasisEur: ZERO, gainEur: ZERO, shortfallQty: ZERO, lotsConsumed: [] };
    if (qty.lte(0)) return res;
    const held = p.qty;
    const disposable = Decimal.min(qty, held);
    res.shortfallQty = qty.minus(disposable);

    if (this.method === "CUMP") {
      const avg = held.isZero() ? ZERO : p.totalCost.div(held);
      res.costBasisEur = avg.mul(disposable);
      p.qty = held.minus(disposable);
      p.totalCost = p.qty.isZero() ? ZERO : p.totalCost.minus(res.costBasisEur);
    } else {
      let remaining = disposable;
      this.sortLots(p.lots);
      while (remaining.gt(0) && p.lots.length > 0) {
        const lot = p.lots[0];
        const take = Decimal.min(lot.qty, remaining);
        res.costBasisEur = res.costBasisEur.plus(take.mul(lot.unitCost));
        res.lotsConsumed.push({ ...lot, qty: take });
        lot.qty = lot.qty.minus(take);
        remaining = remaining.minus(take);
        if (lot.qty.isZero()) p.lots.shift();
      }
      p.qty = held.minus(disposable);
      p.totalCost = p.lots.reduce((acc, l) => acc.plus(l.qty.mul(l.unitCost)), ZERO);
    }
    res.gainEur = proceedsEur.minus(res.costBasisEur);
    return res;
  }

  /** Orders the lots so that index 0 is the next one to be consumed. */
  private sortLots(lots: Lot[]): void {
    if (this.method === "LIFO") lots.sort((a, b) => b.acquiredAt.getTime() - a.acquiredAt.getTime());
    else if (this.method === "HIFO") lots.sort((a, b) => b.unitCost.comparedTo(a.unitCost));
    else lots.sort((a, b) => a.acquiredAt.getTime() - b.acquiredAt.getTime());
  }

  snapshot(): Map<string, AssetPosition> {
    const m = new Map<string, AssetPosition>();
    for (const [k, p] of this.positions) {
      if (p.qty.isZero() && p.totalCost.isZero()) continue;
      m.set(k, { asset: p.asset, qty: p.qty, totalCost: p.totalCost, lots: p.lots.map((l) => ({ ...l })) });
    }
    return m;
  }
}
