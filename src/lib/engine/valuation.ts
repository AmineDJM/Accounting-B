import { D, ZERO, ONE, Decimal } from "./money";
import { FIAT_WRAPPERS, isFiat, isStable, type CanonicalTx, type Leg, type PriceQuote, type ValuedLeg, type ValuedTx } from "./model";

/**
 * Price table: answers "how many EUR was one unit of `asset` worth at `at`?".
 *
 * Quotes are stored per asset, sorted by time. Lookup uses the last quote at or
 * before `at` (forward fill, which is also how the Banque de France / ECB daily
 * rates are used for week-ends) as long as it is not older than `tolerance`;
 * otherwise the next quote after `at` if it is close enough.
 */
export interface PriceTable {
  get(asset: string, at: Date): PriceQuote | undefined;
  assets(): string[];
}

export interface PriceTableOptions {
  /** max age of a quote used by forward fill, per asset class (ms) */
  toleranceCrypto?: number;
  toleranceFiat?: number;
}

const DAY = 24 * 60 * 60 * 1000;

export function createPriceTable(quotes: Iterable<PriceQuote>, opts: PriceTableOptions = {}): PriceTable {
  const tolCrypto = opts.toleranceCrypto ?? 6 * 60 * 60 * 1000; // 6 h
  const tolFiat = opts.toleranceFiat ?? 5 * DAY; // long week-ends & bank holidays
  const byAsset = new Map<string, { ts: number; q: PriceQuote }[]>();
  for (const q of quotes) {
    const key = q.asset.toUpperCase();
    const arr = byAsset.get(key) ?? [];
    arr.push({ ts: q.at.getTime(), q });
    byAsset.set(key, arr);
  }
  for (const arr of byAsset.values()) arr.sort((a, b) => a.ts - b.ts);

  const lookup = (asset: string, at: Date): PriceQuote | undefined => {
    const arr = byAsset.get(asset.toUpperCase());
    if (!arr || arr.length === 0) return undefined;
    const t = at.getTime();
    const tol = isFiat(asset) ? tolFiat : tolCrypto;
    // binary search: last index with ts <= t
    let lo = 0, hi = arr.length - 1, idx = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (arr[mid].ts <= t) { idx = mid; lo = mid + 1; } else hi = mid - 1;
    }
    if (idx >= 0 && t - arr[idx].ts <= tol) return arr[idx].q;
    const next = arr[idx + 1];
    if (next && next.ts - t <= tol) return next.q;
    return undefined;
  };

  return {
    get(asset, at) {
      const a = asset.toUpperCase();
      if (a === "EUR") return { asset: "EUR", at, priceEur: ONE, source: "base" };
      const direct = lookup(a, at);
      if (direct) return direct;
      const wrapped = FIAT_WRAPPERS[a];
      if (wrapped) {
        const w = lookup(wrapped, at);
        if (w) return { ...w, asset: a, source: `${w.source} (via ${wrapped})` };
      }
      return undefined;
    },
    assets: () => [...byAsset.keys()],
  };
}

/** Priority of an asset as a valuation reference: lower is better. */
export function referencePriority(asset: string): number {
  const a = asset.toUpperCase();
  if (a === "EUR") return 0;
  if (isFiat(a) || FIAT_WRAPPERS[a]) return 1;
  if (isStable(a)) return 2;
  if (["BTC", "ETH", "BNB"].includes(a)) return 3;
  return 4;
}

export interface ValuationOptions {
  /** Assets for which a missing price should not raise a warning (e.g. dust). */
  ignoreMissingBelowEur?: Decimal;
}

function valueLeg(leg: Leg, unitPrice: Decimal, source: string): ValuedLeg {
  return { ...leg, unitPriceEur: unitPrice, valueEur: leg.amount.mul(unitPrice), priceSource: source };
}

/**
 * Attach EUR values to every leg of every transaction.
 *
 * For an exchange between two assets the engine picks the most reliable side
 * (EUR > other fiat > stablecoin > BTC/ETH/BNB > anything) as the reference,
 * values the operation from it and derives the implied unit price of the
 * other side — the same idea as pricing a trade from its quote asset, but
 * robust to exotic pairs.
 */
