import type { Category, Leg, TxType } from "@/lib/engine/model";
import { buildTx, col, countCols, emptyResult, finalise, hasCols, mkId, norm, num, parseDate, type CsvFormat, type ParseContext } from "./shared";

/**
 * Crypto.com — App transaction export.
 *
 * The App export is driven by a free-text `Transaction Kind` that has grown a
 * long tail of values. Each row carries the asset and amount on one side, the
 * counter-asset on the other, and a native euro or dollar value that the app
 * keeps as a known price. Card spending and cashback are the two kinds that
 * matter most and that generic importers usually get wrong: a card purchase is
 * a disposal of crypto against goods, and cashback is income.
 */
const KINDS: Record<string, { type: TxType; category: Category }> = {
  crypto_purchase: { type: "TRADE", category: "TRADE" },
  crypto_exchange: { type: "TRADE", category: "TRADE" },
  crypto_viban_exchange: { type: "TRADE", category: "TRADE" },
  viban_purchase: { type: "TRADE", category: "TRADE" },
  crypto_to_exchange_transfer: { type: "CRYPTO_WITHDRAWAL", category: "INTERNAL_TRANSFER" },
  exchange_to_crypto_transfer: { type: "CRYPTO_DEPOSIT", category: "INTERNAL_TRANSFER" },
  crypto_transfer: { type: "CRYPTO_WITHDRAWAL", category: "UNKNOWN" },
  crypto_withdrawal: { type: "CRYPTO_WITHDRAWAL", category: "UNKNOWN" },
  crypto_deposit: { type: "CRYPTO_DEPOSIT", category: "UNKNOWN" },
  viban_deposit: { type: "FIAT_DEPOSIT", category: "BANK_TRANSFER" },
  viban_withdrawal: { type: "FIAT_WITHDRAWAL", category: "BANK_TRANSFER" },
  card_top_up: { type: "CRYPTO_WITHDRAWAL", category: "INTERNAL_TRANSFER" },
  card_cashback_reverted: { type: "ADJUSTMENT", category: "UNKNOWN" },
  reimbursement: { type: "REWARD", category: "AIRDROP" },
  referral_card_cashback: { type: "REWARD", category: "AIRDROP" },
  referral_bonus: { type: "REWARD", category: "AIRDROP" },
  rewards_platform_deposit_credited: { type: "REWARD", category: "AIRDROP" },
  crypto_earn_interest_paid: { type: "REWARD", category: "STAKING_INCOME" },
  crypto_earn_program_created: { type: "CRYPTO_WITHDRAWAL", category: "INTERNAL_TRANSFER" },
  crypto_earn_program_withdrawn: { type: "CRYPTO_DEPOSIT", category: "INTERNAL_TRANSFER" },
  mobile_airtime_reward: { type: "REWARD", category: "AIRDROP" },
  supercharger_reward_to_app_credited: { type: "REWARD", category: "STAKING_INCOME" },
  staking_reward: { type: "REWARD", category: "STAKING_INCOME" },
  airdrop_locked: { type: "REWARD", category: "AIRDROP" },
  dust_conversion_credited: { type: "TRADE", category: "TRADE" },
  dust_conversion_debited: { type: "TRADE", category: "TRADE" },
  lockup_lock: { type: "ADJUSTMENT", category: "INTERNAL_TRANSFER" },
  lockup_upgrade: { type: "ADJUSTMENT", category: "INTERNAL_TRANSFER" },
};

/** Kinds that spend crypto with a merchant: a disposal against goods, not a transfer. */
const SPEND_KINDS = new Set(["card_spend", "pay_checkout", "pay_merchant", "crypto_payment", "card_purchase"]);
/** Kinds that credit the user for spending: income, not a rebate on the cost. */
const CASHBACK_KINDS = new Set(["referral_card_cashback", "card_cashback", "card_cashback_credited", "merchant_cashback"]);

