import "server-only";
import { BinanceClient } from "@/lib/connectors/binance/client";
import { syncBinanceAccount } from "@/lib/connectors/binance/sync";
import { getDb } from "@/lib/db";
import { auditLog, exchangeAccounts } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { loadCredentials, selfAddressSet, setAccountStatus } from "@/lib/dal/accounts";
import { requireEntity } from "@/lib/dal/entities";
import { activeJob, createJob, spawn, type Job } from "@/lib/dal/jobs";
import { upsertTransactions } from "@/lib/dal/transactions";

/** Starts a background API synchronisation for one exchange account and returns the job. */
export async function startAccountSync(userId: string, entityId: string, accountId: string, opts: { from?: Date; to?: Date; exhaustive?: boolean } = {}): Promise<Job> {
  await requireEntity(userId, entityId, "ACCOUNTANT");
  const existing = await activeJob(entityId, "API_SYNC");
  if (existing && existing.accountId === accountId) return existing;
  const creds = await loadCredentials(entityId, accountId);
  if (!creds) throw new Error("Ce compte n'a pas de clé API : ajoutez-la ou importez un export CSV.");
  const db = await getDb();
  const [account] = await db.select().from(exchangeAccounts).where(eq(exchangeAccounts.id, accountId));
  const job = await createJob(entityId, "API_SYNC", userId, accountId, "Synchronisation en attente…");
  const from = opts.from ?? new Date(Date.UTC(2017, 6, 1));
  const to = opts.to ?? new Date();
  spawn(job, async (ctx) => {
    const client = new BinanceClient(creds, { onRequest: () => {} });
    await ctx.log(`Synchronisation ${account.label} du ${from.toISOString().slice(0, 10)} au ${to.toISOString().slice(0, 10)}`);
    const self = await selfAddressSet(entityId);
    const stepWeights: Record<string, [number, number]> = { exchangeInfo: [0, 3], account: [3, 5], deposits: [5, 20], fiat: [20, 30], convert: [30, 40], rewards: [40, 50], trades: [50, 95] };
    let lastStep = "";
    const res = await syncBinanceAccount(client, {
      accountId, from, to, selfAddresses: self, exhaustive: opts.exhaustive,
      onProgress: async (p) => {
        const [a, b] = stepWeights[p.step] ?? [50, 95];
        const pct = a + ((b - a) * p.done) / Math.max(1, p.total);
        const labels: Record<string, string> = { exchangeInfo: "Liste des paires", account: "Soldes du compte", deposits: "Dépôts et retraits crypto", fiat: "Opérations fiat", convert: "Binance Convert", rewards: "Récompenses et distributions", trades: "Trades spot" };
        const msg = `${labels[p.step] ?? p.step}${p.message ? ` — ${p.message}` : ""}`;
        if (p.step !== lastStep) { lastStep = p.step; await ctx.log(msg); }
        await ctx.progress(pct, msg);
      },
    });
    for (const w of res.warnings) await ctx.log(w, "warn");
    await ctx.progress(96, "Enregistrement des transactions…");
    const { inserted, skipped } = await upsertTransactions(entityId, res.transactions);
    await db.update(exchangeAccounts).set({ lastSyncAt: new Date(), status: "ACTIVE", statusMessage: null, syncCursor: { lastTo: to.toISOString(), scannedSymbols: res.scannedSymbols, balances: res.balances } }).where(eq(exchangeAccounts.id, accountId));
    await db.insert(auditLog).values({ entityId, userId, action: "sync.api", details: { accountId, inserted, skipped, requests: res.requests } });
    await ctx.log(`${inserted} nouvelles transactions, ${skipped} déjà connues, ${res.requests} requêtes API, ${res.scannedSymbols.length} paires analysées.`);
    return { inserted, skipped, requests: res.requests, scannedSymbols: res.scannedSymbols.length, balances: res.balances, warnings: res.warnings };
  });
  return job;
}

/** Quick credential check (account endpoint) before saving an API key. */
export async function testCredentials(apiKey: string, apiSecret: string): Promise<{ ok: boolean; message: string; canTrade?: boolean; balances?: number }> {
  try {
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
