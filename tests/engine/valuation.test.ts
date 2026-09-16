import { describe, it, expect } from "vitest";
import { createPriceTable, valueTransactions } from "@/lib/engine/valuation";
import { D } from "@/lib/engine/money";
import type { CanonicalTx } from "@/lib/engine/model";

const t = (iso: string) => new Date(iso);
const prices = createPriceTable([
  { asset: "BTC", at: t("2025-03-01T10:00:00Z"), priceEur: D(80000), source: "binance:BTCEUR" },
  { asset: "USDT", at: t("2025-03-01T10:00:00Z"), priceEur: D("0.92"), source: "binance:EURUSDT^-1" },
  { asset: "USD", at: t("2025-02-28T00:00:00Z"), priceEur: D("0.95"), source: "ecb" },
  { asset: "BNB", at: t("2025-03-01T10:00:00Z"), priceEur: D(500), source: "binance:BNBEUR" },
]);

describe("price table", () => {
  it("forward-fills within tolerance and handles EUR/wrappers", () => {
    expect(prices.get("BTC", t("2025-03-01T11:30:00Z"))?.priceEur.toString()).toBe("80000");
    expect(prices.get("BTC", t("2025-03-02T11:30:00Z"))).toBeUndefined(); // > 6 h
    expect(prices.get("USD", t("2025-03-02T11:30:00Z"))?.priceEur.toString()).toBe("0.95"); // week-end ffill
    expect(prices.get("EUR", t("2025-03-02T11:30:00Z"))?.priceEur.toString()).toBe("1");
    expect(prices.get("BUSD", t("2025-03-01T10:30:00Z"))?.priceEur.toString()).toBe("0.95"); // via USD
  });
});

describe("valueTransactions", () => {
  it("values a BTC/USDT trade from the stablecoin side and derives the implied BTC price", () => {
    const tx: CanonicalTx = {
      id: "1", accountId: "acc", source: "manual", externalId: "x", timestamp: t("2025-03-01T10:05:00Z"), type: "TRADE", category: "TRADE",
      legs: [
        { asset: "USDT", amount: D(10000), role: "OUT" },
        { asset: "BTC", amount: D("0.12"), role: "IN" },
        { asset: "BNB", amount: D("0.01"), role: "FEE" },
      ],
    };
    const [v] = valueTransactions([tx], prices);
    expect(v.grossValueEur.toString()).toBe("9200");
    const btc = v.legs.find((l) => l.asset === "BTC")!;
    expect(btc.unitPriceEur.toFixed(2)).toBe("76666.67");
    expect(btc.priceSource).toBe("implied:USDT");
    expect(v.feeValueEur.toString()).toBe("5");
    expect(v.warnings).toHaveLength(0);
  });

  it("warns when no price is available", () => {
    const tx: CanonicalTx = {
      id: "2", accountId: "acc", source: "manual", externalId: "y", timestamp: t("2025-03-01T10:05:00Z"), type: "CRYPTO_DEPOSIT", category: "UNKNOWN",
      legs: [{ asset: "XYZ", amount: D(10), role: "IN" }],
    };
    const [v] = valueTransactions([tx], prices);
    expect(v.warnings.length).toBe(1);
    expect(v.grossValueEur.toString()).toBe("0");
  });
});

import { fiscalYearBoundsZoned, zonedDateStamp, zonedEndOfDay, zonedMidnight } from "@/lib/engine/tz";

describe("accounting calendar (Europe/Paris)", () => {
  it("computes Paris midnight and end of day in winter and summer", () => {
    expect(zonedMidnight(2025, 1, 1).toISOString()).toBe("2024-12-31T23:00:00.000Z");
    expect(zonedEndOfDay(2025, 12, 31).toISOString()).toBe("2025-12-31T22:59:59.999Z");
    expect(zonedMidnight(2025, 7, 1).toISOString()).toBe("2025-06-30T22:00:00.000Z");
  });
  it("stamps a late-UTC trade on the next Paris day", () => {
    expect(zonedDateStamp(new Date("2025-12-31T23:30:00Z"))).toBe("20260101");
    expect(zonedDateStamp(new Date("2025-06-30T21:59:59Z"))).toBe("20250630");
  });
  it("derives fiscal year bounds", () => {
    const fy = fiscalYearBoundsZoned(12, 31, new Date("2025-03-15T12:00:00Z"));
    expect(fy.label).toBe("2025");
    expect(fy.start.toISOString()).toBe("2024-12-31T23:00:00.000Z");
    expect(fy.end.toISOString()).toBe("2025-12-31T22:59:59.999Z");
    const june = fiscalYearBoundsZoned(6, 30, new Date("2025-09-01T00:00:00Z"));
    expect(june.label).toBe("01/07/2025 → 30/06/2026");
  });
});
