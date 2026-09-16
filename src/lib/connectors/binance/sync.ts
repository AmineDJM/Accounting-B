import { BinanceClient } from "./client";
import type { AccountInfo, AssetDividend, ConvertTrade, DepositRecord, DustLog, EarnReward, ExchangeInfo, FiatOrder, FiatPayment, MyTrade, WithdrawRecord } from "./types";
import { fromConvert, fromDeposits, fromDividends, fromDust, fromEarnRewards, fromFiatOrders, fromFiatPayments, fromMyTrades, fromWithdrawals } from "./normalize";
import type { CanonicalTx } from "@/lib/engine/model";

const DAY = 24 * 60 * 60 * 1000;

export interface SyncOptions {
  accountId: string;
  from: Date;
  to: Date;
  selfAddresses?: Set<string>;
  /** Also scan every trading pair quoted in an asset the account touched (slow: hundreds of requests). */
  exhaustive?: boolean;
  /** Extra symbols to scan (user hint). */
  extraSymbols?: string[];
  onProgress?: (p: { step: string; done: number; total: number; message?: string }) => void;
}

export interface SyncResult {
  transactions: CanonicalTx[];
  balances: { asset: string; free: string; locked: string }[];
  scannedSymbols: string[];
  requests: number;
  warnings: string[];
}

const MAJOR_QUOTES = ["EUR", "USDT", "USDC", "BTC", "ETH", "BNB", "BUSD", "FDUSD", "TRY", "GBP", "TUSD", "DAI", "USDP"];

function* windows(from: Date, to: Date, spanDays: number): Generator<[number, number]> {
  let start = from.getTime();
  const end = to.getTime();
  while (start <= end) {
    const stop = Math.min(start + spanDays * DAY - 1, end);
    yield [start, stop];
    start = stop + 1;
  }
}

/**
 * Pull the complete history of a Binance account into canonical transactions.
 * Each step is independent: a failing endpoint (e.g. Earn on a sub-account with
 * no Earn permission) is reported as a warning, not a fatal error.
 */
