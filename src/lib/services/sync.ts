import "server-only";
import { eq } from "drizzle-orm";
import { BinanceClient } from "@/lib/connectors/binance/client";
import { syncBinanceAccount } from "@/lib/connectors/binance/sync";
import { KrakenClient } from "@/lib/connectors/kraken/client";
import { syncKrakenAccount } from "@/lib/connectors/kraken/sync";
import { CoinbaseClient } from "@/lib/connectors/coinbase/client";
import { syncCoinbaseAccount } from "@/lib/connectors/coinbase/sync";
import { platformSpec } from "@/lib/connectors/platforms";
import { getDb } from "@/lib/db";
import { auditLog, exchangeAccounts, type ExchangeKind } from "@/lib/db/schema";
import { loadCredentials, selfAddressSet, setAccountStatus } from "@/lib/dal/accounts";
import { requireEntity } from "@/lib/dal/entities";
import { activeJob, createJob, spawn, type Job, type JobContext } from "@/lib/dal/jobs";
import { upsertTransactions } from "@/lib/dal/transactions";
import type { CanonicalTx } from "@/lib/engine/model";

interface SyncOutcome {
  transactions: CanonicalTx[];
  warnings: string[];
  requests: number;
  /** Shape differs per platform (a map for Kraken and Coinbase, a list for Binance). */
  balances: unknown;
  cursor: Record<string, unknown>;
}

/**
 * Synchronises one account, inside a job that already exists.
 *
 * Split out from `startAccountSync` so that the one-click refresh can run
 * several accounts and then the journal and the tax inside a single job, rather
 * than leaving the person to follow four of them.
 */
export async function runAccountSync(ctx: JobContext, userId: string, entityId: string, accountId: string, opts: { from?: Date; to?: Date; exhaustive?: boolean } = {}): Promise<{ inserted: number; skipped: number; requests: number; balances: unknown; warnings: string[] }> {
  const creds = await loadCredentials(entityId, accountId);
  if (!creds) throw new Error("Ce compte n'a pas de clé API : ajoutez-la ou importez un fichier d'export.");
  const db = await getDb();
  const [account] = await db.select().from(exchangeAccounts).where(eq(exchangeAccounts.id, accountId));
  const spec = platformSpec(account.exchange);
  if (!spec.api) throw new Error(`${spec.name} ne se synchronise pas par API : importez un fichier d'export.`);
  const from = opts.from ?? new Date(Date.UTC(2017, 6, 1));
  const to = opts.to ?? new Date();
  {
    await ctx.log(`Synchronisation ${account.label} (${spec.name}) du ${from.toISOString().slice(0, 10)} au ${to.toISOString().slice(0, 10)}`);
    const self = await selfAddressSet(entityId);
    let lastStep = "";
    const progress = (labels: Record<string, string>, weights: Record<string, [number, number]>) =>
      async (p: { step: string; done: number; total: number; message?: string }) => {
        const [a, b] = weights[p.step] ?? [50, 95];
        const pct = a + ((b - a) * p.done) / Math.max(1, p.total);
        const msg = `${labels[p.step] ?? p.step}${p.message ? ` — ${p.message}` : ""}`;
        if (p.step !== lastStep) { lastStep = p.step; await ctx.log(msg); }
        await ctx.progress(pct, msg);
      };

    let out: SyncOutcome;
    if (account.exchange === "KRAKEN") {
      const client = new KrakenClient({ apiKey: creds.apiKey, apiSecret: creds.apiSecret });
      const res = await syncKrakenAccount(client, {
        accountId, from, to,
        onProgress: progress(
          { pairs: "Liste des paires", balance: "Soldes du compte", trades: "Trades spot", ledgers: "Registre (dépôts, retraits, récompenses)" },
          { pairs: [0, 5], balance: [5, 10], trades: [10, 55], ledgers: [55, 95] },
        ),
      });
      out = { ...res, cursor: { lastTo: to.toISOString(), balances: res.balances, counts: res.counts } };
    } else if (account.exchange === "COINBASE") {
      const client = new CoinbaseClient({ keyName: creds.apiKey, privateKey: creds.apiSecret });
      const res = await syncCoinbaseAccount(client, {
        accountId, from, to, selfAddresses: self,
        onProgress: progress(
          { accounts: "Portefeuilles", fills: "Exécutions Advanced Trade", ledger: "Registre de chaque portefeuille" },
          { accounts: [0, 10], fills: [10, 50], ledger: [50, 95] },
        ),
      });
      out = { ...res, cursor: { lastTo: to.toISOString(), balances: res.balances, counts: res.counts } };
    } else {
      const client = new BinanceClient(creds, { onRequest: () => {} });
      const res = await syncBinanceAccount(client, {
        accountId, from, to, selfAddresses: self, exhaustive: opts.exhaustive,
        onProgress: progress(
          { exchangeInfo: "Liste des paires", account: "Soldes du compte", deposits: "Dépôts et retraits crypto", fiat: "Opérations fiat", convert: "Binance Convert", rewards: "Récompenses et distributions", trades: "Trades spot" },
          { exchangeInfo: [0, 3], account: [3, 5], deposits: [5, 20], fiat: [20, 30], convert: [30, 40], rewards: [40, 50], trades: [50, 95] },
        ),
      });
      out = { ...res, cursor: { lastTo: to.toISOString(), scannedSymbols: res.scannedSymbols, balances: res.balances } };
    }

    for (const w of out.warnings) await ctx.log(w, "warn");
    await ctx.progress(96, "Enregistrement des transactions…");
    const { inserted, skipped } = await upsertTransactions(entityId, out.transactions);
    await db.update(exchangeAccounts).set({ lastSyncAt: new Date(), status: "ACTIVE", statusMessage: null, syncCursor: out.cursor }).where(eq(exchangeAccounts.id, accountId));
    await db.insert(auditLog).values({ entityId, userId, action: "sync.api", details: { accountId, exchange: account.exchange, inserted, skipped, requests: out.requests } });
    await ctx.log(`${inserted} nouvelles transactions, ${skipped} déjà connues, ${out.requests} requêtes API.`);
    return { inserted, skipped, requests: out.requests, balances: out.balances, warnings: out.warnings };
  }
}

