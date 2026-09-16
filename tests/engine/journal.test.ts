import { describe, it, expect } from "vitest";
import { createPriceTable, valueTransactions } from "@/lib/engine/valuation";
import { generateJournal } from "@/lib/engine/journal";
import { buildFecRows } from "@/lib/engine/fecbuild";
import { validateFec, serializeFec, parseFec, fecFileName } from "@/lib/engine/fec";
import { D, ZERO } from "@/lib/engine/money";
import type { CanonicalTx } from "@/lib/engine/model";
import { fecDate } from "@/lib/engine/fec";
import { zonedEndOfDay, zonedMidnight } from "@/lib/engine/tz";

const t = (iso: string) => new Date(iso);
const acc = "binance-1";
const base = { accountId: acc, source: "manual" as const, category: "TRADE" as const };

const prices = createPriceTable([
  { asset: "BTC", at: t("2025-01-02T00:00:00Z"), priceEur: D(90000), source: "test" },
  { asset: "BTC", at: t("2025-06-01T00:00:00Z"), priceEur: D(100000), source: "test" },
  { asset: "BTC", at: t("2025-12-31T00:00:00Z"), priceEur: D(80000), source: "test" },
  { asset: "ETH", at: t("2025-06-01T00:00:00Z"), priceEur: D(2500), source: "test" },
  { asset: "ETH", at: t("2025-12-31T00:00:00Z"), priceEur: D(3000), source: "test" },
  { asset: "BNB", at: t("2025-01-02T00:00:00Z"), priceEur: D(600), source: "test" },
  { asset: "BNB", at: t("2025-06-01T00:00:00Z"), priceEur: D(600), source: "test" },
  { asset: "BNB", at: t("2025-12-31T00:00:00Z"), priceEur: D(600), source: "test" },
], { toleranceCrypto: 36 * 60 * 60 * 1000 });

const txs: CanonicalTx[] = [
  { ...base, id: "dep", externalId: "dep", type: "FIAT_DEPOSIT", category: "BANK_TRANSFER", timestamp: t("2025-01-01T09:00:00Z"), ref: "SEPA-1",
    legs: [{ asset: "EUR", amount: D(10000), role: "IN" }, { asset: "EUR", amount: D(2), role: "FEE" }], counterparty: { kind: "BANK", label: "virement SEPA" } },
  { ...base, id: "buy", externalId: "buy", type: "TRADE", timestamp: t("2025-01-02T10:00:00Z"), ref: "T1",
    legs: [{ asset: "EUR", amount: D(9000), role: "OUT" }, { asset: "BTC", amount: D("0.1"), role: "IN" }, { asset: "BNB", amount: D("0.015"), role: "FEE" }] },
  { ...base, id: "bnb", externalId: "bnb", type: "TRADE", timestamp: t("2025-01-02T09:00:00Z"), ref: "T0",
    legs: [{ asset: "EUR", amount: D(60), role: "OUT" }, { asset: "BNB", amount: D("0.1"), role: "IN" }] },
  { ...base, id: "swap", externalId: "swap", type: "TRADE", timestamp: t("2025-06-01T12:00:00Z"), ref: "T2",
    legs: [{ asset: "BTC", amount: D("0.05"), role: "OUT" }, { asset: "ETH", amount: D(2), role: "IN" }] },
  { ...base, id: "sell", externalId: "sell", type: "TRADE", timestamp: t("2025-06-01T13:00:00Z"), ref: "T3",
    legs: [{ asset: "ETH", amount: D(1), role: "OUT" }, { asset: "EUR", amount: D(2500), role: "IN" }, { asset: "EUR", amount: D("2.5"), role: "FEE" }] },
  { ...base, id: "wd", externalId: "wd", type: "FIAT_WITHDRAWAL", category: "BANK_TRANSFER", timestamp: t("2025-06-02T13:00:00Z"), ref: "W1",
    legs: [{ asset: "EUR", amount: D(1000), role: "OUT" }, { asset: "EUR", amount: D(1), role: "FEE" }] },
  { ...base, id: "pay", externalId: "pay", type: "CRYPTO_WITHDRAWAL", category: "PURCHASE_GOODS", timestamp: t("2025-06-01T15:00:00Z"), ref: "0xabc",
    legs: [{ asset: "ETH", amount: D("0.5"), role: "OUT" }, { asset: "ETH", amount: D("0.001"), role: "FEE" }], counterparty: { kind: "EXTERNAL", address: "0xsupplier", network: "ETH", txHash: "0xabc" } },
  { ...base, id: "rw", externalId: "rw", type: "REWARD", category: "STAKING_INCOME", timestamp: t("2025-06-01T16:00:00Z"), ref: "R1", note: "Simple Earn",
    legs: [{ asset: "ETH", amount: D("0.01"), role: "IN" }] },
];

