import { describe, it, expect } from "vitest";
import { createPriceTable, valueTransactions } from "@/lib/engine/valuation";
import { getPack } from "@/lib/countries/registry";
import { D } from "@/lib/engine/money";
import { rebase } from "@/lib/engine/fx";
import type { CanonicalTx } from "@/lib/engine/model";

const t = (iso: string) => new Date(iso);
const base = { accountId: "a", source: "manual" as const, category: "TRADE" as const };

const prices = createPriceTable([
  { asset: "BTC", at: t("2025-06-01T00:00:00Z"), priceEur: D(50000), source: "x" },
  { asset: "BTC", at: t("2025-12-31T00:00:00Z"), priceEur: D(80000), source: "x" },
  { asset: "BTC", at: t("2026-01-01T00:00:00Z"), priceEur: D(90000), source: "x" },
  { asset: "CHF", at: t("2025-12-31T00:00:00Z"), priceEur: D("1.05"), source: "ecb" },
], { toleranceCrypto: 400 * 24 * 3600 * 1000, toleranceFiat: 800 * 24 * 3600 * 1000 });

const txs: CanonicalTx[] = [
  { ...base, id: "buy", externalId: "buy", type: "TRADE", timestamp: t("2025-06-01T10:00:00Z"),
    legs: [{ asset: "EUR", amount: D(50000), role: "OUT" }, { asset: "BTC", amount: D(1), role: "IN" }] },
  // Bought on 1 January 2026, so inside the Swiss year-end but outside the
  // Dutch peildatum, which is the opening of that same day.
  { ...base, id: "later", externalId: "later", type: "TRADE", timestamp: t("2026-01-01T14:00:00Z"),
    legs: [{ asset: "EUR", amount: D(90000), role: "OUT" }, { asset: "BTC", amount: D(1), role: "IN" }] },
];
const valued = valueTransactions(txs, prices);

/**
 * The engine takes a table already expressed in the books' currency: rebasing
 * is the caller's job, which is what the service layer does. Passing a currency
 * label without rebasing would silently label euro figures as francs.
 */
const run = (code: "CH" | "NL", now: string, currency = "EUR") => {
  const pack = getPack(code);
  const table = currency === "EUR" ? prices : rebase(prices, currency);
  return pack.engine({ country: code, currency, valued, prices: table, now: t(now) }, pack);
};

describe("wealth engine", () => {
  it("excludes a trade made on the Dutch reference day itself", () => {
    const nl = run("NL", "2026-06-30T00:00:00Z").wealth.find((w) => w.year === 2026);
    // One bitcoin held at the opening of 1 January 2026, valued at that day's price.
    expect(nl?.holdings.find((h) => h.asset === "BTC")?.qty.toString()).toBe("1");
    expect(nl?.total.toFixed(0)).toBe("90000");
  });

  it("includes the whole of the Swiss reference day", () => {
    const ch = run("CH", "2026-06-30T00:00:00Z").wealth.find((w) => w.year === 2025);
    expect(ch?.holdings.find((h) => h.asset === "BTC")?.qty.toString()).toBe("1");
    expect(ch?.total.toFixed(0)).toBe("80000");
  });

  it("produces no snapshot for a reference date that has not arrived", () => {
    const r = run("CH", "2026-06-30T00:00:00Z");
    expect(r.wealth.some((w) => w.year === 2026)).toBe(false);
    expect(r.warnings.some((w) => w.message.includes("2026") && w.message.includes("31/12"))).toBe(true);
  });

  it("values a Swiss file in francs through the euro cache", () => {
    const ch = run("CH", "2026-06-30T00:00:00Z", "CHF").wealth.find((w) => w.year === 2025);
    // 80 000 € at 1,05 € per franc.
    expect(ch?.currency).toBe("CHF");
    expect(Number(ch?.total)).toBeCloseTo(80000 / 1.05, 0);
  });

  it("raises an error rather than a zero when a price is missing", () => {
    const thin = createPriceTable([{ asset: "ETH", at: t("2025-12-31T00:00:00Z"), priceEur: D(3000), source: "x" }], { toleranceCrypto: 1000 });
    const pack = getPack("CH");
    const r = pack.engine({ country: "CH", currency: "EUR", valued, prices: thin, now: t("2026-06-30T00:00:00Z") }, pack);
    const snap = r.wealth.find((w) => w.year === 2025);
    expect(snap?.missing).toContain("BTC");
    expect(r.warnings.some((w) => w.level === "error" && w.message.includes("BTC"))).toBe(true);
  });
});