export const CRYPTOCOM: CsvFormat = {
  id: "crypto-com-app",
  platform: "Crypto.com",
  label: "Crypto.com — App transaction record (CSV)",
  where: "Application Crypto.com → Accounts → Transaction History → Export",
  detect(header, _rows, fileName) {
    if (/crypto.?com/i.test(fileName)) return 1;
    if (hasCols(header, "Transaction Kind")) return 0.95;
    return countCols(header, ["Timestamp (UTC)", "Transaction Description", "Currency", "Amount", "To Currency", "Native Currency"]) >= 4 ? 0.7 : 0;
  },
  parse(rows, ctx: ParseContext) {
    const res = emptyResult(CRYPTOCOM.id, CRYPTOCOM.platform);
    const dates: Date[] = [];
    for (const row of rows) {
      res.rowCount += 1;
      const when = parseDate(col(row, "Timestamp (UTC)", "Timestamp", "Date"));
      if (!when) { res.ignoredRows += 1; continue; }
      const kind = norm(col(row, "Transaction Kind")).replace(/\s+/g, "_");
      const description = col(row, "Transaction Description");
      const asset = col(row, "Currency").toUpperCase();
      const amount = num(col(row, "Amount"));
      const toAsset = col(row, "To Currency").toUpperCase();
      const toAmount = num(col(row, "To Amount")).abs();
      const nativeCurrency = (col(row, "Native Currency") || "EUR").toUpperCase();
      const nativeAmount = num(col(row, "Native Amount")).abs();
      const id = mkId(CRYPTOCOM.platform, [ctx.accountId, when.getTime(), kind, asset, col(row, "Amount")]);
      const unit = amount.abs().gt(0) && nativeAmount.gt(0) && nativeCurrency === "EUR" ? { [asset]: nativeAmount.div(amount.abs()) } : undefined;

      if (SPEND_KINDS.has(kind)) {
        // Spending crypto at a merchant disposes of it: booked as a purchase of
        // goods, which several jurisdictions tax exactly like a sale.
        res.transactions.push(buildTx({
          ctx, externalId: id, timestamp: when, type: "CRYPTO_WITHDRAWAL", category: "PURCHASE_GOODS",
          legs: [{ asset, amount: amount.abs(), role: "OUT" }], note: description, knownUnitPriceEur: unit,
        }));
        dates.push(when);
        continue;
      }
      if (CASHBACK_KINDS.has(kind)) {
        res.transactions.push(buildTx({
          ctx, externalId: id, timestamp: when, type: "REWARD", category: "AIRDROP",
          legs: [{ asset, amount: amount.abs(), role: "IN" }], note: description, knownUnitPriceEur: unit,
        }));
        dates.push(when);
        continue;
      }

      const mapped = KINDS[kind];
      if (!mapped) {
        res.unknownOperations[kind || "(vide)"] = (res.unknownOperations[kind || "(vide)"] ?? 0) + 1;
        if (amount.abs().gt(0)) {
          res.transactions.push(buildTx({ ctx, externalId: id, timestamp: when, type: "ADJUSTMENT", category: "UNKNOWN", legs: [{ asset, amount: amount.abs(), role: amount.lt(0) ? "OUT" : "IN" }], note: description, knownUnitPriceEur: unit }));
          dates.push(when);
        } else {
          res.ignoredRows += 1;
        }
        continue;
      }

      if (mapped.type === "TRADE" && toAsset && toAmount.gt(0)) {
        const legs: Leg[] = [
          { asset, amount: amount.abs(), role: "OUT" },
          { asset: toAsset, amount: toAmount, role: "IN" },
        ];
        res.transactions.push(buildTx({ ctx, externalId: id, timestamp: when, type: "TRADE", category: "TRADE", legs, note: description, knownUnitPriceEur: unit }));
        dates.push(when);
        continue;
      }

      if (amount.abs().lte(0)) { res.ignoredRows += 1; continue; }
      const outgoing = mapped.type === "CRYPTO_WITHDRAWAL" || mapped.type === "FIAT_WITHDRAWAL" || amount.lt(0);
      const type: TxType = mapped.type === "ADJUSTMENT" ? "ADJUSTMENT" : mapped.type;
      res.transactions.push(buildTx({
        ctx, externalId: id, timestamp: when, type,
        category: mapped.category,
        legs: [{ asset, amount: amount.abs(), role: outgoing ? "OUT" : "IN" }],
        note: description,
        bank: type === "FIAT_DEPOSIT" || type === "FIAT_WITHDRAWAL",
        knownUnitPriceEur: unit,
      }));
      dates.push(when);
    }
    return finalise(res, dates);
  },
};
