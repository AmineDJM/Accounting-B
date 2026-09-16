import Papa from "papaparse";
import { D, ZERO, type Decimal } from "@/lib/engine/money";
import { isFiat, type CanonicalTx, type Category, type Leg, type TxType } from "@/lib/engine/model";
import { sha256 } from "@/lib/security/crypto";

/**
 * Importer for the Binance "Transaction History" export
 * (Wallet → Transaction History → Export, CSV with columns
 *  User_ID, UTC_Time, Account, Operation, Coin, Change, Remark).
 *
 * Rows sharing the same timestamp, account and operation family are grouped
 * to rebuild each economic operation (a spot trade = spend + buy + fee rows).
 */

export interface BinanceCsvRow {
  userId: string;
  time: Date;
  account: string;
  operation: string;
  coin: string;
  change: Decimal;
  remark: string;
  line: number;
}

export interface CsvImportResult {
  transactions: CanonicalTx[];
  rowCount: number;
  ignoredRows: number;
  unknownOperations: Record<string, number>;
  warnings: string[];
  userId?: string;
  from?: Date;
  to?: Date;
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/** Operations that form a trade when grouped by timestamp. */
const TRADE_OPS = new Set([
  "transaction buy", "transaction spend", "transaction sold", "transaction revenue", "transaction fee", "transaction related",
  "buy", "sell", "fee", "binance convert", "small assets exchange bnb", "large otc trading", "buy crypto", "sell crypto",
  "eth 2.0 staking", "token swap distribution", "token swap redemption", "transaction buy cross margin", "transaction spend cross margin",
]);
const FEE_OPS = new Set(["transaction fee", "fee"]);
const CARD_BUY_OPS = new Set(["buy crypto"]);

const FIAT_DEPOSIT_OPS = new Set(["fiat deposit", "deposit fiat"]);
const FIAT_WITHDRAW_OPS = new Set(["fiat withdraw", "fiat withdrawal", "withdraw fiat"]);
const CRYPTO_DEPOSIT_OPS = new Set(["deposit", "c2c transfer", "p2p trading", "binance pay", "receive", "send", "crypto box", "sub-account transfer", "transfer_in", "binance card spending", "card cashback refund"]);
const CRYPTO_WITHDRAW_OPS = new Set(["withdraw", "withdrawal"]);

const REWARD_OPS: Record<string, Category> = {
  "simple earn flexible interest": "STAKING_INCOME",
  "simple earn locked rewards": "STAKING_INCOME",
  "simple earn flexible airdrop": "AIRDROP",
  "staking rewards": "STAKING_INCOME",
  "eth 2.0 staking rewards": "STAKING_INCOME",
  "launchpool earnings": "STAKING_INCOME",
  "launchpool interest": "STAKING_INCOME",
  "launchpool airdrop": "AIRDROP",
  "savings interest": "STAKING_INCOME",
  "pos savings interest": "STAKING_INCOME",
  "bnb vault rewards": "STAKING_INCOME",
  "super bnb mining": "STAKING_INCOME",
  "distribution": "AIRDROP",
  "airdrop assets": "AIRDROP",
  "referral commission": "STAKING_INCOME",
  "referral kickback": "STAKING_INCOME",
  "commission rebate": "STAKING_INCOME",
  "commission history": "STAKING_INCOME",
  "cash voucher distribution": "AIRDROP",
  "rewards distribution": "AIRDROP",
  "card cashback": "STAKING_INCOME",
  "mission reward distribution": "AIRDROP",
  "megadrop rewards": "AIRDROP",
  "hodler airdrops distribution": "AIRDROP",
  "hodler airdrops": "AIRDROP",
  "auto-invest rewards": "STAKING_INCOME",
  "liquid swap rewards": "STAKING_INCOME",
  "swap farming rewards": "STAKING_INCOME",
  "dual investment rewards": "STAKING_INCOME",
  "simple earn locked airdrop": "AIRDROP",
};

/** Movements between Binance sub-wallets: no economic effect for the entity. */
const INTERNAL_OPS = new Set([
  "simple earn flexible subscription", "simple earn flexible redemption", "simple earn locked subscription", "simple earn locked redemption",
  "staking purchase", "staking redemption", "launchpool subscription", "launchpool redemption", "transfer between main and funding wallet",
  "transfer between spot account and um futures account", "transfer between spot account and cm futures account", "transfer between main account and margin account",
  "transfer between spot and margin", "isolated margin transfer", "margin transfer", "funding wallet transfer", "transfer_out", "transfer between main account/futures and margin account",
  "auto-invest transaction", "auto-invest", "savings purchase", "savings redemption", "pos savings purchase", "pos savings redemption", "locked staking purchase", "locked staking redemption",
  "bnb vault purchase", "bnb vault redemption", "liquid swap add", "liquid swap remove", "simple earn flexible subscription (auto)", "dual investment subscription", "dual investment settlement",
  "transfer account", "main and funding account transfer", "cross margin transfer", "transfer between spot account and cross margin account",
]);

export function parseBinanceCsv(text: string): { rows: BinanceCsvRow[]; errors: string[] } {
  const parsed = Papa.parse<Record<string, string>>(text.replace(/^﻿/, ""), { header: true, skipEmptyLines: true, transformHeader: (h) => h.trim() });
  const errors: string[] = parsed.errors.slice(0, 5).map((e) => `Ligne ${e.row}: ${e.message}`);
  const rows: BinanceCsvRow[] = [];
  const get = (r: Record<string, string>, ...names: string[]) => {
    for (const n of names) {
      const k = Object.keys(r).find((key) => key.toLowerCase() === n.toLowerCase());
      if (k !== undefined) return r[k];
    }
    return "";
  };
  parsed.data.forEach((r, i) => {
    const timeStr = get(r, "UTC_Time", "UTC Time", "Time");
    const operation = get(r, "Operation");
    const coin = get(r, "Coin", "Primary_Asset", "Asset");
    const change = get(r, "Change", "Realized_Amount_For_Primary_Asset", "Amount");
    if (!timeStr || !operation || !coin) return;
    const time = new Date(timeStr.replace(" ", "T") + (timeStr.endsWith("Z") ? "" : "Z"));
    if (isNaN(time.getTime())) { errors.push(`Ligne ${i + 2}: date invalide "${timeStr}"`); return; }
    rows.push({ userId: get(r, "User_ID", "User ID"), time, account: get(r, "Account") || "Spot", operation: operation.trim(), coin: coin.trim().toUpperCase(), change: D(change || 0), remark: get(r, "Remark"), line: i + 2 });
  });
  return { rows, errors };
}

function legsFromGroup(group: BinanceCsvRow[]): { legs: Leg[]; card: boolean } {
  const ins = new Map<string, Decimal>(), outs = new Map<string, Decimal>(), fees = new Map<string, Decimal>();
  let card = false;
  for (const r of group) {
    const op = norm(r.operation);
    if (CARD_BUY_OPS.has(op)) card = true;
    if (FEE_OPS.has(op)) { fees.set(r.coin, (fees.get(r.coin) ?? ZERO).plus(r.change.abs())); continue; }
    if (r.change.gt(0)) ins.set(r.coin, (ins.get(r.coin) ?? ZERO).plus(r.change));
    else if (r.change.lt(0)) outs.set(r.coin, (outs.get(r.coin) ?? ZERO).plus(r.change.abs()));
  }
  // an asset both in and out (fee netted in the same coin) -> net it
  for (const [coin, amt] of [...ins]) {
    const o = outs.get(coin);
    if (o) {
      if (amt.gt(o)) { ins.set(coin, amt.minus(o)); outs.delete(coin); }
      else if (o.gt(amt)) { outs.set(coin, o.minus(amt)); ins.delete(coin); }
      else { ins.delete(coin); outs.delete(coin); }
    }
  }
  const legs: Leg[] = [];
  for (const [asset, amount] of outs) legs.push({ asset, amount, role: "OUT" });
  for (const [asset, amount] of ins) legs.push({ asset, amount, role: "IN" });
  for (const [asset, amount] of fees) legs.push({ asset, amount, role: "FEE" });
  return { legs, card };
}

export function importBinanceCsv(text: string, accountId: string, selfAddresses: Set<string> = new Set()): CsvImportResult {
  const { rows, errors } = parseBinanceCsv(text);
  const warnings = [...errors];
  const unknownOperations: Record<string, number> = {};
  const txs: CanonicalTx[] = [];
  let ignored = 0;
  const groups = new Map<string, BinanceCsvRow[]>();
  const singles: BinanceCsvRow[] = [];

  for (const r of rows) {
    const op = norm(r.operation);
    if (INTERNAL_OPS.has(op)) { ignored++; continue; }
    if (TRADE_OPS.has(op)) {
      const key = `${r.time.getTime()}|${r.account}`;
      groups.set(key, [...(groups.get(key) ?? []), r]);
    } else singles.push(r);
  }

  const mkId = (parts: (string | number)[]) => `csv:${sha256(parts.join("|")).slice(0, 24)}`;

  for (const [key, group] of groups) {
    const { legs, card } = legsFromGroup(group);
    const hasIn = legs.some((l) => l.role === "IN"), hasOut = legs.some((l) => l.role === "OUT");
    const first = group[0];
    if (!hasIn || !hasOut) {
      // orphan rows (e.g. a fee alone, or a one-sided "Transaction Related") -> keep as movement to review
      for (const r of group) singles.push(r);
      continue;
    }
    // Small Assets Exchange BNB: one trade per source coin keeps the journal readable
    const isDust = group.some((r) => norm(r.operation) === "small assets exchange bnb");
    const outs = legs.filter((l) => l.role === "OUT");
    if (isDust && outs.length > 1) {
      const inn = legs.find((l) => l.role === "IN")!;
      const totalOut = outs.reduce((a, l) => a.plus(l.amount), ZERO);
      void totalOut;
      txs.push({
        id: mkId([key, "dust"]), accountId, source: "binance_csv", externalId: mkId([first.userId, key, "dust", legs.map((l) => `${l.role}${l.asset}${l.amount}`).join(",")]),
        timestamp: first.time, type: "TRADE", category: "TRADE", legs, ref: `Conversion de poussières ${first.time.toISOString().slice(0, 16)}`, note: "Small Assets Exchange BNB",
      });
      void inn;
      continue;
    }
    txs.push({
      id: mkId([key, "trade"]), accountId, source: "binance_csv", externalId: mkId([first.userId, key, "trade", legs.map((l) => `${l.role}${l.asset}${l.amount}`).join(",")]),
      timestamp: first.time, type: "TRADE", category: "TRADE", legs, ref: `${card ? "Achat par carte" : "Trade"} ${first.time.toISOString().replace("T", " ").slice(0, 19)} UTC`,
      note: card ? "Buy Crypto (carte bancaire)" : group.some((r) => norm(r.operation) === "binance convert") ? "Binance Convert" : undefined,
      counterparty: card ? { kind: "BANK", label: "carte bancaire" } : undefined,
    });
  }

  singles.sort((a, b) => a.time.getTime() - b.time.getTime() || a.line - b.line);
  for (const r of singles) {
    const op = norm(r.operation);
    const amount = r.change.abs();
    if (amount.isZero()) { ignored++; continue; }
    const externalId = mkId([r.userId, r.time.getTime(), r.account, r.operation, r.coin, r.change.toString(), r.line]);
    const base = { id: externalId, accountId, source: "binance_csv" as const, externalId, timestamp: r.time, ref: `${r.operation} ${r.time.toISOString().replace("T", " ").slice(0, 19)} UTC`, note: r.remark || undefined };
    let type: TxType, category: Category = "UNKNOWN";
    const legs: Leg[] = [];
    if (REWARD_OPS[op] !== undefined && r.change.gt(0)) {
      type = "REWARD"; category = REWARD_OPS[op];
      legs.push({ asset: r.coin, amount, role: "IN" });
      txs.push({ ...base, type, category, legs, note: r.operation });
      continue;
    }
    if (FIAT_DEPOSIT_OPS.has(op) || (op === "deposit" && isFiat(r.coin) && r.change.gt(0))) {
      type = "FIAT_DEPOSIT"; category = "BANK_TRANSFER";
      legs.push({ asset: r.coin, amount, role: "IN" });
      txs.push({ ...base, type, category, legs, counterparty: { kind: "BANK", label: "virement" } });
      continue;
    }
    if (FIAT_WITHDRAW_OPS.has(op) || (op === "withdraw" && isFiat(r.coin) && r.change.lt(0))) {
      type = "FIAT_WITHDRAWAL"; category = "BANK_TRANSFER";
      legs.push({ asset: r.coin, amount, role: "OUT" });
      txs.push({ ...base, type, category, legs, counterparty: { kind: "BANK", label: "virement" } });
      continue;
    }
    if (CRYPTO_DEPOSIT_OPS.has(op) || CRYPTO_WITHDRAW_OPS.has(op) || FEE_OPS.has(op) || TRADE_OPS.has(op)) {
      if (FEE_OPS.has(op)) {
        txs.push({ ...base, type: "FEE", category: "TRADE", legs: [{ asset: r.coin, amount, role: "FEE" }], note: r.operation });
        continue;
      }
      const isIn = r.change.gt(0);
      type = isIn ? "CRYPTO_DEPOSIT" : "CRYPTO_WITHDRAWAL";
      const address = r.remark?.match(/0x[a-fA-F0-9]{40}|[13][a-km-zA-HJ-NP-Z1-9]{25,34}|bc1[a-z0-9]{20,}|T[a-zA-Z0-9]{33}|r[a-zA-Z0-9]{24,34}/)?.[0];
      const self = address ? selfAddresses.has(address.toLowerCase()) : false;
      legs.push({ asset: r.coin, amount, role: isIn ? "IN" : "OUT" });
      category = self ? "INTERNAL_TRANSFER" : "UNKNOWN";
      txs.push({ ...base, type, category, legs, counterparty: { kind: self ? "SELF" : "UNKNOWN", address, label: r.operation }, note: r.operation });
      continue;
    }
    // unknown operation: keep as a movement to qualify, never drop silently
    unknownOperations[r.operation] = (unknownOperations[r.operation] ?? 0) + 1;
    const isIn = r.change.gt(0);
    legs.push({ asset: r.coin, amount, role: isIn ? "IN" : "OUT" });
    txs.push({ ...base, type: isIn ? "CRYPTO_DEPOSIT" : "CRYPTO_WITHDRAWAL", category: "UNKNOWN", legs, note: `Opération Binance non reconnue : ${r.operation}` });
  }

  for (const [op, n] of Object.entries(unknownOperations)) warnings.push(`Opération "${op}" non reconnue (${n} ligne${n > 1 ? "s" : ""}) : importée comme mouvement à qualifier.`);
  txs.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  return {
    transactions: txs, rowCount: rows.length, ignoredRows: ignored, unknownOperations, warnings,
    userId: rows[0]?.userId, from: rows.length ? new Date(Math.min(...rows.map((r) => r.time.getTime()))) : undefined, to: rows.length ? new Date(Math.max(...rows.map((r) => r.time.getTime()))) : undefined,
  };
}