const fy = { start: zonedMidnight(2025, 1, 1), end: zonedEndOfDay(2025, 12, 31) };
const accounts = [{ id: acc, label: "Binance pro", index: 1 }];

describe("generateJournal", () => {
  const valued = valueTransactions(txs, prices);
  const res = generateJournal(valued, { fiscalYear: fy, method: "CUMP", accounts, generateInventory: true, closingPrices: prices, validationDate: t("2026-01-15T00:00:00Z") });

  it("produces balanced entries with continuous numbering", () => {
    expect(res.entries.length).toBeGreaterThan(5);
    for (const e of res.entries) {
      const d = e.lines.reduce((a, l) => a.plus(l.debit), ZERO);
      const c = e.lines.reduce((a, l) => a.plus(l.credit), ZERO);
      expect(d.eq(c), `entry ${e.num} ${e.label}`).toBe(true);
    }
    const nums = res.entries.filter((e) => e.journalCode === "CR1").map((e) => e.seq);
    expect(nums).toEqual(nums.map((_, i) => i + 1));
    expect(res.totals.debit.eq(res.totals.credit)).toBe(true);
  });

  it("books a fiat deposit on 517 / 627 / 580", () => {
    const e = res.entries.find((x) => x.txId === "dep")!;
    const by = Object.fromEntries(e.lines.map((l) => [l.account, l]));
    expect(by["517101"].debit.toString()).toBe("10000");
    expect(by["627810"].debit.toString()).toBe("2");
    expect(by["580000"].credit.toString()).toBe("10002");
  });

  it("books a BTC purchase at cost and expenses the BNB fee as a disposal", () => {
    const e = res.entries.find((x) => x.txId === "buy")!;
    const tokens = e.lines.find((l) => l.accountLabel === "Jetons détenus – BTC")!;
    expect(tokens.debit.toString()).toBe("9000");
    expect(tokens.currencyAmount?.toString()).toBe("0.1");
    expect(e.lines.find((l) => l.account === "517101")!.credit.toString()).toBe("9000");
    const fee = e.lines.find((l) => l.account === "627820")!;
    expect(fee.debit.toString()).toBe("9"); // 0.015 BNB × 600
    const bnb = e.lines.find((l) => l.accountLabel === "Jetons détenus – BNB")!;
    expect(bnb.credit.toString()).toBe("9"); // bought at 600 → no gain
  });

  it("realises a gain on the crypto-to-crypto swap (companies: taxable event)", () => {
    const e = res.entries.find((x) => x.txId === "swap")!;
    const gain = e.lines.find((l) => l.account === "767400")!;
    // 0.05 BTC sold at 100 000 = 5 000 proceeds, cost 0.05 × 90 000 = 4 500 → +500
    expect(gain.credit.toString()).toBe("500");
    expect(e.lines.find((l) => l.accountLabel === "Jetons détenus – ETH")!.debit.toString()).toBe("5000");
    expect(e.lines.find((l) => l.accountLabel === "Jetons détenus – BTC")!.credit.toString()).toBe("4500");
  });

  it("books a supplier payment in crypto with the gain on the tokens used", () => {
    const e = res.entries.find((x) => x.txId === "pay")!;
    expect(e.lines.find((l) => l.account === "401000")!.debit.toString()).toBe("1250");
    // ETH acquired at 2 500 (5 000 / 2), paid at 2 500 → no gain on the principal; fee 0.001 ETH = 2.5 €
    expect(e.lines.find((l) => l.account === "627830")!.debit.toString()).toBe("2.5");
  });

  it("books staking rewards as income at market value", () => {
    const e = res.entries.find((x) => x.txId === "rw")!;
    expect(e.lines.find((l) => l.account === "768100")!.credit.toString()).toBe("25");
  });

  it("generates year-end valuation entries and reversals", () => {
    const inv = res.entries.filter((e) => e.kind === "INVENTORY");
    expect(inv.length).toBeGreaterThan(0);
    const btc = res.inventory.find((i) => i.asset === "BTC")!;
    // 0.05 BTC left at cost 4 500, market 0.05 × 80 000 = 4 000 → latent loss 500 → provision 500
    expect(btc.latentEur?.toString()).toBe("-500");
    expect(btc.provisionEur.toString()).toBe("500");
    expect(res.closingProvisions["BTC"].toString()).toBe("500");
    const btcEntry = inv.find((e) => e.pieceRef.startsWith("INV-BTC"))!;
    expect(btcEntry.lines.some((l) => l.account === "474200" && l.debit.eq(500))).toBe(true);
    expect(btcEntry.lines.some((l) => l.account === "686500" && l.debit.eq(500))).toBe(true);
    expect(res.reversalEntries.length).toBeGreaterThan(0);
    expect(fecDate(res.reversalEntries[0].date)).toBe("20260101");
    expect(fecDate(btcEntry.date)).toBe("20251231");
  });

  it("exports a valid FEC", () => {
    const rows = buildFecRows(res.entries, { validationDate: t("2026-01-15T00:00:00Z") });
    const report = validateFec(rows, fy);
    expect(report.issues.filter((i) => i.level === "error")).toEqual([]);
    expect(report.ok).toBe(true);
    const text = serializeFec(rows);
    expect(text.split("\r\n")[0]).toBe("JournalCode|JournalLib|EcritureNum|EcritureDate|CompteNum|CompteLib|CompAuxNum|CompAuxLib|PieceRef|PieceDate|EcritureLib|Debit|Credit|EcritureLet|DateLet|ValidDate|Montantdevise|Idevise");
    const back = parseFec(text);
    expect(back.length).toBe(rows.length);
    expect(back[0].Debit).toMatch(/^\d+,\d{2}$/);
    expect(fecFileName("123456789", fy.end)).toBe("123456789FEC20251231.txt");
  });

  it("detects broken FEC files", () => {
    const rows = buildFecRows(res.entries, { validationDate: t("2026-01-15T00:00:00Z") });
    rows[3].Debit = "1,5"; // wrong format
    rows[4].EcritureDate = "20240101"; // outside fiscal year
    const report = validateFec(rows, fy);
    expect(report.ok).toBe(false);
    expect(report.issues.map((i) => i.code)).toEqual(expect.arrayContaining(["NUM_FORMAT", "DATE_RANGE", "UNBALANCED"]));
  });

  it("uses opening positions and skips prior transactions", () => {
    const res2 = generateJournal(valued, {
      fiscalYear: { start: t("2025-06-01T00:00:00Z"), end: t("2026-05-31T23:59:59Z") }, method: "CUMP", accounts,
      openingPositions: [{ asset: "BTC", qty: D("0.1"), totalCost: D(9000), lots: [] }, { asset: "BNB", qty: D("0.085"), totalCost: D(51), lots: [] }],
    });
    expect(res2.entries.find((e) => e.txId === "buy")).toBeUndefined();
    const swap = res2.entries.find((e) => e.txId === "swap")!;
    expect(swap.lines.find((l) => l.account === "767400")!.credit.toString()).toBe("500");
  });
});
