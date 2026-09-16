import type { CoinbaseClient } from "./client";
import { fromFills, fromV2Transactions, type CoinbaseContext } from "./normalize";
import type { CanonicalTx } from "@/lib/engine/model";
import type { CoinbaseFills, CoinbasePaged, CoinbaseV2Account, CoinbaseV2Transaction, CoinbaseV3Accounts } from "./types";

export interface CoinbaseSyncOptions {
  accountId: string;
  from: Date;
  to: Date;
  selfAddresses?: Set<string>;
  onProgress?: (p: { step: string; done: number; total: number; message?: string }) => Promise<void> | void;
}

export interface CoinbaseSyncResult {
  transactions: CanonicalTx[];
  warnings: string[];
  requests: number;
  balances: Record<string, string>;
  counts: { fills: number; ledger: number; wallets: number };
}

const MAX_PAGES = 200;

/**
 * Reads a whole Coinbase account.
 *
 * Two families of endpoint, because neither is enough on its own: Advanced
 * Trade fills carry the trades with their commission, and the v2 ledger of each
 * wallet carries everything else — deposits, withdrawals, on-chain sends,
 * rewards, in-app buys and conversions. Trades are read from the fills only, so
 * the ledger's mirror of them is dropped rather than counted twice.
 */
export async function syncCoinbaseAccount(client: CoinbaseClient, opts: CoinbaseSyncOptions): Promise<CoinbaseSyncResult> {
  const ctx: CoinbaseContext = { accountId: opts.accountId, selfAddresses: opts.selfAddresses };
  const warnings: string[] = [];
  const report = async (step: string, done: number, total: number, message?: string) => { await opts.onProgress?.({ step, done, total, message }); };

  await report("accounts", 0, 1, "Portefeuilles");
  const balances: Record<string, string> = {};
  let cursor: string | undefined;
  let guard = 0;
  do {
    const page: CoinbaseV3Accounts = await client.get("/api/v3/brokerage/accounts", { limit: 250, cursor });
    for (const a of page.accounts ?? []) {
      const value = a.available_balance?.value ?? "0";
      if (Number(value) > 0) balances[a.currency.toUpperCase()] = value;
    }
    cursor = page.has_next ? page.cursor : undefined;
  } while (cursor && ++guard < MAX_PAGES);

  // Fills, page by cursor, over the requested window.
  const fills = [];
  cursor = undefined;
  guard = 0;
  do {
    const page: CoinbaseFills = await client.get("/api/v3/brokerage/orders/historical/fills", {
      start_sequence_timestamp: opts.from.toISOString(),
      end_sequence_timestamp: opts.to.toISOString(),
      limit: 100,
      cursor,
    });
    fills.push(...(page.fills ?? []));
    cursor = page.cursor && page.fills?.length ? page.cursor : undefined;
    await report("fills", fills.length, fills.length + (cursor ? 100 : 0), `${fills.length} exécutions`);
  } while (cursor && ++guard < MAX_PAGES);

  // The ledger of every wallet, which is where the rest of the life of the
  // account is recorded.
  const wallets: CoinbaseV2Account[] = [];
  let starting: string | null | undefined;
  guard = 0;
  do {
    const page: CoinbasePaged<CoinbaseV2Account> = await client.get("/v2/accounts", { limit: 100, starting_after: starting ?? undefined });
    wallets.push(...(page.data ?? []));
    starting = page.pagination?.next_starting_after ?? null;
  } while (starting && ++guard < MAX_PAGES);

  const ledger: CoinbaseV2Transaction[] = [];
  let done = 0;
  for (const w of wallets) {
    let after: string | null | undefined;
    let pages = 0;
    do {
      const page: CoinbasePaged<CoinbaseV2Transaction> = await client.get(`/v2/accounts/${w.id}/transactions`, { limit: 100, starting_after: after ?? undefined });
      const rows = page.data ?? [];
      // Rows come newest first: stop once a page predates the window.
      ledger.push(...rows.filter((r) => {
        const t = new Date(r.created_at).getTime();
        return t >= opts.from.getTime() && t <= opts.to.getTime();
      }));
      const oldest = rows.length ? new Date(rows[rows.length - 1].created_at).getTime() : 0;
      after = rows.length && oldest >= opts.from.getTime() ? page.pagination?.next_starting_after ?? null : null;
    } while (after && ++pages < MAX_PAGES);
    done++;
    await report("ledger", done, wallets.length, `${w.name ?? (typeof w.currency === "string" ? w.currency : w.currency.code)} — ${ledger.length} opérations`);
  }

  const fillOut = fromFills(fills, ctx);
  const ledgerOut = fromV2Transactions(ledger, ctx);
  warnings.push(...fillOut.warnings, ...ledgerOut.warnings);

  return {
    transactions: [...fillOut.txs, ...ledgerOut.txs].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime()),
    warnings,
    requests: client.requestCount,
    balances,
    counts: { fills: fills.length, ledger: ledger.length, wallets: wallets.length },
  };
}
