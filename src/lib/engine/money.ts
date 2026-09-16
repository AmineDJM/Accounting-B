import Decimal from "decimal.js";

/**
 * Money & quantity arithmetic.
 *
 * All amounts flowing through the engine are `Decimal` values (never JS floats):
 * crypto quantities carry up to 18 decimals and accounting requires exact cent
 * rounding, both of which binary floating point cannot guarantee.
 */
Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_EVEN, toExpNeg: -30, toExpPos: 30 });

export type Num = Decimal.Value;

export const D = (v: Num | null | undefined): Decimal => {
  if (v === null || v === undefined || v === "") return new Decimal(0);
  if (v instanceof Decimal) return v;
  if (typeof v === "string") return new Decimal(v.trim().replace(/\s/g, "").replace(",", "."));
  return new Decimal(v);
};

export const ZERO = new Decimal(0);
export const ONE = new Decimal(1);

/** Round to accounting cents (ROUND_HALF_UP, the convention used by French accounting software). */
export const cents = (v: Num): Decimal => D(v).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

/** Round a crypto quantity to 8 decimals for display purposes only. */
export const qty8 = (v: Num): Decimal => D(v).toDecimalPlaces(8, Decimal.ROUND_HALF_UP);

export const isZero = (v: Num): boolean => D(v).isZero();
export const abs = (v: Num): Decimal => D(v).abs();
export const max = (a: Num, b: Num): Decimal => Decimal.max(D(a), D(b));
export const min = (a: Num, b: Num): Decimal => Decimal.min(D(a), D(b));
export const sum = (values: Iterable<Num>): Decimal => {
  let acc = ZERO;
  for (const v of values) acc = acc.plus(D(v));
  return acc;
};

/** Format a number the French way: "1 234,56". */
export function formatFr(v: Num, decimals = 2): string {
  const d = D(v).toDecimalPlaces(decimals, Decimal.ROUND_HALF_UP);
  const neg = d.isNegative();
  const [int, frac = ""] = d.abs().toFixed(decimals).split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const out = decimals > 0 ? `${grouped},${frac}` : grouped;
  return neg ? `-${out}` : out;
}

/** Format a EUR amount: "1 234,56 €". */
export const formatEur = (v: Num, decimals = 2): string => `${formatFr(v, decimals)} €`;

/** Format a crypto quantity, trimming useless trailing zeros but keeping at least 2 decimals. */
export function formatQty(v: Num, asset?: string): string {
  const d = D(v);
  const places = d.abs().gte(1000) ? 2 : d.abs().gte(1) ? 4 : 8;
  let s = d.toFixed(places).replace(/(\.\d*?[1-9])0+$/, "$1").replace(/\.0+$/, "");
  if (!s.includes(".")) s = `${s}.00`;
  const [int, frac] = s.split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${grouped},${frac}${asset ? ` ${asset}` : ""}`;
}

/** FEC numeric format: decimal comma, no thousands separator, 2 decimals, optional leading minus. */
export const fecNumber = (v: Num): string => cents(v).toFixed(2).replace(".", ",");

export { Decimal };
