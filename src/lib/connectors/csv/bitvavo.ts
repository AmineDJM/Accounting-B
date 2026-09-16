import { ZERO } from "@/lib/engine/money";
import type { Category, TxType } from "@/lib/engine/model";
import type { Leg } from "@/lib/engine/model";
import { buildTx, col, countCols, emptyResult, finalise, findAddress, hasCols, mkId, norm, num, parseDate, type CsvFormat, type ParseContext } from "./shared";

/**
 * Bitvavo — transaction history export.
 *
 * Bitvavo writes one row per operation with the amount in the asset's own
 * units, the fee in its own currency and, for a buy or a sell, the euro
 * counter-value in a separate column. That counter-value is the price the
 * platform actually executed at, so it is passed through as a known unit price
 * rather than re-derived from a market feed.
 */
const TYPES: Record<string, { type: TxType; category: Category }> = {
  buy: { type: "TRADE", category: "TRADE" },
  sell: { type: "TRADE", category: "TRADE" },
  deposit: { type: "CRYPTO_DEPOSIT", category: "UNKNOWN" },
  withdrawal: { type: "CRYPTO_WITHDRAWAL", category: "UNKNOWN" },
  staking: { type: "REWARD", category: "STAKING_INCOME" },
  "staking reward": { type: "REWARD", category: "STAKING_INCOME" },
  "affiliate": { type: "REWARD", category: "AIRDROP" },
  rebate: { type: "REWARD", category: "AIRDROP" },
  "internal transfer": { type: "CRYPTO_DEPOSIT", category: "INTERNAL_TRANSFER" },
};

export const BITVAVO: CsvFormat = {
  id: "bitvavo",
  platform: "Bitvavo",
  label: "Bitvavo — transaction history (CSV)",
  where: "Bitvavo → Portefeuille → Historique → Exporter (CSV)",
  detect(header, _rows, fileName) {
    if (/bitvavo/i.test(fileName)) return 1;
    const score = countCols(header, ["Timezone", "Type", "Currency", "Amount", "Quote Currency", "Quote Price", "Received / Paid Currency"]);
    if (hasCols(header, "Quote Currency", "Quote Price") && hasCols(header, "Type", "Amount")) return 0.9;
    return score >= 4 ? 0.6 : 0;
  },
  parse(rows, ctx: ParseContext) {
    const res = emptyResult(BITVAVO.id, BITVAVO.platform);
    const dates: Date[] = [];
    for (const row of rows) {
      res.rowCount += 1;
      const when = parseDate(`${col(row, "Date")} ${col(row, "Time")}`.trim() || col(row, "Date", "Timestamp"));
      if (!when) { res.ignoredRows += 1; continue; }
      const rawType = norm(col(row, "Type", "Transaction type"));
      const mapped = TYPES[rawType];
      const asset = col(row, "Currency", "Asset").toUpperCase();
      const amount = num(col(row, "Amount")).abs();
      const feeAsset = (col(row, "Fee currency", "Fee Currency") || "EUR").toUpperCase();
      const fee = num(col(row, "Fee amount", "Fee")).abs();
      const quoteAsset = (col(row, "Quote Currency", "Received / Paid Currency") || "EUR").toUpperCase();
      const quoteAmount = num(col(row, "Received / Paid Amount", "Quote Amount")).abs();
      const quotePrice = num(col(row, "Quote Price", "Price"));
      const ref = col(row, "Transaction ID", "Tx ID", "Id") || undefined;
      const address = findAddress(col(row, "Address", "Recipient"));
      const id = mkId(BITVAVO.platform, [ctx.accountId, ref, when.getTime(), rawType, asset, amount.toString()]);

      if (!mapped) {
        res.unknownOperations[rawType || "(vide)"] = (res.unknownOperations[rawType || "(vide)"] ?? 0) + 1;
        if (amount.gt(0)) {
          res.transactions.push(buildTx({ ctx, externalId: id, timestamp: when, type: "ADJUSTMENT", category: "UNKNOWN", legs: [{ asset, amount, role: "IN" }], ref, note: col(row, "Type") }));
          dates.push(when);
        }
        continue;
      }

      const known = quotePrice.gt(0) && quoteAsset === "EUR" ? { [asset]: quotePrice } : undefined;

      if (mapped.type === "TRADE") {
        const isBuy = rawType === "buy";
        const legs: Leg[] = isBuy
          ? [{ asset: quoteAsset, amount: quoteAmount, role: "OUT" }, { asset, amount, role: "IN" }]
          : [{ asset, amount, role: "OUT" }, { asset: quoteAsset, amount: quoteAmount, role: "IN" }];
        if (fee.gt(0)) legs.push({ asset: feeAsset, amount: fee, role: "FEE" as const });
        res.transactions.push(buildTx({ ctx, externalId: id, timestamp: when, type: "TRADE", category: "TRADE", legs, ref, knownUnitPriceEur: known }));
        dates.push(when);
        continue;
      }

      const isFiatMove = asset === "EUR" || asset === "USD";
      const type: TxType = mapped.type === "CRYPTO_DEPOSIT" && isFiatMove ? "FIAT_DEPOSIT" : mapped.type === "CRYPTO_WITHDRAWAL" && isFiatMove ? "FIAT_WITHDRAWAL" : mapped.type;
      const role = type === "CRYPTO_WITHDRAWAL" || type === "FIAT_WITHDRAWAL" ? ("OUT" as const) : ("IN" as const);
      const legs: Leg[] = [{ asset, amount, role }];
      if (fee.gt(0)) legs.push({ asset: feeAsset, amount: fee, role: "FEE" as const });
      res.transactions.push(buildTx({
        ctx, externalId: id, timestamp: when, type,
        category: isFiatMove ? "BANK_TRANSFER" : mapped.category,
        legs, ref, address, bank: isFiatMove, knownUnitPriceEur: known,
      }));
      dates.push(when);
    }
    if (rows.length && !res.transactions.length) res.warnings.push("Aucune opération reconnue : vérifiez que l'export provient bien de Bitvavo et couvre la période attendue.");
    void ZERO;
    return finalise(res, dates);
  },
};
