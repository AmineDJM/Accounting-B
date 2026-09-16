import type { KrakenClient } from "./client";
import { fromLedgers, fromTrades, normaliseAsset, type KrakenContext } from "./normalize";
import type { CanonicalTx } from "@/lib/engine/model";
import type { KrakenAssetPair, KrakenBalance, KrakenLedger, KrakenLedgers, KrakenTrade, KrakenTradesHistory } from "./types";

export interface KrakenSyncOptions {
  accountId: string;
  from: Date;
  to: Date;
  onProgress?: (p: { step: string; done: number; total: number; message?: string }) => Promise<void> | void;
}

export interface KrakenSyncResult {
  transactions: CanonicalTx[];
  warnings: string[];
  requests: number;
  balances: Record<string, string>;
  counts: { trades: number; ledgers: number };
}

const PAGE = 50;
const secs = (d: Date) => Math.floor(d.getTime() / 1000);

/**
 * Reads a whole Kraken account.
 *
 * Two endpoints carry everything: `TradesHistory` for spot trades, which states
 * the pair and the fee plainly, and `Ledgers` for the rest — deposits,
 * withdrawals, rewards and instant conversions. Both page fifty rows at a time
 * and report a total, so the loop stops on the count rather than on an empty
 * page, and a page that repeats itself breaks it rather than spinning.
 */
export async function syncKrakenAccount(client: KrakenClient, opts: KrakenSyncOptions): Promise<KrakenSyncResult> {
  const warnings: string[] = [];
  const report = async (step: string, done: number, total: number, message?: string) => { await opts.onProgress?.({ step, done, total, message }); };

  await report("pairs", 0, 1, "Liste des paires");
  const pairsRaw = await client.public<Record<string, KrakenAssetPair>>("AssetPairs");
  const pairs = new Map<string, { base: string; quote: string }>();
  for (const [code, p] of Object.entries(pairsRaw)) {
    pairs.set(code, { base: p.base, quote: p.quote });
    // Trades may name a pair by its alternate code rather than its key.
    if (p.altname) pairs.set(p.altname, { base: p.base, quote: p.quote });
  }
  const ctx: KrakenContext = { accountId: opts.accountId, pairs };

  await report("balance", 1, 1, "Soldes");
  const balanceRaw = await client.private<KrakenBalance>("Balance");
  const balances: Record<string, string> = {};
  for (const [asset, amount] of Object.entries(balanceRaw)) {
    const key = normaliseAsset(asset);
    // A staked balance and a spot balance are the same asset once normalised.
    balances[key] = String(Number(balances[key] ?? 0) + Number(amount));
  }

  const trades: Record<string, KrakenTrade> = {};
  let offset = 0;
  let total = Infinity;
  while (offset < total) {
    const page = await client.private<KrakenTradesHistory>("TradesHistory", { start: secs(opts.from), end: secs(opts.to), ofs: offset, trades: "true" });
    total = page.count ?? 0;
    const rows = Object.entries(page.trades ?? {});
    if (!rows.length) break;
    const before = Object.keys(trades).length;
    for (const [id, t] of rows) trades[id] = t;
    if (Object.keys(trades).length === before) break; // the same page twice
    offset += rows.length;
    await report("trades", Math.min(offset, total), Math.max(total, 1), `${Object.keys(trades).length} trades`);
    if (rows.length < PAGE) break;
  }

  const ledgers: Record<string, KrakenLedger> = {};
  offset = 0;
  total = Infinity;
  while (offset < total) {
    const page = await client.private<KrakenLedgers>("Ledgers", { start: secs(opts.from), end: secs(opts.to), ofs: offset });
    total = page.count ?? 0;
    const rows = Object.entries(page.ledger ?? {});
    if (!rows.length) break;
    const before = Object.keys(ledgers).length;
    for (const [id, l] of rows) ledgers[id] = l;
    if (Object.keys(ledgers).length === before) break;
    offset += rows.length;
    await report("ledgers", Math.min(offset, total), Math.max(total, 1), `${Object.keys(ledgers).length} lignes de registre`);
    if (rows.length < PAGE) break;
  }

  const tradeOut = fromTrades(trades, ctx);
  const ledgerOut = fromLedgers(ledgers, ctx);
  warnings.push(...tradeOut.warnings, ...ledgerOut.warnings);

  return {
    transactions: [...tradeOut.txs, ...ledgerOut.txs].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime()),
    warnings,
    requests: client.requestCount,
    balances,
    counts: { trades: Object.keys(trades).length, ledgers: Object.keys(ledgers).length },
  };
}
