import type { Category, Leg, TxType } from "@/lib/engine/model";
import { buildTx, col, countCols, emptyResult, finalise, hasCols, mkId, norm, num, parseDate, type CsvFormat, type ParseContext } from "./shared";

/**
 * Bitstamp — transactions export.
 *
 * Bitstamp writes amounts as "0.12345678 BTC": the value and its ticker share
 * one cell, so every amount column is split before use. A "Market" row carries
 * both sides of a trade, `Amount` being what was bought or sold and `Value`
 * the money side.
 */
const AMOUNT_RE = /^\s*(-?[\d.,\s]+)\s*([A-Za-z0-9]{2,10})\s*$/;

/** Splits "0.5 BTC" into its amount and its ticker. */
export function splitAmount(raw: string): { amount: ReturnType<typeof num>; asset: string } | null {
  const m = raw.match(AMOUNT_RE);
  if (!m) return null;
  return { amount: num(m[1]).abs(), asset: m[2].toUpperCase() };
}

const TYPES: Record<string, { type: TxType; category: Category }> = {
  market: { type: "TRADE", category: "TRADE" },
  "sub account transfer": { type: "CRYPTO_DEPOSIT", category: "INTERNAL_TRANSFER" },
  deposit: { type: "CRYPTO_DEPOSIT", category: "UNKNOWN" },
  withdrawal: { type: "CRYPTO_WITHDRAWAL", category: "UNKNOWN" },
  "staking reward": { type: "REWARD", category: "STAKING_INCOME" },
  "referral reward": { type: "REWARD", category: "AIRDROP" },
};

export const BITSTAMP: CsvFormat = {
  id: "bitstamp",
  platform: "Bitstamp",
  label: "Bitstamp — transactions (CSV)",
  where: "Bitstamp → Account → Balance → Transactions → Open CSV",
  detect(header, rows, fileName) {
    if (/bitstamp/i.test(fileName)) return 1;
    if (hasCols(header, "Type", "Datetime", "Amount", "Value", "Rate", "Fee")) return 0.9;
    const looksLikeAmounts = rows.slice(0, 5).some((r) => AMOUNT_RE.test(col(r, "Amount")));
    return countCols(header, ["Type", "Datetime", "Amount", "Value", "Rate"]) >= 4 && looksLikeAmounts ? 0.7 : 0;
  },
  parse(rows, ctx: ParseContext) {
    const res = emptyResult(BITSTAMP.id, BITSTAMP.platform);
    const dates: Date[] = [];
    for (const row of rows) {
      res.rowCount += 1;
      const when = parseDate(col(row, "Datetime", "Date"));
      if (!when) { res.ignoredRows += 1; continue; }
      const rawType = norm(col(row, "Type"));
      const subtype = norm(col(row, "Subtype", "Sub Type", "Sub-type"));
      const mapped = TYPES[rawType];
      const amount = splitAmount(col(row, "Amount"));
      const value = splitAmount(col(row, "Value"));
      const fee = splitAmount(col(row, "Fee"));
      const rate = splitAmount(col(row, "Rate"));
      const ref = col(row, "ID", "Transaction ID") || undefined;
      const id = mkId(BITSTAMP.platform, [ctx.accountId, ref, when.getTime(), rawType, subtype, col(row, "Amount")]);
      const known = rate && rate.asset === "EUR" && amount && rate.amount.gt(0) ? { [amount.asset]: rate.amount } : undefined;

      if (!mapped || !amount) {
        res.unknownOperations[rawType || "(vide)"] = (res.unknownOperations[rawType || "(vide)"] ?? 0) + 1;
        if (amount) {
          res.transactions.push(buildTx({ ctx, externalId: id, timestamp: when, type: "ADJUSTMENT", category: "UNKNOWN", legs: [{ asset: amount.asset, amount: amount.amount, role: "IN" }], ref, note: col(row, "Type") }));
          dates.push(when);
        } else {
          res.ignoredRows += 1;
        }
        continue;
      }

      if (mapped.type === "TRADE" && value) {
        // Subtype "Buy" means the Amount leg came in and the Value leg went out.
        const isBuy = subtype === "buy";
        const legs: Leg[] = isBuy
          ? [{ asset: value.asset, amount: value.amount, role: "OUT" }, { asset: amount.asset, amount: amount.amount, role: "IN" }]
          : [{ asset: amount.asset, amount: amount.amount, role: "OUT" }, { asset: value.asset, amount: value.amount, role: "IN" }];
        if (fee && fee.amount.gt(0)) legs.push({ asset: fee.asset, amount: fee.amount, role: "FEE" });
        res.transactions.push(buildTx({ ctx, externalId: id, timestamp: when, type: "TRADE", category: "TRADE", legs, ref, knownUnitPriceEur: known }));
        dates.push(when);
        continue;
      }

      const movingFiat = ["EUR", "USD", "GBP"].includes(amount.asset);
      const outgoing = mapped.type === "CRYPTO_WITHDRAWAL";
      const type: TxType = movingFiat ? (outgoing ? "FIAT_WITHDRAWAL" : "FIAT_DEPOSIT") : mapped.type;
      const legs: Leg[] = [{ asset: amount.asset, amount: amount.amount, role: outgoing ? "OUT" : "IN" }];
      if (fee && fee.amount.gt(0)) legs.push({ asset: fee.asset, amount: fee.amount, role: "FEE" });
      res.transactions.push(buildTx({
        ctx, externalId: id, timestamp: when, type,
        category: movingFiat ? "BANK_TRANSFER" : mapped.category,
        legs, ref, bank: movingFiat, knownUnitPriceEur: known,
      }));
      dates.push(when);
    }
    return finalise(res, dates);
  },
};
