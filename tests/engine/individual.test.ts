import { describe, it, expect } from "vitest";
import { createPriceTable, valueTransactions } from "@/lib/engine/valuation";
import { computeIndividualTax } from "@/lib/engine/individual";
import { D } from "@/lib/engine/money";
import type { CanonicalTx } from "@/lib/engine/model";

const t = (iso: string) => new Date(iso);
const base = { accountId: "a", source: "manual" as const, category: "TRADE" as const };

describe("150 VH bis", () => {
  it("applies the BOFiP formula with fractions of initial capital", () => {
    // Buy 1 BTC for 10 000 €. Later portfolio worth 20 000 €, sell half for 10 000 €:
    //   PV = 10 000 − 10 000 × 10 000 / 20 000 = 5 000 €, fraction deducted = 5 000 €
    // Then portfolio worth 8 000 €, sell everything for 8 000 €:
    //   PV = 8 000 − (10 000 − 5 000) × 8 000 / 8 000 = 3 000 €
    const prices = createPriceTable([
      { asset: "BTC", at: t("2025-01-01T00:00:00Z"), priceEur: D(10000), source: "test" },
      { asset: "BTC", at: t("2025-06-01T00:00:00Z"), priceEur: D(20000), source: "test" },
      { asset: "BTC", at: t("2025-09-01T00:00:00Z"), priceEur: D(16000), source: "test" },
    ], { toleranceCrypto: 36 * 60 * 60 * 1000 });
    const txs: CanonicalTx[] = [
      { ...base, id: "1", externalId: "1", type: "TRADE", timestamp: t("2025-01-01T00:00:00Z"), legs: [{ asset: "EUR", amount: D(10000), role: "OUT" }, { asset: "BTC", amount: D(1), role: "IN" }] },
      { ...base, id: "2", externalId: "2", type: "TRADE", timestamp: t("2025-06-01T00:00:00Z"), legs: [{ asset: "BTC", amount: D("0.5"), role: "OUT" }, { asset: "EUR", amount: D(10000), role: "IN" }] },
      { ...base, id: "3", externalId: "3", type: "TRADE", timestamp: t("2025-09-01T00:00:00Z"), legs: [{ asset: "BTC", amount: D("0.5"), role: "OUT" }, { asset: "EUR", amount: D(8000), role: "IN" }] },
    ];
    const res = computeIndividualTax(valueTransactions(txs, prices), prices);
    expect(res.disposals).toHaveLength(2);
    expect(res.disposals[0].portfolioValueEur.toString()).toBe("20000");
    expect(res.disposals[0].gainEur.toString()).toBe("5000");
    expect(res.disposals[1].netAcquisitionEur.toString()).toBe("5000");
    expect(res.disposals[1].gainEur.toString()).toBe("3000");
    expect(res.years[0].netGainEur.toString()).toBe("8000");
    expect(res.years[0].estimatedTaxPfuEur.toString()).toBe("2400");
    expect(res.years[0].exempt).toBe(false);
  });

  it("ignores crypto-to-crypto swaps and applies the 305 € exemption", () => {
    const prices = createPriceTable([
      { asset: "BTC", at: t("2025-01-01T00:00:00Z"), priceEur: D(10000), source: "test" },
      { asset: "ETH", at: t("2025-01-01T00:00:00Z"), priceEur: D(1000), source: "test" },
      { asset: "USDT", at: t("2025-01-01T00:00:00Z"), priceEur: D(1), source: "test" },
    ], { toleranceCrypto: 36 * 60 * 60 * 1000 });
    const txs: CanonicalTx[] = [
      { ...base, id: "1", externalId: "1", type: "TRADE", timestamp: t("2025-01-01T00:00:00Z"), legs: [{ asset: "EUR", amount: D(1000), role: "OUT" }, { asset: "BTC", amount: D("0.1"), role: "IN" }] },
      { ...base, id: "2", externalId: "2", type: "TRADE", timestamp: t("2025-01-01T01:00:00Z"), legs: [{ asset: "BTC", amount: D("0.05"), role: "OUT" }, { asset: "ETH", amount: D("0.5"), role: "IN" }] },
      { ...base, id: "3", externalId: "3", type: "TRADE", timestamp: t("2025-01-01T02:00:00Z"), legs: [{ asset: "ETH", amount: D("0.5"), role: "OUT" }, { asset: "USDT", amount: D(500), role: "IN" }] },
      { ...base, id: "4", externalId: "4", type: "TRADE", timestamp: t("2025-01-01T03:00:00Z"), legs: [{ asset: "USDT", amount: D(200), role: "OUT" }, { asset: "EUR", amount: D(200), role: "IN" }] },
    ];
    const res = computeIndividualTax(valueTransactions(txs, prices), prices);
    expect(res.disposals).toHaveLength(1);
    expect(res.years[0].totalProceedsEur.toString()).toBe("200");
    expect(res.years[0].exempt).toBe(true);
    expect(res.years[0].estimatedTaxPfuEur.toString()).toBe("0");
  });
});
