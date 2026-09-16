import { ZERO } from "@/lib/engine/money";
import type { Category, TxType } from "@/lib/engine/model";
import { buildTx, col, countCols, emptyResult, finalise, findAddress, hasCols, mkId, norm, num, parseDate, tradeLegs, type CsvFormat, type ParseContext } from "./shared";

/**
 * Coinbase — "Transaction history" report (Reports → Generate report → Transaction history).
 *
 * Coinbase has shipped several layouts; the current one carries the columns
 * ID, Timestamp, Transaction Type, Asset, Quantity Transacted, Price Currency,
 * Price at Transaction, Subtotal, Total (inclusive of fees and/or spread),
 * Fees and/or Spread and Notes. Older exports omit ID and name the price
 * columns after the fiat currency. Both are read here.
 */
const TYPE_MAP: Record<string, { type: TxType; category: Category; direction: "IN" | "OUT" }> = {
  buy: { type: "TRADE", category: "TRADE", direction: "IN" },
  "advanced trade buy": { type: "TRADE", category: "TRADE", direction: "IN" },
  "advance trade buy": { type: "TRADE", category: "TRADE", direction: "IN" },
  sell: { type: "TRADE", category: "TRADE", direction: "OUT" },
  "advanced trade sell": { type: "TRADE", category: "TRADE", direction: "OUT" },
  "advance trade sell": { type: "TRADE", category: "TRADE", direction: "OUT" },
  convert: { type: "TRADE", category: "TRADE", direction: "OUT" },
  send: { type: "CRYPTO_WITHDRAWAL", category: "UNKNOWN", direction: "OUT" },
  receive: { type: "CRYPTO_DEPOSIT", category: "UNKNOWN", direction: "IN" },
  deposit: { type: "FIAT_DEPOSIT", category: "BANK_TRANSFER", direction: "IN" },
  "fiat deposit": { type: "FIAT_DEPOSIT", category: "BANK_TRANSFER", direction: "IN" },
  withdrawal: { type: "FIAT_WITHDRAWAL", category: "BANK_TRANSFER", direction: "OUT" },
  "fiat withdrawal": { type: "FIAT_WITHDRAWAL", category: "BANK_TRANSFER", direction: "OUT" },
  "pro withdrawal": { type: "CRYPTO_WITHDRAWAL", category: "INTERNAL_TRANSFER", direction: "OUT" },
  "pro deposit": { type: "CRYPTO_DEPOSIT", category: "INTERNAL_TRANSFER", direction: "IN" },
  "exchange withdrawal": { type: "CRYPTO_WITHDRAWAL", category: "INTERNAL_TRANSFER", direction: "OUT" },
  "exchange deposit": { type: "CRYPTO_DEPOSIT", category: "INTERNAL_TRANSFER", direction: "IN" },
  "rewards income": { type: "REWARD", category: "STAKING_INCOME", direction: "IN" },
  "staking income": { type: "REWARD", category: "STAKING_INCOME", direction: "IN" },
  "inflation reward": { type: "REWARD", category: "STAKING_INCOME", direction: "IN" },
  "learning reward": { type: "REWARD", category: "AIRDROP", direction: "IN" },
  "coinbase earn": { type: "REWARD", category: "AIRDROP", direction: "IN" },
  airdrop: { type: "REWARD", category: "AIRDROP", direction: "IN" },
  "card spend": { type: "CRYPTO_WITHDRAWAL", category: "PURCHASE_GOODS", direction: "OUT" },
  "card buy back": { type: "CRYPTO_DEPOSIT", category: "UNKNOWN", direction: "IN" },
  subscription: { type: "FEE", category: "TRADE", direction: "OUT" },
};

