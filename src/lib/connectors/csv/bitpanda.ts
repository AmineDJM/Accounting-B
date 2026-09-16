import type { Category, Leg, TxType } from "@/lib/engine/model";
import { buildTx, col, countCols, emptyResult, finalise, hasCols, mkId, norm, num, parseDate, type CsvFormat, type ParseContext } from "./shared";

/**
 * Bitpanda — transaction export.
 *
 * Bitpanda's export carries both sides of a trade on one row: `Amount Fiat`
 * with `Fiat` for the money side and `Amount Asset` with `Asset` for the token
 * side, plus `Asset market price` in the fiat currency. The `In/Out` column
 * gives the direction. The file opens with a block of comment lines before the
 * real header, which the loader strips before parsing.
 */
const TYPES: Record<string, { type: TxType; category: Category }> = {
  buy: { type: "TRADE", category: "TRADE" },
  sell: { type: "TRADE", category: "TRADE" },
  trade: { type: "TRADE", category: "TRADE" },
  deposit: { type: "CRYPTO_DEPOSIT", category: "UNKNOWN" },
  withdrawal: { type: "CRYPTO_WITHDRAWAL", category: "UNKNOWN" },
  transfer: { type: "CRYPTO_DEPOSIT", category: "INTERNAL_TRANSFER" },
  "refund": { type: "ADJUSTMENT", category: "UNKNOWN" },
};

/** Bitpanda prefixes its export with comment lines; the header is the first row naming a Transaction ID. */
export function stripBitpandaPreamble(text: string): string {
  const lines = text.split(/\r?\n/);
  const idx = lines.findIndex((l) => /transaction\s*id/i.test(l) && /type/i.test(l));
  return idx > 0 ? lines.slice(idx).join("\n") : text;
}

export const BITPANDA: CsvFormat = {
  id: "bitpanda",
  platform: "Bitpanda",
  label: "Bitpanda — transaction export (CSV)",
  where: "Bitpanda → Historique → Exporter → Toutes les transactions (CSV)",
  detect(header, _rows, fileName) {
    if (/bitpanda/i.test(fileName)) return 1;
    if (hasCols(header, "Amount Fiat", "Amount Asset", "Asset market price")) return 0.95;
    return countCols(header, ["Transaction ID", "Timestamp", "Transaction Type", "In/Out", "Amount Fiat", "Fiat", "Asset"]) >= 5 ? 0.7 : 0;
  },
  parse(rows, ctx: ParseContext) {
    const res = emptyResult(BITPANDA.id, BITPANDA.platform);
    const dates: Date[] = [];
    for (const row of rows) {
      res.rowCount += 1;
      const when = parseDate(col(row, "Timestamp", "Date"));
      if (!when) { res.ignoredRows += 1; continue; }
      const rawType = norm(col(row, "Transaction Type", "Type"));
      const direction = norm(col(row, "In/Out"));
      const mapped = TYPES[rawType];
      const fiat = (col(row, "Fiat", "Fiat currency") || "EUR").toUpperCase();
      const fiatAmount = num(col(row, "Amount Fiat")).abs();
      const asset = (col(row, "Asset", "Cryptocoin") || fiat).toUpperCase();
      const assetAmount = num(col(row, "Amount Asset", "Amount Cryptocoin")).abs();
      const fee = num(col(row, "Fee")).abs();
      const feeAsset = (col(row, "Fee asset", "Fee currency") || fiat).toUpperCase();
      const price = num(col(row, "Asset market price"));
      const priceCurrency = (col(row, "Asset market price currency") || fiat).toUpperCase();
      const ref = col(row, "Transaction ID", "ID") || undefined;
      const id = mkId(BITPANDA.platform, [ctx.accountId, ref, when.getTime(), rawType, asset]);
      const known = price.gt(0) && priceCurrency === "EUR" ? { [asset]: price } : undefined;

      if (!mapped) {
        res.unknownOperations[rawType || "(vide)"] = (res.unknownOperations[rawType || "(vide)"] ?? 0) + 1;
        const amount = assetAmount.gt(0) ? assetAmount : fiatAmount;
        const a = assetAmount.gt(0) ? asset : fiat;
        if (amount.gt(0)) {
          res.transactions.push(buildTx({ ctx, externalId: id, timestamp: when, type: "ADJUSTMENT", category: "UNKNOWN", legs: [{ asset: a, amount, role: direction === "outgoing" ? "OUT" : "IN" }], ref, note: col(row, "Transaction Type") }));
          dates.push(when);
        }
        continue;
      }

      if (mapped.type === "TRADE" && assetAmount.gt(0) && fiatAmount.gt(0)) {
        const isBuy = rawType === "buy" || direction === "incoming";
        const legs: Leg[] = isBuy
          ? [{ asset: fiat, amount: fiatAmount, role: "OUT" }, { asset, amount: assetAmount, role: "IN" }]
          : [{ asset, amount: assetAmount, role: "OUT" }, { asset: fiat, amount: fiatAmount, role: "IN" }];
        if (fee.gt(0)) legs.push({ asset: feeAsset, amount: fee, role: "FEE" });
        res.transactions.push(buildTx({ ctx, externalId: id, timestamp: when, type: "TRADE", category: "TRADE", legs, ref, knownUnitPriceEur: known }));
        dates.push(when);
        continue;
      }

      const movingFiat = assetAmount.lte(0) || asset === fiat;
      const amount = movingFiat ? fiatAmount : assetAmount;
      const movedAsset = movingFiat ? fiat : asset;
      if (amount.lte(0)) { res.ignoredRows += 1; continue; }
      const outgoing = direction === "outgoing" || mapped.type === "CRYPTO_WITHDRAWAL";
      const type: TxType = movingFiat
        ? (outgoing ? "FIAT_WITHDRAWAL" : "FIAT_DEPOSIT")
        : mapped.type === "REWARD" ? "REWARD" : outgoing ? "CRYPTO_WITHDRAWAL" : "CRYPTO_DEPOSIT";
      const legs: Leg[] = [{ asset: movedAsset, amount, role: outgoing ? "OUT" : "IN" }];
      if (fee.gt(0)) legs.push({ asset: feeAsset, amount: fee, role: "FEE" });
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