export function valueTransactions(txs: CanonicalTx[], prices: PriceTable, opts: ValuationOptions = {}): ValuedTx[] {
  void opts;
  const out: ValuedTx[] = [];
  for (const tx of txs) {
    const warnings: string[] = [];
    const known = tx.knownUnitPriceEur ?? {};
    const quoteFor = (asset: string): { price: Decimal; source: string } | undefined => {
      const k = known[asset.toUpperCase()];
      if (k) return { price: D(k), source: "source" };
      const q = prices.get(asset, tx.timestamp);
      if (q) return { price: q.priceEur, source: q.source };
      return undefined;
    };

    const ins = tx.legs.filter((l) => l.role === "IN");
    const outs = tx.legs.filter((l) => l.role === "OUT");
    const fees = tx.legs.filter((l) => l.role === "FEE");
    const valued: ValuedLeg[] = [];
    let gross = ZERO;
    const implied = new Map<string, Decimal>();

    if (tx.type === "TRADE" && ins.length >= 1 && outs.length >= 1) {
      // candidates: any principal leg with a known price, best reference first
      const candidates = [...outs, ...ins]
        .map((l) => ({ leg: l, q: quoteFor(l.asset), prio: referencePriority(l.asset) }))
        .filter((c) => c.q !== undefined)
        .sort((a, b) => a.prio - b.prio);
      if (candidates.length === 0) {
        warnings.push(`Aucun cours EUR trouvé pour ${outs.map((l) => l.asset).join("+")} ni ${ins.map((l) => l.asset).join("+")} au ${tx.timestamp.toISOString()}`);
        for (const l of [...outs, ...ins]) valued.push(valueLeg(l, ZERO, "missing"));
      } else {
        const ref = candidates[0];
        const refSide = ref.leg.role;
        const sideLegs = refSide === "OUT" ? outs : ins;
        const otherLegs = refSide === "OUT" ? ins : outs;
        // value the whole reference side with table prices (multi-leg sides are rare but supported)
        let sideTotal = ZERO;
        for (const l of sideLegs) {
          const q = quoteFor(l.asset);
          if (!q) { warnings.push(`Cours EUR manquant pour ${l.asset}`); valued.push(valueLeg(l, ZERO, "missing")); continue; }
          const v = valueLeg(l, q.price, q.source);
          valued.push(v);
          sideTotal = sideTotal.plus(v.valueEur);
        }
        gross = sideTotal;
        // other side: single leg -> implied unit price = gross / qty.
        // Several legs (dust conversion) -> split the gross value using each leg's own market price
        // when known (scaled so both sides match), otherwise proportionally to quantities.
        if (otherLegs.length === 1) {
          const l = otherLegs[0];
          const unit = l.amount.isZero() ? ZERO : gross.div(l.amount);
          valued.push(valueLeg(l, unit, `implied:${ref.leg.asset}`));
          implied.set(l.asset.toUpperCase(), unit);
        } else {
          const mkt = otherLegs.map((l) => ({ l, q: quoteFor(l.asset) }));
          const allKnown = mkt.every((m) => m.q !== undefined);
          if (allKnown) {
            const rawTotal = mkt.reduce((acc, m) => acc.plus(m.l.amount.mul(m.q!.price)), ZERO);
            const scale = rawTotal.isZero() ? ONE : gross.div(rawTotal);
            for (const m of mkt) {
              const unit = m.q!.price.mul(scale);
              valued.push(valueLeg(m.l, unit, `scaled:${m.q!.source}`));
              implied.set(m.l.asset.toUpperCase(), unit);
            }
          } else {
            warnings.push(`Répartition approximative de la valeur entre ${otherLegs.map((l) => l.asset).join(", ")} (cours manquants)`);
            const otherQtyTotal = otherLegs.reduce((acc, l) => acc.plus(l.amount), ZERO);
            for (const l of otherLegs) {
              const unit = otherQtyTotal.isZero() ? ZERO : gross.div(otherQtyTotal);
              valued.push(valueLeg(l, unit, `implied:${ref.leg.asset}`));
              implied.set(l.asset.toUpperCase(), unit);
            }
          }
        }
        for (const l of sideLegs) {
          const v = valued.find((x) => x.asset === l.asset && x.role === l.role);
          if (v) implied.set(l.asset.toUpperCase(), v.unitPriceEur);
        }
      }
    } else {
      for (const l of [...outs, ...ins]) {
        const q = quoteFor(l.asset);
        if (!q) {
          warnings.push(`Cours EUR manquant pour ${l.asset} au ${tx.timestamp.toISOString()}`);
          valued.push(valueLeg(l, ZERO, "missing"));
        } else {
          const v = valueLeg(l, q.price, q.source);
          valued.push(v);
          implied.set(l.asset.toUpperCase(), q.price);
        }
      }
      gross = valued.filter((v) => v.role !== "FEE").reduce((acc, v) => acc.plus(v.valueEur), ZERO);
    }

    let feeValue = ZERO;
    for (const f of fees) {
      const sameSide = implied.get(f.asset.toUpperCase());
      const q = sameSide ? { price: sameSide, source: "implied" } : quoteFor(f.asset);
      if (!q) {
        warnings.push(`Cours EUR manquant pour les frais en ${f.asset}`);
        valued.push(valueLeg(f, ZERO, "missing"));
      } else {
        const v = valueLeg(f, q.price, q.source);
        valued.push(v);
        feeValue = feeValue.plus(v.valueEur);
      }
    }

    out.push({ ...tx, legs: valued, grossValueEur: gross, feeValueEur: feeValue, warnings });
  }
  return out;
}
