import { describe, it, expect } from "vitest";
import { createPriceTable, valueTransactions } from "@/lib/engine/valuation";
import { COUNTRY_ORDER, COUNTRY_PACKS, countryChoices, getPack } from "@/lib/countries/registry";
import { D } from "@/lib/engine/money";
import type { CanonicalTx } from "@/lib/engine/model";
import type { CountryCode } from "@/lib/countries/types";

const t = (iso: string) => new Date(iso);
const base = { accountId: "acc-1", source: "manual" as const, category: "TRADE" as const };

const prices = createPriceTable([
  { asset: "BTC", at: t("2024-02-01T00:00:00Z"), priceEur: D(40000), source: "test" },
  { asset: "BTC", at: t("2025-06-01T00:00:00Z"), priceEur: D(80000), source: "test" },
  { asset: "BTC", at: t("2026-01-01T00:00:00Z"), priceEur: D(90000), source: "test" },
  { asset: "BTC", at: t("2026-03-01T00:00:00Z"), priceEur: D(100000), source: "test" },
  { asset: "BTC", at: t("2026-12-31T00:00:00Z"), priceEur: D(95000), source: "test" },
  { asset: "ETH", at: t("2026-03-01T00:00:00Z"), priceEur: D(2500), source: "test" },
  { asset: "ETH", at: t("2026-06-01T00:00:00Z"), priceEur: D(3000), source: "test" },
  { asset: "ETH", at: t("2026-12-31T00:00:00Z"), priceEur: D(3200), source: "test" },
  { asset: "USD", at: t("2026-01-01T00:00:00Z"), priceEur: D("0.92"), source: "ecb" },
  { asset: "CHF", at: t("2026-01-01T00:00:00Z"), priceEur: D("1.05"), source: "ecb" },
], { toleranceCrypto: 400 * 24 * 60 * 60 * 1000, toleranceFiat: 800 * 24 * 60 * 60 * 1000 });

/**
 * One history, run through every country. 1 BTC bought at 40 000 € in
 * February 2024, half of it swapped for ETH in March 2026, the rest sold for
 * fiat in June 2026, plus a staking reward. Two years and a day separate the
 * purchase from the disposals, so the holding-period exemptions bite.
 */
const txs: CanonicalTx[] = [
  { ...base, id: "buy", externalId: "buy", type: "TRADE", timestamp: t("2024-02-01T10:00:00Z"),
    legs: [{ asset: "EUR", amount: D(40000), role: "OUT" }, { asset: "BTC", amount: D(1), role: "IN" }] },
  { ...base, id: "swap", externalId: "swap", type: "TRADE", timestamp: t("2026-03-01T10:00:00Z"),
    legs: [{ asset: "BTC", amount: D("0.5"), role: "OUT" }, { asset: "ETH", amount: D(20), role: "IN" }] },
  { ...base, id: "sell", externalId: "sell", type: "TRADE", timestamp: t("2026-06-01T10:00:00Z"),
    legs: [{ asset: "BTC", amount: D("0.5"), role: "OUT" }, { asset: "EUR", amount: D(45000), role: "IN" }] },
  { ...base, id: "stake", externalId: "stake", type: "REWARD", category: "STAKING_INCOME", timestamp: t("2026-06-01T12:00:00Z"),
    legs: [{ asset: "ETH", amount: D(1), role: "IN" }] },
];

const valued = valueTransactions(txs, prices);
const run = (code: CountryCode) => {
  const pack = getPack(code);
  return pack.engine({ country: code, currency: "EUR", valued, prices, years: [2026], now: t("2026-12-31T23:00:00Z") }, pack);
};
const year = (code: CountryCode) => run(code).years.find((y) => y.year === 2026);

describe("every pack is well formed", () => {
  it("covers the twelve jurisdictions asked for", () => {
    expect(COUNTRY_ORDER.sort()).toEqual(["AE", "AT", "BE", "CH", "DE", "ES", "FR", "IT", "NL", "OM", "PT", "QA"]);
    expect(Object.keys(COUNTRY_PACKS).length).toBe(12);
  });

  it("carries legal references, assumptions and a review status on every pack", () => {
    for (const code of COUNTRY_ORDER) {
      const p = COUNTRY_PACKS[code];
      expect(p.refs.length, `${code} refs`).toBeGreaterThan(0);
      expect(p.assumptions.length, `${code} assumptions`).toBeGreaterThan(0);
      expect(["DRAFT", "REVIEWED"]).toContain(p.review.status);
      expect(p.baseCurrency, `${code} currency`).toMatch(/^[A-Z]{3}$/);
      for (const ref of p.refs) expect(ref.code, `${code} ref code`).toBeTruthy();
    }
  });

  it("marks every pack as a draft until a local professional has reviewed it", () => {
    for (const code of COUNTRY_ORDER) expect(COUNTRY_PACKS[code].review.status).toBe("DRAFT");
  });

  it("produces a choice line per country", () => {
    const choices = countryChoices();
    expect(choices.length).toBe(12);
    expect(choices.find((c) => c.code === "CH")?.regime).toBe("WEALTH");
    expect(choices.find((c) => c.code === "NL")?.regime).toBe("WEALTH");
    expect(choices.find((c) => c.code === "AE")?.summary.fr).toContain("Aucun impôt");
    expect(choices.every((c) => !c.reviewed)).toBe(true);
  });

  it("runs on every country without throwing", () => {
    for (const code of COUNTRY_ORDER) {
      const r = run(code);
      expect(r.country, code).toBe(code);
      expect(r.assumptions.length, `${code} result assumptions`).toBeGreaterThan(0);
    }
  });
});