export async function syncBinanceAccount(client: BinanceClient, opts: SyncOptions): Promise<SyncResult> {
  const warnings: string[] = [];
  const txs: CanonicalTx[] = [];
  const ctx = { accountId: opts.accountId, selfAddresses: opts.selfAddresses };
  const progress = (step: string, done: number, total: number, message?: string) => opts.onProgress?.({ step, done, total, message });
  const step = async <T>(name: string, fn: () => Promise<T>, fallback: T): Promise<T> => {
    try { return await fn(); } catch (e) { warnings.push(`${name} : ${(e as Error).message}`); return fallback; }
  };

  await client.syncTime();
  progress("exchangeInfo", 0, 1);
  const info = await client.public<ExchangeInfo>("/api/v3/exchangeInfo");
  const symbols = new Map(info.symbols.map((s) => [s.symbol, { base: s.baseAsset, quote: s.quoteAsset }]));

  progress("account", 0, 1);
  const account = await client.signed<AccountInfo>("/api/v3/account", { omitZeroBalances: true });
  const balances = account.balances.filter((b) => Number(b.free) + Number(b.locked) > 0);

  // --- deposits & withdrawals (90-day windows) ---------------------------
  const deposits: DepositRecord[] = [], withdrawals: WithdrawRecord[] = [];
  const dwWindows = [...windows(opts.from, opts.to, 90)];
  let i = 0;
  for (const [s, e] of dwWindows) {
    progress("deposits", i++, dwWindows.length);
    await step("Dépôts crypto", async () => {
      for (let offset = 0; ; offset += 1000) {
        const page = await client.signed<DepositRecord[]>("/sapi/v1/capital/deposit/hisrec", { startTime: s, endTime: e, offset, limit: 1000 });
        deposits.push(...page);
        if (page.length < 1000) break;
      }
    }, undefined);
    await step("Retraits crypto", async () => {
      for (let offset = 0; ; offset += 1000) {
        const page = await client.signed<WithdrawRecord[]>("/sapi/v1/capital/withdraw/history", { startTime: s, endTime: e, offset, limit: 1000 });
        withdrawals.push(...page);
        if (page.length < 1000) break;
      }
    }, undefined);
  }
  txs.push(...fromDeposits(deposits, ctx), ...fromWithdrawals(withdrawals, ctx));

  // --- fiat orders & payments (paged, 500 rows) --------------------------
  const fiatPaged = async <T>(path: string, transactionType: number, key: "data"): Promise<T[]> => {
    const out: T[] = [];
    for (const [s, e] of windows(opts.from, opts.to, 90)) {
      for (let page = 1; ; page++) {
        const res = await client.signed<{ data?: T[]; total?: number }>(path, { transactionType, beginTime: s, endTime: e, page, rows: 500 });
        const rows = res[key] ?? [];
        out.push(...rows);
        if (rows.length < 500) break;
      }
    }
    return out;
  };
  progress("fiat", 0, 4);
  const fiatDep = await step("Dépôts fiat", () => fiatPaged<FiatOrder>("/sapi/v1/fiat/orders", 0, "data"), []);
  progress("fiat", 1, 4);
  const fiatWd = await step("Retraits fiat", () => fiatPaged<FiatOrder>("/sapi/v1/fiat/orders", 1, "data"), []);
  progress("fiat", 2, 4);
  const payBuy = await step("Achats express", () => fiatPaged<FiatPayment>("/sapi/v1/fiat/payments", 0, "data"), []);
  progress("fiat", 3, 4);
  const paySell = await step("Ventes express", () => fiatPaged<FiatPayment>("/sapi/v1/fiat/payments", 1, "data"), []);
  txs.push(...fromFiatOrders(fiatDep, "DEPOSIT", ctx), ...fromFiatOrders(fiatWd, "WITHDRAW", ctx), ...fromFiatPayments(payBuy, "BUY", ctx), ...fromFiatPayments(paySell, "SELL", ctx));

  // --- convert (30-day windows) -------------------------------------------
  const convWindows = [...windows(opts.from, opts.to, 30)];
  const converts: ConvertTrade[] = [];
  i = 0;
  for (const [s, e] of convWindows) {
    progress("convert", i++, convWindows.length);
    await step("Binance Convert", async () => {
      const res = await client.signed<{ list?: ConvertTrade[]; moreData?: boolean }>("/sapi/v1/convert/tradeFlow", { startTime: s, endTime: e, limit: 1000 });
      converts.push(...(res.list ?? []));
      if (res.moreData) warnings.push(`Plus de 1 000 conversions entre ${new Date(s).toISOString().slice(0, 10)} et ${new Date(e).toISOString().slice(0, 10)} : certaines peuvent manquer.`);
    }, undefined);
  }
  txs.push(...fromConvert(converts, ctx));

  // --- dust, dividends, earn ---------------------------------------------
  progress("rewards", 0, 3);
  await step("Conversion de poussières", async () => {
    for (const [s, e] of windows(opts.from, opts.to, 90)) {
      const log = await client.signed<DustLog>("/sapi/v1/asset/dribblet", { startTime: s, endTime: e });
      txs.push(...fromDust(log, ctx));
    }
  }, undefined);
  progress("rewards", 1, 3);
  await step("Distributions", async () => {
    for (const [s, e] of windows(opts.from, opts.to, 90)) {
      const div = await client.signed<AssetDividend>("/sapi/v1/asset/assetDividend", { startTime: s, endTime: e, limit: 500 });
      txs.push(...fromDividends(div, ctx));
      if ((div.total ?? 0) > 500) warnings.push("Plus de 500 distributions sur 90 jours : utilisez l'import CSV pour être exhaustif.");
    }
  }, undefined);
  progress("rewards", 2, 3);
  await step("Simple Earn", async () => {
    for (const product of ["flexible", "locked"] as const) {
      for (const [s, e] of windows(opts.from, opts.to, 90)) {
        const types = product === "flexible" ? ["BONUS", "REALTIME", "REWARDS"] : [undefined];
        for (const type of types) {
          for (let current = 1; ; current++) {
            const res = await client.signed<{ rows?: EarnReward[]; total?: number }>(`/sapi/v1/simple-earn/${product}/history/rewardsRecord`, { type, startTime: s, endTime: e, current, size: 100 });
            const rows = res.rows ?? [];
            txs.push(...fromEarnRewards(rows, product, ctx));
            if (rows.length < 100) break;
          }
        }
      }
    }
  }, undefined);

  // --- spot trades: candidate symbols, then myTrades with fromId paging ---
  const seedAssets = new Set<string>(["EUR"]);
  for (const b of balances) seedAssets.add(b.asset);
  for (const t of txs) for (const l of t.legs) seedAssets.add(l.asset.toUpperCase());
  const scanned = new Set<string>();
  const queue: string[] = [];
  const enqueueFor = (assets: Iterable<string>) => {
    for (const [sym, s] of symbols) {
      if (scanned.has(sym) || queue.includes(sym)) continue;
      const set = new Set(assets);
      const baseHit = set.has(s.base) && (MAJOR_QUOTES.includes(s.quote) || set.has(s.quote));
      const quoteHit = opts.exhaustive && set.has(s.quote);
      if (baseHit || quoteHit) queue.push(sym);
    }
  };
  enqueueFor(seedAssets);
  for (const s of opts.extraSymbols ?? []) if (symbols.has(s) && !queue.includes(s)) queue.push(s);
  const startMs = opts.from.getTime(), endMs = opts.to.getTime();
  let done = 0;
  while (queue.length) {
    const sym = queue.shift()!;
    scanned.add(sym);
    progress("trades", done++, done + queue.length, sym);
    const found: MyTrade[] = [];
    await step(`Trades ${sym}`, async () => {
      let fromId = 0;
      for (;;) {
        const page = await client.signed<MyTrade[]>("/api/v3/myTrades", { symbol: sym, fromId, limit: 1000 });
        found.push(...page.filter((t) => t.time >= startMs && t.time <= endMs));
        if (page.length < 1000) break;
        fromId = page[page.length - 1].id + 1;
      }
    }, undefined);
    if (found.length) {
      const nt = fromMyTrades(found, symbols, ctx);
      txs.push(...nt);
      const newAssets = new Set<string>();
      for (const t of nt) for (const l of t.legs) if (!seedAssets.has(l.asset.toUpperCase())) { seedAssets.add(l.asset.toUpperCase()); newAssets.add(l.asset.toUpperCase()); }
      if (newAssets.size) enqueueFor(seedAssets);
    }
  }

  // de-duplicate (overlapping windows, repeated pages) on the stable external id
  const unique = new Map<string, CanonicalTx>();
  for (const t of txs) if (!unique.has(t.externalId)) unique.set(t.externalId, t);
  const list = [...unique.values()].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  return { transactions: list, balances, scannedSymbols: [...scanned], requests: client.requestCount, warnings };
}
