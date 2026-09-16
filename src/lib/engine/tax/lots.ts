import { D, ZERO, Decimal } from "../money";

/**
 * Lot ledger used by the tax engines.
 *
 * It differs from the accounting ledger (`engine/costbasis.ts`) on purpose:
 * tax rules need the acquisition date of each unit disposed of (holding
 * periods in Germany, Portugal, Austria's grandfathered stock, Belgium's
 * step-up), and several countries track lots per wallet rather than globally.
 * The accounting ledger only needs a book value.
 */
export type LotMethod = "FIFO" | "LIFO" | "HIFO" | "AVERAGE";

export interface Lot {
  id: string;
  asset: string;
  wallet: string;
  qty: Decimal;
  unitCost: Decimal;
  acquiredAt: Date;
  txId?: string;
  /** Acquired before a grandfathering or step-up date set by the country pack. */
  legacy: boolean;
}

export interface Consumption {
  lot: Lot;
  qty: Decimal;
  cost: Decimal;
  holdingDays: number;
  legacy: boolean;
}

export interface DisposalOutcome {
  asset: string;
  qty: Decimal;
  proceeds: Decimal;
  cost: Decimal;
  gain: Decimal;
  /** Quantity disposed of that the ledger did not hold (missing history upstream). */
  shortfall: Decimal;
  consumed: Consumption[];
  /** Weighted average unit cost of the units disposed of. */
  averageUnitCost: Decimal;
  /** Holding period of the oldest and newest units consumed. */
  minHoldingDays: number;
  maxHoldingDays: number;
  /** True when every consumed unit was grandfathered. */
  allLegacy: boolean;
  anyLegacy: boolean;
}

const DAY = 24 * 60 * 60 * 1000;
const holdingDays = (from: Date, to: Date) => Math.floor((to.getTime() - from.getTime()) / DAY);

export interface LotLedgerOptions {
  method: LotMethod;
  /** Keep separate stacks per wallet (Germany applies FIFO wallet by wallet). */
  perWallet?: boolean;
  /** Units acquired strictly before this instant are flagged `legacy`. */
  legacyBefore?: Date;
  /** Value used instead of historical cost for legacy units (Belgian step-up). */
  legacyStepUp?: (asset: string) => Decimal | undefined;
}

export class LotLedger {
  private stacks = new Map<string, Lot[]>();
  private seq = 0;
  readonly method: LotMethod;
  readonly perWallet: boolean;

  constructor(private readonly opts: LotLedgerOptions) {
    this.method = opts.method;
    this.perWallet = opts.perWallet ?? false;
  }

  private key(asset: string, wallet: string): string {
    return this.perWallet ? `${asset.toUpperCase()}|${wallet}` : asset.toUpperCase();
  }

  private stack(asset: string, wallet: string): Lot[] {
    const k = this.key(asset, wallet);
    let s = this.stacks.get(k);
    if (!s) { s = []; this.stacks.set(k, s); }
    return s;
  }

  acquire(asset: string, qty: Decimal, totalCost: Decimal, at: Date, wallet = "*", txId?: string): Lot | null {
    if (qty.lte(0)) return null;
    const legacy = Boolean(this.opts.legacyBefore && at < this.opts.legacyBefore);
    const stepUp = legacy ? this.opts.legacyStepUp?.(asset.toUpperCase()) : undefined;
    const unitCost = stepUp ?? totalCost.div(qty);
    const lot: Lot = { id: `L${++this.seq}`, asset: asset.toUpperCase(), wallet, qty, unitCost, acquiredAt: at, txId, legacy };
    this.stack(asset, wallet).push(lot);
    return lot;
  }

  /** Quantity currently held (all wallets when `wallet` is omitted). */
  quantity(asset: string, wallet?: string): Decimal {
    let total = ZERO;
    for (const [k, lots] of this.stacks) {
      const [a, w] = k.split("|");
      if (a !== asset.toUpperCase()) continue;
      if (wallet && this.perWallet && w !== wallet) continue;
      for (const l of lots) total = total.plus(l.qty);
    }
    return total;
  }

  averageUnitCost(asset: string): Decimal {
    let qty = ZERO, cost = ZERO;
    for (const [k, lots] of this.stacks) {
      if (k.split("|")[0] !== asset.toUpperCase()) continue;
      for (const l of lots) { qty = qty.plus(l.qty); cost = cost.plus(l.qty.mul(l.unitCost)); }
    }
    return qty.isZero() ? ZERO : cost.div(qty);
  }

  /** All assets with a non-zero position. */
  assets(): string[] {
    const out = new Set<string>();
    for (const [k, lots] of this.stacks) if (lots.some((l) => l.qty.gt(0))) out.add(k.split("|")[0]);
    return [...out].sort();
  }

