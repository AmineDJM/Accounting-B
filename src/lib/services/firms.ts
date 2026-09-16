import "server-only";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { auditLog, entities, entityMembers, firmMembers, firms, fiscalYears, journalRuns, taxRuns, transactions } from "@/lib/db/schema";
import { getPack } from "@/lib/countries/registry";
import type { ClientRow, Workflow } from "@/lib/cockpit";

export type { ClientRow, Workflow };
export { summarise } from "@/lib/cockpit";

export type Firm = typeof firms.$inferSelect;
export type FiscalYearRow = typeof fiscalYears.$inferSelect;

/**
 * The accounting practice's view.
 *
 * A practice does not open one file at a time: it opens a list of clients with
 * a state against each, and works down the list. The cockpit query therefore
 * returns, in one round trip, what a partner needs to decide where to spend the
 * afternoon — the workflow state of each open fiscal year, when it is due, how
 * many transactions are waiting to be qualified, and whether the country's
 * rules are still a draft.
 */
export async function listFirmsForUser(userId: string): Promise<Firm[]> {
  const db = await getDb();
  const rows = await db
    .select({ firm: firms })
    .from(firmMembers)
    .innerJoin(firms, eq(firms.id, firmMembers.firmId))
    .where(eq(firmMembers.userId, userId));
  return rows.map((r) => r.firm);
}

/** Every entity the user can see, whether through a firm or through a direct membership. */
export async function visibleEntityIds(userId: string, firmId?: string): Promise<string[]> {
  const db = await getDb();
  const direct = await db.select({ id: entityMembers.entityId }).from(entityMembers).where(eq(entityMembers.userId, userId));
  const firmIds = (await listFirmsForUser(userId)).map((f) => f.id).filter((id) => !firmId || id === firmId);
  const viaFirm = firmIds.length
    ? await db.select({ id: entities.id }).from(entities).where(inArray(entities.firmId, firmIds))
    : [];
  return [...new Set([...direct.map((d) => d.id), ...viaFirm.map((e) => e.id)])];
}

export async function cockpit(userId: string, opts: { firmId?: string; year?: number } = {}): Promise<ClientRow[]> {
  const ids = await visibleEntityIds(userId, opts.firmId);
  if (!ids.length) return [];
  const db = await getDb();

  const rows = await db.select().from(entities).where(inArray(entities.id, ids));
  const years = await db.select().from(fiscalYears).where(inArray(fiscalYears.entityId, ids)).orderBy(desc(fiscalYears.endDate));
  const counts = await db
    .select({
      entityId: transactions.entityId,
      total: sql<number>`count(*)::int`,
      toQualify: sql<number>`count(*) filter (where ${transactions.category} = 'UNKNOWN')::int`,
    })
    .from(transactions)
    .where(inArray(transactions.entityId, ids))
    .groupBy(transactions.entityId);
  const lastJournal = await db
    .select({ entityId: journalRuns.entityId, at: sql<Date>`max(${journalRuns.createdAt})` })
    .from(journalRuns)
    .where(inArray(journalRuns.entityId, ids))
    .groupBy(journalRuns.entityId);
  const lastTax = await db
    .select({ entityId: taxRuns.entityId, at: sql<Date>`max(${taxRuns.createdAt})` })
    .from(taxRuns)
    .where(inArray(taxRuns.entityId, ids))
    .groupBy(taxRuns.entityId);

  const countBy = new Map(counts.map((c) => [c.entityId, c]));
  const journalBy = new Map(lastJournal.map((j) => [j.entityId, j.at]));
  const taxBy = new Map(lastTax.map((j) => [j.entityId, j.at]));

  return rows
    .map((e): ClientRow => {
      const pack = getPack(e.country);
      // The fiscal year the practice is working on: the one asked for, else the
      // most recent that is not closed, else the most recent of all.
      const mine = years.filter((y) => y.entityId === e.id);
      const fy = (opts.year ? mine.find((y) => y.endDate.getUTCFullYear() === opts.year) : undefined)
        ?? mine.find((y) => y.workflow !== "DONE")
        ?? mine[0]
        ?? null;
      const c = countBy.get(e.id);
      return {
        entityId: e.id,
        name: e.name,
        country: e.country,
        countryName: pack.name.fr,
        flag: pack.flag,
        currency: e.baseCurrency,
        clientRef: e.clientRef,
        kind: e.kind,
        draft: pack.review.status !== "REVIEWED",
        fiscalYear: fy ? { id: fy.id, label: fy.label, workflow: fy.workflow, dueDate: fy.dueDate, assigneeId: fy.assigneeId } : null,
        counts: { transactions: c?.total ?? 0, toQualify: c?.toQualify ?? 0 },
        lastJournalRun: journalBy.get(e.id) ?? null,
        lastTaxRun: taxBy.get(e.id) ?? null,
      };
    })
    .sort((a, b) => {
      // Everything waiting on the practice first, then by due date, then by name.
      const rank = (r: ClientRow) => (r.counts.toQualify > 0 ? 0 : r.fiscalYear?.workflow === "REVIEW" ? 1 : r.fiscalYear?.workflow === "DONE" ? 3 : 2);
      const d = rank(a) - rank(b);
      if (d !== 0) return d;
      const da = a.fiscalYear?.dueDate?.getTime() ?? Infinity;
      const dbb = b.fiscalYear?.dueDate?.getTime() ?? Infinity;
      return da - dbb || a.name.localeCompare(b.name);
    });
}

export async function setWorkflow(userId: string, entityId: string, fiscalYearId: string, workflow: Workflow, assigneeId?: string | null, dueDate?: Date | null): Promise<void> {
  const db = await getDb();
  const ids = await visibleEntityIds(userId);
  if (!ids.includes(entityId)) throw new Error("Dossier introuvable");
  await db
    .update(fiscalYears)
    .set({ workflow, ...(assigneeId !== undefined ? { assigneeId } : {}), ...(dueDate !== undefined ? { dueDate } : {}) })
    .where(and(eq(fiscalYears.id, fiscalYearId), eq(fiscalYears.entityId, entityId)));
  await db.insert(auditLog).values({ entityId, userId, action: "workflow.set", details: { fiscalYearId, workflow } });
}