/** Starts a background API synchronisation for one exchange account and returns the job. */
export async function startAccountSync(userId: string, entityId: string, accountId: string, opts: { from?: Date; to?: Date; exhaustive?: boolean } = {}): Promise<Job> {
  await requireEntity(userId, entityId, "ACCOUNTANT");
  const existing = await activeJob(entityId, "API_SYNC");
  if (existing && existing.accountId === accountId) return existing;
  const job = await createJob(entityId, "API_SYNC", userId, accountId, "Synchronisation en attente…");
  spawn(job, (ctx) => runAccountSync(ctx, userId, entityId, accountId, opts));
  return job;
}

export interface CredentialTest { ok: boolean; message: string; canTrade?: boolean; balances?: number }

/**
 * Checks a key before it is stored.
 *
 * Two things are verified, not one: that the key answers at all, and that it
 * cannot do more than read. A key that can trade or withdraw is accepted —
 * refusing it would help nobody — but it is named as such, because the person
 * pasting it usually did not mean to grant that.
 */
export async function testCredentials(exchange: ExchangeKind, apiKey: string, apiSecret: string): Promise<CredentialTest> {
  try {
    if (exchange === "KRAKEN") {
      const client = new KrakenClient({ apiKey, apiSecret });
      const balances = await client.private<Record<string, string>>("Balance");
      let ledgerOk = true;
      try {
        await client.private("Ledgers", { ofs: 0 });
      } catch {
        ledgerOk = false;
      }
      const n = Object.keys(balances ?? {}).length;
      return {
        ok: true,
        balances: n,
        message: `Connexion Kraken réussie (${n} actif(s) en solde).${ledgerOk ? "" : " ⚠️ La clé ne peut pas lire le registre : ajoutez « Query Ledger Entries », sinon les dépôts et retraits manqueront."}`,
      };
    }
    if (exchange === "COINBASE") {
      const client = new CoinbaseClient({ keyName: apiKey, privateKey: apiSecret });
      const res = await client.get<{ accounts?: unknown[] }>("/api/v3/brokerage/accounts", { limit: 1 });
      return { ok: true, balances: res.accounts?.length ?? 0, message: "Connexion Coinbase réussie." };
    }
    const client = new BinanceClient({ apiKey, apiSecret });
    await client.syncTime();
    const acc = await client.signed<{ balances: { asset: string; free: string; locked: string }[]; canTrade?: boolean; canWithdraw?: boolean }>("/api/v3/account", { omitZeroBalances: true });
    const warn = acc.canWithdraw ? " ⚠️ La clé autorise les retraits : créez une clé en lecture seule." : acc.canTrade ? " ⚠️ La clé autorise le trading : préférez une clé en lecture seule." : "";
    return { ok: true, message: `Connexion réussie (${acc.balances.length} actifs en solde).${warn}`, canTrade: acc.canTrade, balances: acc.balances.length };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}

export async function markAccountError(accountId: string, message: string): Promise<void> {
  await setAccountStatus(accountId, "ERROR", message);
}