  positions(): { asset: string; qty: Decimal; cost: Decimal; lots: Lot[] }[] {
    const byAsset = new Map<string, { asset: string; qty: Decimal; cost: Decimal; lots: Lot[] }>();
    for (const [k, lots] of this.stacks) {
      const asset = k.split("|")[0];
      const cur = byAsset.get(asset) ?? { asset, qty: ZERO, cost: ZERO, lots: [] };
      for (const l of lots) { cur.qty = cur.qty.plus(l.qty); cur.cost = cur.cost.plus(l.qty.mul(l.unitCost)); cur.lots.push(l); }
      byAsset.set(asset, cur);
    }
    return [...byAsset.values()].filter((p) => p.qty.gt("1e-12")).sort((a, b) => a.asset.localeCompare(b.asset));
  }

  /** Order in which lots are consumed, per the configured method. */
  private order(lots: Lot[]): Lot[] {
    const live = lots.filter((l) => l.qty.gt(0));
    switch (this.method) {
      case "LIFO": return [...live].sort((a, b) => b.acquiredAt.getTime() - a.acquiredAt.getTime());
      case "HIFO": return [...live].sort((a, b) => b.unitCost.comparedTo(a.unitCost));
      case "FIFO":
      case "AVERAGE":
      default: return [...live].sort((a, b) => a.acquiredAt.getTime() - b.acquiredAt.getTime());
    }
  }

  /**
   * Consumes `qty` of `asset` and returns the cost allowed and the units used.
   * With AVERAGE the cost is the moving average of the whole position, but the
   * units are still taken oldest-first so that holding periods and
   * grandfathering flags remain meaningful.
   */
  dispose(asset: string, qty: Decimal, proceeds: Decimal, at: Date, wallet = "*"): DisposalOutcome {
    const a = asset.toUpperCase();
    const avg = this.averageUnitCost(a);
    const pools = this.perWallet ? [this.stack(a, wallet)] : [...this.stacks.entries()].filter(([k]) => k.split("|")[0] === a).map(([, v]) => v);
    const candidates = this.order(pools.flat());
    let remaining = qty;
    const consumed: Consumption[] = [];
    let cost = ZERO;
    for (const lot of candidates) {
      if (remaining.lte(0)) break;
      const take = Decimal.min(lot.qty, remaining);
      const unit = this.method === "AVERAGE" ? avg : lot.unitCost;
      const c = take.mul(unit);
      consumed.push({ lot, qty: take, cost: c, holdingDays: holdingDays(lot.acquiredAt, at), legacy: lot.legacy });
      cost = cost.plus(c);
      lot.qty = lot.qty.minus(take);
      remaining = remaining.minus(take);
    }
    for (const [, lots] of this.stacks) {
      for (let i = lots.length - 1; i >= 0; i--) if (lots[i].qty.lte("1e-18")) lots.splice(i, 1);
    }
    const used = qty.minus(remaining);
    return {
      asset: a,
      qty,
      proceeds,
      cost,
      gain: proceeds.minus(cost),
      shortfall: remaining,
      consumed,
      averageUnitCost: used.isZero() ? ZERO : cost.div(used),
      minHoldingDays: consumed.length ? Math.min(...consumed.map((c) => c.holdingDays)) : 0,
      maxHoldingDays: consumed.length ? Math.max(...consumed.map((c) => c.holdingDays)) : 0,
      allLegacy: consumed.length > 0 && consumed.every((c) => c.legacy),
      anyLegacy: consumed.some((c) => c.legacy),
    };
  }

  /** Snapshot for persistence between fiscal years. */
  serialize(): { asset: string; wallet: string; qty: string; unitCost: string; acquiredAt: string; legacy: boolean }[] {
    const out: { asset: string; wallet: string; qty: string; unitCost: string; acquiredAt: string; legacy: boolean }[] = [];
    for (const [, lots] of this.stacks) for (const l of lots) out.push({ asset: l.asset, wallet: l.wallet, qty: l.qty.toString(), unitCost: l.unitCost.toString(), acquiredAt: l.acquiredAt.toISOString(), legacy: l.legacy });
    return out;
  }

  static restore(opts: LotLedgerOptions, lots: { asset: string; wallet: string; qty: string; unitCost: string; acquiredAt: string; legacy: boolean }[]): LotLedger {
    const l = new LotLedger(opts);
    for (const s of lots) {
      const lot: Lot = { id: `R${++l.seq}`, asset: s.asset, wallet: s.wallet, qty: D(s.qty), unitCost: D(s.unitCost), acquiredAt: new Date(s.acquiredAt), legacy: s.legacy };
      l.stack(s.asset, s.wallet).push(lot);
    }
    return l;
  }
}