export const COINBASE: CsvFormat = {
  id: "coinbase-transactions",
  platform: "Coinbase",
  label: "Coinbase — Transaction history",
  where: "Coinbase → Reports → Generate report → Transaction history (CSV)",
  detect(header) {
    if (!hasCols(header, "Transaction Type", "Asset")) return 0;
    const score = countCols(header, ["Timestamp", "Transaction Type", "Asset", "Quantity Transacted", "Subtotal", "Fees"]);
    return score >= 4 ? 0.95 : score >= 3 ? 0.6 : 0;
  },
  parse(rows, ctx: ParseContext) {
    const res = emptyResult(this.id, this.platform);
    const dates: Date[] = [];
    for (const row of rows) {
      res.rowCount++;
      const when = parseDate(col(row, "Timestamp", "Time", "Date"));
      const rawType = col(row, "Transaction Type", "Type");
      const asset = col(row, "Asset", "Currency").toUpperCase();
      const quantity = num(col(row, "Quantity Transacted", "Quantity", "Amount"));
      if (!when || !asset || quantity.isZero()) { res.ignoredRows++; continue; }
      dates.push(when);
      const fiat = (col(row, "Price Currency", "Spot Price Currency") || detectFiat(row) || "EUR").toUpperCase();
      const subtotal = num(col(row, "Subtotal"));
      const total = num(col(row, "Total (inclusive of fees and/or spread)", "Total"));
      const fee = num(col(row, "Fees and/or Spread", "Fees", "Fee"));
      const notes = col(row, "Notes", "Note");
      const id = col(row, "ID", "Transaction ID") || undefined;
      const mapped = TYPE_MAP[norm(rawType)];
      const externalId = mkId(this.platform, [id, when.getTime(), rawType, asset, quantity.toString()]);
      const ref = `${rawType} ${when.toISOString().replace("T", " ").slice(0, 19)} UTC`;

      if (!mapped) {
        res.unknownOperations[rawType] = (res.unknownOperations[rawType] ?? 0) + 1;
        res.transactions.push(buildTx({ ctx, externalId, timestamp: when, type: quantity.gt(0) ? "CRYPTO_DEPOSIT" : "CRYPTO_WITHDRAWAL", category: "UNKNOWN", legs: [{ asset, amount: quantity.abs(), role: quantity.gt(0) ? "IN" : "OUT" }], ref, note: `Opération Coinbase non reconnue : ${rawType}${notes ? ` — ${notes}` : ""}` }));
        continue;
      }

      if (mapped.type === "TRADE") {
        // "Convert" carries the counter asset in the notes: "Converted 0.5 ETH to 1200 USDC"
        const conv = notes.match(/converted?\s+([\d.,]+)\s+([A-Z0-9]{2,10})\s+to\s+([\d.,]+)\s+([A-Z0-9]{2,10})/i);
        if (conv) {
          res.transactions.push(buildTx({
            ctx, externalId, timestamp: when, type: "TRADE", category: "TRADE",
            legs: tradeLegs([{ asset: conv[2], amount: num(conv[1]) }], [{ asset: conv[4], amount: num(conv[3]) }], fee.gt(0) ? [{ asset: fiat, amount: fee.abs() }] : []),
            ref, note: notes,
          }));
          continue;
        }
        const fiatAmount = (subtotal.abs().gt(0) ? subtotal.abs() : total.abs().minus(fee.abs())).abs();
        const legs = mapped.direction === "IN"
          ? tradeLegs([{ asset: fiat, amount: fiatAmount }], [{ asset, amount: quantity.abs() }], fee.gt(0) ? [{ asset: fiat, amount: fee.abs() }] : [])
          : tradeLegs([{ asset, amount: quantity.abs() }], [{ asset: fiat, amount: fiatAmount }], fee.gt(0) ? [{ asset: fiat, amount: fee.abs() }] : []);
        res.transactions.push(buildTx({ ctx, externalId, timestamp: when, type: "TRADE", category: "TRADE", legs, ref, note: notes || undefined }));
        continue;
      }

      const address = findAddress(notes);
      const legs = mapped.direction === "IN"
        ? [{ asset, amount: quantity.abs(), role: "IN" as const }]
        : [{ asset, amount: quantity.abs(), role: "OUT" as const }];
      if (fee.gt(0) && mapped.type !== "REWARD") legs.push({ asset: mapped.type.startsWith("FIAT") ? fiat : asset, amount: fee.abs(), role: "FEE" } as never);
      res.transactions.push(buildTx({
        ctx, externalId, timestamp: when, type: mapped.type, category: mapped.category, legs, ref,
        note: notes || rawType, address, bank: mapped.type.startsWith("FIAT"),
      }));
    }
    return finalise(res, dates);
  },
};

function detectFiat(row: Record<string, string>): string | undefined {
  for (const k of Object.keys(row)) {
    const m = k.match(/\b(EUR|USD|GBP|CHF|CAD|AUD)\b/i);
    if (m) return m[1].toUpperCase();
  }
  return undefined;
}

void ZERO;