describe("the divergences between countries are real", () => {
  it("Germany exempts a disposal more than a year after acquisition", () => {
    const de = run("DE");
    expect(de.events.length).toBeGreaterThan(0);
    expect(de.events.every((e) => e.exempt)).toBe(true);
    expect(year("DE")?.taxableBase.toFixed(2)).toBe("0.00");
  });

  it("Portugal defers the swap and exempts the fiat sale held over 365 days", () => {
    const pt = run("PT");
    expect(pt.events.find((e) => e.txId === "sell")?.exempt).toBe(true);
    // The swap is shown, not hidden, and carries the reason it is not taxed.
    const swap = pt.events.find((e) => e.txId === "swap");
    expect(swap?.exempt).toBe(true);
    expect(swap?.exemptReason).toBeTruthy();
  });

  it("Austria defers a crypto-to-crypto swap instead of realising it", () => {
    const at = run("AT");
    expect(at.events.find((e) => e.txId === "swap")?.exempt).toBe(true);
    expect(at.events.find((e) => e.txId === "sell")).toBeDefined();
  });

  it("Spain taxes the swap where Austria and Portugal defer it", () => {
    expect(run("ES").events.find((e) => e.txId === "swap")?.exempt).toBeFalsy();
    expect(run("AT").events.find((e) => e.txId === "swap")?.exempt).toBe(true);
    expect(run("PT").events.find((e) => e.txId === "swap")?.exempt).toBe(true);
  });

  it("Belgium steps the cost up to the 31 December 2025 value", () => {
    const be = run("BE");
    const sale = be.events.find((e) => e.txId === "sell");
    expect(sale).toBeDefined();
    // Without the step-up the cost of the half sold would be 20 000 €, half of
    // the 2024 purchase. Stepped up to the reference value it is far higher,
    // so almost none of the pre-2026 appreciation is taxed.
    expect(sale!.costBasis.toNumber()).toBeGreaterThan(20000);
    expect(be.assumptions.join(" ")).toContain("31 décembre 2025");
  });

  it("France prices the disposal against the whole portfolio", () => {
    const fr = run("FR");
    expect(fr.regime).toContain("150");
    const sale = fr.events.find((e) => e.txId === "sell");
    expect(sale?.trace.steps.length).toBeGreaterThan(2);
  });

  it("Switzerland and the Netherlands tax the position, not the gain", () => {
    for (const code of ["CH", "NL"] as CountryCode[]) {
      const r = run(code);
      expect(r.regime).toBe("WEALTH");
      expect(r.events.every((e) => e.exempt)).toBe(true);
      expect(r.wealth.length).toBeGreaterThan(0);
    }
  });

  it("values the Dutch position at the start of 1 January and the Swiss one at the close of 31 December", () => {
    const nl = run("NL").wealth.find((w) => w.year === 2026);
    const ch = run("CH").wealth.find((w) => w.year === 2026);
    // The peildatum excludes trades made on 1 January itself: the quantity
    // cut-off is local midnight opening that day, 23:00 UTC the day before.
    expect(nl?.at.toISOString()).toBe("2025-12-31T23:00:00.000Z");
    expect(ch?.at.toISOString()).toBe("2026-12-31T22:59:59.999Z");
    // 1 BTC at 90 000 € held over the turn of the year, before the 2026 trades.
    expect(nl?.total.toFixed(0)).toBe("90000");
    // By the Swiss reference date the bitcoin is gone: 20 ETH from the swap
    // plus 1 ETH of staking, at 3 200 €.
    expect(ch?.total.toFixed(0)).toBe("67200");
  });

  it("applies the Dutch deemed return and exempt capital of the year", () => {
    const nl = run("NL").wealth.find((w) => w.year === 2026);
    // 1 BTC at 90 000 € on 1 January 2026.
    expect(nl?.total.toFixed(0)).toBe("90000");
    const line = nl?.formLines.find((f) => f.box === "estimation");
    // (90 000 − 59 357) × 6,00 % × 36 % = 661,89
    expect(line?.value).toBe("661.89");
  });

  it("charges no personal tax in the Gulf but still traces every disposal", () => {
    for (const code of ["AE", "OM", "QA"] as CountryCode[]) {
      const r = run(code);
      expect(r.events.length, code).toBeGreaterThan(0);
      expect(r.events.every((e) => e.exempt), code).toBe(true);
      expect(year(code)?.estimatedTax, code).toBeNull();
    }
  });

  it("warns that Oman legislated a personal income tax for 2028", () => {
    const notes = year("OM")?.notes.join(" ") ?? "";
    expect(notes).toContain("2028");
    expect(notes).toContain("56/2025");
  });

  it("taxes Italian and Spanish gains at their own rates", () => {
    expect(year("IT")?.taxBreakdown.some((b) => b.rate === "0.33")).toBe(true);
    expect(year("ES")?.taxableBase.toNumber()).toBeGreaterThan(0);
  });
});

describe("form lines are safe to render", () => {
  it("never leaves a monetary box holding text", () => {
    for (const code of COUNTRY_ORDER) {
      const r = run(code);
      for (const y of r.years) {
        for (const l of y.formLines) {
          if (l.kind === "TEXT") continue;
          const n = Number(l.raw ?? l.value);
          expect(Number.isFinite(n), `${code} ${l.form} ${l.box}: "${l.raw ?? l.value}"`).toBe(true);
        }
      }
      for (const w of r.wealth) {
        for (const l of w.formLines) {
          if (l.kind === "TEXT") continue;
          expect(Number.isFinite(Number(l.raw ?? l.value)), `${code} ${l.form} ${l.box}`).toBe(true);
        }
      }
    }
  });

  it("marks France's portfolio-value box as text, since it holds one figure per disposal", () => {
    const fr = run("FR").years.at(-1);
    const box212 = fr?.formLines.find((l) => l.box === "212");
    expect(box212?.kind).toBe("TEXT");
  });
});
