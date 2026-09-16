import { describe, it, expect } from "vitest";
import { createPriceTable, valueTransactions } from "@/lib/engine/valuation";
import { computeIndividualTax } from "@/lib/engine/individual";
import { getPack } from "@/lib/countries/registry";
import { D } from "@/lib/engine/money";
import type { CanonicalTx } from "@/lib/engine/model";

/**
 * Two implementations of article 150 VH bis exist in this repository: the
 * original `computeIndividualTax`, written directly from the article and
 * covered field by field by its own test, and `frEngine`, which produces the
 * same figures inside the country-pack framework with a trace attached.
 *
 * Keeping both is only defensible if they cannot drift. This test runs the same
 * history through each and pins the taxable result, so a change to either one
 * that the other does not follow fails here rather than in a client's return.
 */
const t = (iso: string) => new Date(iso);
const base = { accountId: "a", source: "manual" as const, category: "TRADE" as const };

const prices = createPriceTable([
  { asset: "BTC", at: t("2025-01-02T00:00:00Z"), priceEur: D(90000), source: "x" },
  { asset: "BTC", at: t("2025-06-01T00:00:00Z"), priceEur: D(100000), source: "x" },
  { asset: "BTC", at: t("2025-09-01T00:00:00Z"), priceEur: D(110000), source: "x" },
  { asset: "ETH", at: t("2025-06-01T00:00:00Z"), priceEur: D(2500), source: "x" },
  { asset: "ETH", at: t("2025-09-01T00:00:00Z"), priceEur: D(3000), source: "x" },
], { toleranceCrypto: 200 * 24 * 3600 * 1000 });

const txs: CanonicalTx[] = [
  { ...base, id: "buy1", externalId: "buy1", type: "TRADE", timestamp: t("2025-01-02T10:00:00Z"),
    legs: [{ asset: "EUR", amount: D(9000), role: "OUT" }, { asset: "BTC", amount: D("0.1"), role: "IN" }] },
  // A swap: deferred, but it moves value between assets inside the portfolio.
  { ...base, id: "swap", externalId: "swap", type: "TRADE", timestamp: t("2025-06-01T12:00:00Z"),
    legs: [{ asset: "BTC", amount: D("0.02"), role: "OUT" }, { asset: "ETH", amount: D("0.8"), role: "IN" }] },
  // A sale against euro: taxable, and priced against the whole portfolio.
  { ...base, id: "sell", externalId: "sell", type: "TRADE", timestamp: t("2025-09-01T13:00:00Z"),
    legs: [{ asset: "BTC", amount: D("0.03"), role: "OUT" }, { asset: "EUR", amount: D(3300), role: "IN" }, { asset: "EUR", amount: D(3), role: "FEE" }] },
  // A payment for goods: taxable in France just like a sale.
  { ...base, id: "pay", externalId: "pay", type: "CRYPTO_WITHDRAWAL", category: "PURCHASE_GOODS", timestamp: t("2025-09-01T15:00:00Z"),
    legs: [{ asset: "ETH", amount: D("0.2"), role: "OUT" }], counterparty: { kind: "EXTERNAL", address: "0xsupplier" } },
];

const valued = valueTransactions(txs, prices);
const reference = computeIndividualTax(valued, prices, {});
const pack = getPack("FR");
const packed = pack.engine({ country: "FR", currency: "EUR", valued, prices, now: t("2026-01-15T00:00:00Z") }, pack);

describe("the two implementations of article 150 VH bis agree", () => {
  it("counts the same taxable disposals", () => {
    expect(reference.disposals.length).toBeGreaterThan(0);
    expect(packed.events.filter((e) => !e.exempt).length).toBe(reference.disposals.length);
    expect(packed.events.filter((e) => !e.exempt).map((e) => e.txId).sort()).toEqual(reference.disposals.map((d) => d.txId).sort());
  });

  it("reaches the same net gain for the year", () => {
    const refYear = reference.years.find((y) => y.year === 2025);
    const packYear = packed.years.find((y) => y.year === 2025);
    expect(refYear).toBeDefined();
    expect(packYear).toBeDefined();
    expect(packYear!.netGain.toFixed(2)).toBe(refYear!.netGainEur.toFixed(2));
  });

  it("reaches the same taxable base and the same estimated tax", () => {
    const refYear = reference.years.find((y) => y.year === 2025)!;
    const packYear = packed.years.find((y) => y.year === 2025)!;
    expect(packYear.taxableBase.toFixed(2)).toBe(refYear.taxablePfuEur.toFixed(2));
    expect(packYear.estimatedTax?.toFixed(2)).toBe(refYear.estimatedTaxPfuEur.toFixed(2));
  });

  it("prices each disposal against the same portfolio value", () => {
    for (const d of reference.disposals) {
      const e = packed.events.find((x) => x.txId === d.txId && !x.exempt);
      expect(e, d.txId).toBeDefined();
      expect(e!.gain.toFixed(2), d.txId).toBe(d.gainEur.toFixed(2));
    }
  });

  it("defers the swap in both", () => {
    expect(reference.disposals.some((d) => d.txId === "swap")).toBe(false);
    expect(packed.events.find((e) => e.txId === "swap")?.exempt).toBe(true);
  });

  it("only the pack version carries a trace, which is why it is the one the app uses", () => {
    const year = packed.years.find((y) => y.year === 2025)!;
    expect(year.trace.steps.length).toBeGreaterThan(0);
    const disposal = packed.events.find((e) => !e.exempt)!;
    // The five steps of the article: net proceeds, portfolio value, net
    // acquisition price, the fraction, and the gain.
    expect(disposal.trace.steps.length).toBeGreaterThanOrEqual(4);
    expect(disposal.trace.refs.concat(disposal.trace.steps.flatMap((s) => s.refs)).some((r) => r.code.includes("150 VH bis"))).toBe(true);
  });
});
