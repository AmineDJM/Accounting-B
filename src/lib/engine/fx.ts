import { D, ONE, type Decimal } from "./money";
import type { PriceQuote } from "./model";
import type { PriceTable } from "./valuation";
import type { LegalRef } from "./trace";

/**
 * Base-currency handling.
 *
 * Prices are collected once, in euros (Binance klines bridged through USDT, ECB
 * reference rates for fiat). An entity whose books are kept in another currency
 * reads the same cache through `rebase`, which divides every euro price by the
 * euro value of one unit of the base currency at the same instant.
 *
 * Gulf currencies are not published by the ECB: they are pegged to the US
 * dollar by decree, so their euro value is derived from the ECB's EUR/USD rate
 * and the official peg.
 */
export interface Peg {
  perUsd: string;
  label: string;
  ref: LegalRef;
}

export const USD_PEGS: Record<string, Peg> = {
  AED: { perUsd: "3.6725", label: "Dirham des Émirats arabes unis", ref: { jurisdiction: "AE", code: "UAE Central Bank — peg USD/AED 3,6725 (depuis 1997)", url: "https://www.centralbank.ae/en/forex-eibor/exchange-rates/", asOf: "2026-01-01" } },
  QAR: { perUsd: "3.64", label: "Riyal qatari", ref: { jurisdiction: "QA", code: "Qatar Central Bank — peg USD/QAR 3,64 (Law No. 13 of 2012)", url: "https://www.qcb.gov.qa/en/", asOf: "2026-01-01" } },
  OMR: { perUsd: "0.3845", label: "Rial omanais", ref: { jurisdiction: "OM", code: "Central Bank of Oman — peg USD/OMR 0,3845 (depuis 1986)", url: "https://cbo.gov.om/", asOf: "2026-01-01" } },
  SAR: { perUsd: "3.75", label: "Riyal saoudien", ref: { jurisdiction: "OECD", code: "SAMA — peg USD/SAR 3,75", asOf: "2026-01-01" } },
  BHD: { perUsd: "0.376", label: "Dinar bahreïni", ref: { jurisdiction: "OECD", code: "CBB — peg USD/BHD 0,376", asOf: "2026-01-01" } },
};

export const isPegged = (currency: string): boolean => currency.toUpperCase() in USD_PEGS;

/** Euro value of one unit of `currency` at `at`, or undefined when unknown. */
export function unitInEur(table: PriceTable, currency: string, at: Date): { value: Decimal; source: string } | undefined {
  const cur = currency.toUpperCase();
  if (cur === "EUR") return { value: ONE, source: "base" };
  const peg = USD_PEGS[cur];
  if (peg) {
    const usd = table.get("USD", at);
    if (!usd) return undefined;
    return { value: usd.priceEur.div(D(peg.perUsd)), source: `${usd.source} × peg USD/${cur} ${peg.perUsd}` };
  }
  const q = table.get(cur, at);
  return q ? { value: q.priceEur, source: q.source } : undefined;
}

/**
 * Returns a price table expressed in `base` instead of euros.
 * The rebased table keeps the same lookup semantics (forward fill, tolerance).
 */
export function rebase(table: PriceTable, base: string): PriceTable {
  const cur = base.toUpperCase();
  if (cur === "EUR") return table;
  return {
    get(asset: string, at: Date): PriceQuote | undefined {
      const a = asset.toUpperCase();
      const unit = unitInEur(table, cur, at);
      if (!unit || unit.value.isZero()) return undefined;
      if (a === cur) return { asset: a, at, priceEur: ONE, source: "base" };
      if (a === "EUR") return { asset: "EUR", at, priceEur: ONE.div(unit.value), source: `1 / (${unit.source})` };
      const q = table.get(a, at);
      if (!q) return undefined;
      return { asset: a, at, priceEur: q.priceEur.div(unit.value), source: `${q.source} ÷ (${unit.source})` };
    },
    assets: () => table.assets(),
  };
}

/** Currencies a country pack may keep its books in, beyond the euro. */
export const SUPPORTED_BASE_CURRENCIES = ["EUR", "CHF", "AED", "QAR", "OMR", "USD", "GBP"] as const;
