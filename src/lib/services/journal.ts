import "server-only";
import { and, asc, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { auditLog, fiscalYears, journalEntries, journalRuns } from "@/lib/db/schema";
import { D, ZERO, type Decimal } from "@/lib/engine/money";
import { type ChartOfAccounts } from "@/lib/engine/chart";
import { contextFor, tableFor } from "./country";
import { generateJournal, type JournalEntry, type JournalResult } from "@/lib/engine/journal";
import { valueTransactions } from "@/lib/engine/valuation";
import { buildFecRows } from "@/lib/engine/fecbuild";
import { fecFileName, serializeFec, validateFec, type FecValidationReport } from "@/lib/engine/fec";
import { defaultProviders, pricingNeeds, PricingService } from "@/lib/pricing/service";
import { coingeckoKey } from "@/lib/dal/settings";
import { listAccounts } from "@/lib/dal/accounts";
import { requireEntity, type Entity, type FiscalYear } from "@/lib/dal/entities";
import { createJob, spawn, type Job, type JobContext } from "@/lib/dal/jobs";
import { loadAllTransactions } from "@/lib/dal/transactions";
import { entities } from "@/lib/db/schema";

export type JournalRun = typeof journalRuns.$inferSelect;
export type StoredEntry = typeof journalEntries.$inferSelect;

/** The chart of the entity's country, with the entity's own renumbering applied. */
export function chartFor(entity: Entity): ChartOfAccounts {
  return contextFor(entity).chart;
}

/** Values every transaction of the entity (fetching missing prices) and returns the engine inputs. */
export async function prepareValuation(entityId: string, entity: Entity, closingDates: Date[], log: (m: string) => void, progress?: (p: number, m: string) => Promise<void>) {
  const db = await getDb();
  const txs = await loadAllTransactions(entityId);
  const ctx = contextFor(entity);
  // The books' own currency and the dollar have to be priced even when no
  // transaction mentions them: the first rebases every quote, the second
  // converts the CARF threshold. Leaving them out is how a whole portfolio
  // ends up valued at zero.
  const assets = [...new Set([
    ...txs.flatMap((t) => t.legs.map((l) => l.asset.toUpperCase())),
    ctx.currency,
    "USD",
  ])].filter((a) => a !== "EUR");
  const pricing = new PricingService(db, defaultProviders({ coingeckoApiKey: await coingeckoKey() }), log);
  await progress?.(10, `Cours de ${assets.length} actifs…`);
  const needs = pricingNeeds(txs, closingDates, assets);
  const { fetched, missing } = await pricing.ensure(needs);
  if (fetched) log(`${fetched} cours téléchargés`);
  if (missing.length) log(`${missing.length} jour(s)/actif(s) sans cours : ${[...new Set(missing.map((m) => m.asset))].slice(0, 10).join(", ")}`);
  const from = txs[0]?.timestamp ?? new Date();
  const to = new Date(Math.max(...closingDates.map((d) => d.getTime()), Date.now()));
  // Prices are cached in euro; an entity whose books are in another currency
  // reads the same cache through a rebasing view rather than a second fetch.
  const table = tableFor(await pricing.table(assets, from, to), ctx);
  const valued = valueTransactions(txs, table);
  return { txs, valued, table, assets, missing, ctx };
}

/** Runs the accounting engine for a fiscal year and stores the resulting journal. */
/**
 * Generates and stores one journal run, inside a job that already exists, so
 * that the one-click refresh can chain it after the synchronisations.
 */
export async function runJournalGeneration(ctx: JobContext, userId: string, entityId: string, fiscalYearId: string, opts: { withInventory: boolean }): Promise<{ runId: string; entries: number; warnings: number }> {
  const { entity } = await requireEntity(userId, entityId, "ACCOUNTANT");
  const db = await getDb();
  const [fy] = await db.select().from(fiscalYears).where(and(eq(fiscalYears.id, fiscalYearId), eq(fiscalYears.entityId, entityId)));
  if (!fy) throw new Error("Exercice introuvable");
  {
    const accounts = await listAccounts(userId, entityId);
    const { valued, table, missing } = await prepareValuation(entityId, entity, [fy.endDate], (m) => void ctx.log(m), (p, m) => ctx.progress(p, m));
    await ctx.progress(60, "Génération des écritures…");
    // opening positions: closing positions of the previous run of the previous fiscal year, when it exists
    const previous = await previousFiscalYear(entityId, fy);
    const prevRun = previous ? await latestRun(entityId, previous.id) : null;
    const openingPositions = fy.openingPositions?.map((p) => ({ asset: p.asset, qty: D(p.qty), totalCost: D(p.totalCost), lots: [] }))
      ?? (prevRun ? (prevRun.positions as { asset: string; qty: string; totalCost: string }[]).map((p) => ({ asset: p.asset, qty: D(p.qty), totalCost: D(p.totalCost), lots: [] })) : undefined);
    const previousProvisions = Object.fromEntries(Object.entries(prevRun ? (prevRun.summary.closingProvisions as Record<string, string> ?? {}) : fy.previousProvisions ?? {}).map(([k, v]) => [k, D(v)]));
    const result = generateJournal(valued, {
      chart: chartFor(entity),
      assetAccountMap: entity.assetAccountMap,
      assetAccountWidth: contextFor(entity).pack.company.assetAccountWidth,
      fiscalYear: { start: fy.startDate, end: fy.endDate },
      method: entity.costMethod,
      accounts: accounts.map((a) => ({ id: a.id, label: a.label, index: a.index, journalCode: a.journalCode ?? undefined })),
      validationDate: new Date(),
      openingPositions,
      previousProvisions,
      closingPrices: table,
      generateInventory: opts.withInventory,
    });
    await ctx.progress(85, "Enregistrement…");
    await db.update(entities).set({ assetAccountMap: result.assetAccountMap }).where(eq(entities.id, entityId));
    const summary = {
      totals: { debit: result.totals.debit.toFixed(2), credit: result.totals.credit.toFixed(2), entries: result.totals.entries, lines: result.totals.lines },
      closingProvisions: Object.fromEntries(Object.entries(result.closingProvisions).map(([k, v]) => [k, v.toFixed(2)])),
      missingPrices: missing.length,
      realizedTotal: result.realized.reduce((a, r) => a.plus(r.gainEur), ZERO).toFixed(2),
      warningsCount: result.warnings.length,
      reversals: result.reversalEntries.map(serializeEntry),
    };
    const [run] = await db.insert(journalRuns).values({
      entityId, fiscalYearId, method: entity.costMethod, withInventory: opts.withInventory, summary,
      warnings: result.warnings.map((w) => ({ code: w.code, level: w.level, message: w.message, txId: w.txId, date: w.date?.toISOString() })),
      inventory: result.inventory.map((i) => ({ asset: i.asset, qty: i.qty.toString(), bookValueEur: i.bookValueEur.toFixed(2), marketPriceEur: i.marketPriceEur?.toString() ?? null, marketValueEur: i.marketValueEur?.toFixed(2) ?? null, latentEur: i.latentEur?.toFixed(2) ?? null, provisionEur: i.provisionEur.toFixed(2) })),
      realized: result.realized.map((r) => ({ txId: r.txId, date: r.date.toISOString(), asset: r.asset, qty: r.qty.toString(), proceedsEur: r.proceedsEur.toFixed(2), costBasisEur: r.costBasisEur.toFixed(2), gainEur: r.gainEur.toFixed(2), kind: r.kind })),
      positions: [...result.positions.values()].map((p) => ({ asset: p.asset, qty: p.qty.toString(), totalCost: p.totalCost.toFixed(2) })),
      createdBy: userId,
    }).returning();
    for (let i = 0; i < result.entries.length; i += 200) {
      const chunk = result.entries.slice(i, i + 200);
      await db.insert(journalEntries).values(chunk.map((e) => ({ runId: run.id, entityId, ...serializeEntry(e) })));
    }
    await db.update(fiscalYears).set({ closingProvisions: summary.closingProvisions }).where(eq(fiscalYears.id, fiscalYearId));
    await db.insert(auditLog).values({ entityId, userId, action: "journal.run", details: { runId: run.id, fiscalYear: fy.label, entries: result.totals.entries } });
    await ctx.log(`${result.totals.entries} écritures (${result.totals.lines} lignes), ${result.warnings.length} alerte(s).`);
    return { runId: run.id, entries: result.totals.entries, warnings: result.warnings.length };
  }
}

export async function startJournalRun(userId: string, entityId: string, fiscalYearId: string, opts: { withInventory: boolean }): Promise<Job> {
  const { entity } = await requireEntity(userId, entityId, "ACCOUNTANT");
  void entity;
  const db = await getDb();
  const [fy] = await db.select().from(fiscalYears).where(and(eq(fiscalYears.id, fiscalYearId), eq(fiscalYears.entityId, entityId)));
  if (!fy) throw new Error("Exercice introuvable");
  const job = await createJob(entityId, "JOURNAL", userId, null, `Génération du journal ${fy.label}`);
  spawn(job, (ctx) => runJournalGeneration(ctx, userId, entityId, fiscalYearId, opts));
  return job;
}

function serializeEntry(e: JournalEntry) {
  return {
    journalCode: e.journalCode, journalLib: e.journalLib, seq: e.seq, num: e.num, date: e.date, pieceRef: e.pieceRef, pieceDate: e.pieceDate, label: e.label, kind: e.kind, txId: e.txId ?? null,
    lines: e.lines.map((l) => ({ account: l.account, accountLabel: l.accountLabel, label: l.label, debit: l.debit.toFixed(2), credit: l.credit.toFixed(2), currencyAmount: l.currencyAmount?.toString(), currency: l.currency })),
    warnings: e.warnings,
  };
}

export function deserializeEntry(row: { journalCode: string; journalLib: string; seq: number; num: string; date: Date; pieceRef: string; pieceDate: Date; label: string; kind: string; txId: string | null; lines: { account: string; accountLabel: string; label: string; debit: string; credit: string; currencyAmount?: string; currency?: string }[]; warnings: string[] }): JournalEntry {
  return {
    journalCode: row.journalCode, journalLib: row.journalLib, seq: row.seq, num: row.num, date: new Date(row.date), pieceRef: row.pieceRef, pieceDate: new Date(row.pieceDate), label: row.label, kind: row.kind as JournalEntry["kind"], txId: row.txId ?? undefined, warnings: row.warnings,
    lines: row.lines.map((l) => ({ account: l.account, accountLabel: l.accountLabel, label: l.label, debit: D(l.debit), credit: D(l.credit), currencyAmount: l.currencyAmount ? D(l.currencyAmount) : undefined, currency: l.currency })),
  };
}

export async function previousFiscalYear(entityId: string, fy: FiscalYear): Promise<FiscalYear | null> {
  const db = await getDb();
  const rows = await db.select().from(fiscalYears).where(eq(fiscalYears.entityId, entityId)).orderBy(asc(fiscalYears.startDate));
  const idx = rows.findIndex((r) => r.id === fy.id);
  return idx > 0 ? rows[idx - 1] : null;
}

export async function latestRun(entityId: string, fiscalYearId: string): Promise<JournalRun | null> {
  const db = await getDb();
  const [run] = await db.select().from(journalRuns).where(and(eq(journalRuns.entityId, entityId), eq(journalRuns.fiscalYearId, fiscalYearId))).orderBy(desc(journalRuns.createdAt)).limit(1);
  return run ?? null;
}

export async function listRuns(entityId: string, fiscalYearId: string): Promise<JournalRun[]> {
  const db = await getDb();
  return db.select().from(journalRuns).where(and(eq(journalRuns.entityId, entityId), eq(journalRuns.fiscalYearId, fiscalYearId))).orderBy(desc(journalRuns.createdAt)).limit(20);
}

export async function loadEntries(runId: string): Promise<JournalEntry[]> {
  const db = await getDb();
  const rows = await db.select().from(journalEntries).where(eq(journalEntries.runId, runId)).orderBy(asc(journalEntries.date), asc(journalEntries.journalCode), asc(journalEntries.seq));
  return rows.map(deserializeEntry);
}

export interface FecExport { fileName: string; content: string; report: FecValidationReport; rows: number }

export async function exportFec(userId: string, entityId: string, runId: string, separator: "|" | "\t" = "|"): Promise<FecExport> {
  const { entity } = await requireEntity(userId, entityId);
  const db = await getDb();
  const [run] = await db.select().from(journalRuns).where(and(eq(journalRuns.id, runId), eq(journalRuns.entityId, entityId)));
  if (!run) throw new Error("Journal introuvable");
  const [fy] = await db.select().from(fiscalYears).where(eq(fiscalYears.id, run.fiscalYearId));
  const entries = await loadEntries(runId);
  const rows = buildFecRows(entries, { validationDate: run.createdAt });
  const report = validateFec(rows, { start: fy.startDate, end: fy.endDate });
  await db.insert(auditLog).values({ entityId, userId, action: "export.fec", details: { runId, rows: rows.length, ok: report.ok } });
  return { fileName: fecFileName(entity.siren ?? "000000000", fy.endDate), content: serializeFec(rows, separator), report, rows: rows.length };
}

/** Trial balance (balance des comptes) computed from stored entries. */
export function trialBalance(entries: JournalEntry[]): { account: string; label: string; debit: Decimal; credit: Decimal; balance: Decimal }[] {
  const m = new Map<string, { account: string; label: string; debit: Decimal; credit: Decimal }>();
  for (const e of entries) for (const l of e.lines) {
    const cur = m.get(l.account) ?? { account: l.account, label: l.accountLabel, debit: ZERO, credit: ZERO };
    cur.debit = cur.debit.plus(l.debit);
    cur.credit = cur.credit.plus(l.credit);
    m.set(l.account, cur);
  }
  return [...m.values()].sort((a, b) => a.account.localeCompare(b.account)).map((r) => ({ ...r, balance: r.debit.minus(r.credit) }));
}

export type { JournalResult };
