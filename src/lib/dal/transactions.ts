import "server-only";
import { and, asc, count, desc, eq, gte, ilike, inArray, lte, or, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { auditLog, exchangeAccounts, transactions } from "@/lib/db/schema";
import type { CanonicalTx, Category } from "@/lib/engine/model";
import { rowToTx, txToRow, type TxRow } from "./convert";
import { requireEntity } from "./entities";

export interface TxFilter {
  accountId?: string;
  type?: string;
  category?: string;
  asset?: string;
  from?: Date;
  to?: Date;
  q?: string;
  reviewStatus?: "AUTO" | "REVIEWED" | "FLAGGED";
  page?: number;
  pageSize?: number;
}

export async function upsertTransactions(entityId: string, txs: CanonicalTx[]): Promise<{ inserted: number; skipped: number }> {
  const db = await getDb();
  let inserted = 0;
  for (let i = 0; i < txs.length; i += 200) {
    const chunk = txs.slice(i, i + 200).map((t) => txToRow(t, entityId));
    if (chunk.length === 0) continue;
    const res = await db.insert(transactions).values(chunk).onConflictDoNothing({ target: [transactions.accountId, transactions.externalId] }).returning({ id: transactions.id });
    inserted += res.length;
  }
  return { inserted, skipped: txs.length - inserted };
}

export async function loadAllTransactions(entityId: string, accountIds?: string[]): Promise<CanonicalTx[]> {
  const db = await getDb();
  const where = accountIds && accountIds.length ? and(eq(transactions.entityId, entityId), inArray(transactions.accountId, accountIds)) : eq(transactions.entityId, entityId);
  const rows = await db.select().from(transactions).where(where).orderBy(asc(transactions.timestamp));
  return rows.map(rowToTx);
}

export async function listTransactions(userId: string, entityId: string, filter: TxFilter = {}): Promise<{ rows: TxRow[]; total: number; page: number; pageSize: number }> {
  await requireEntity(userId, entityId);
  const db = await getDb();
  const page = Math.max(1, filter.page ?? 1);
  const pageSize = Math.min(200, Math.max(10, filter.pageSize ?? 50));
  const conds = [eq(transactions.entityId, entityId)];
  if (filter.accountId) conds.push(eq(transactions.accountId, filter.accountId));
  if (filter.type) conds.push(eq(transactions.type, filter.type));
  if (filter.category) conds.push(eq(transactions.category, filter.category));
  if (filter.reviewStatus) conds.push(eq(transactions.reviewStatus, filter.reviewStatus));
  if (filter.from) conds.push(gte(transactions.timestamp, filter.from));
  if (filter.to) conds.push(lte(transactions.timestamp, filter.to));
  if (filter.asset) conds.push(sql`${transactions.legs}::text ilike ${"%\"asset\":\"" + filter.asset.toUpperCase() + "\"%"}`);
  if (filter.q) conds.push(or(ilike(transactions.ref, `%${filter.q}%`), ilike(transactions.note, `%${filter.q}%`), sql`${transactions.counterparty}::text ilike ${"%" + filter.q + "%"}`)!);
  const where = and(...conds);
  const [{ total }] = await db.select({ total: count() }).from(transactions).where(where);
  const rows = await db.select().from(transactions).where(where).orderBy(desc(transactions.timestamp)).limit(pageSize).offset((page - 1) * pageSize);
  return { rows, total: Number(total), page, pageSize };
}

export async function getTransaction(userId: string, entityId: string, txId: string): Promise<TxRow | null> {
  await requireEntity(userId, entityId);
  const db = await getDb();
  const [row] = await db.select().from(transactions).where(and(eq(transactions.id, txId), eq(transactions.entityId, entityId))).limit(1);
  return row ?? null;
}

export async function categorizeTransaction(userId: string, entityId: string, txId: string, patch: { category?: Category; note?: string; counterpartyKind?: "SELF" | "EXTERNAL" | "BANK" | "UNKNOWN"; reviewStatus?: "AUTO" | "REVIEWED" | "FLAGGED" }): Promise<void> {
  await requireEntity(userId, entityId, "ACCOUNTANT");
  const db = await getDb();
  const [row] = await db.select().from(transactions).where(and(eq(transactions.id, txId), eq(transactions.entityId, entityId))).limit(1);
  if (!row) throw new Error("Transaction introuvable");
  const counterparty = patch.counterpartyKind ? { ...(row.counterparty ?? { kind: "UNKNOWN" }), kind: patch.counterpartyKind } : row.counterparty;
  await db.update(transactions).set({
    category: patch.category ?? row.category,
    note: patch.note !== undefined ? patch.note : row.note,
    counterparty,
    reviewStatus: patch.reviewStatus ?? "REVIEWED",
    updatedAt: new Date(),
  }).where(eq(transactions.id, txId));
  await db.insert(auditLog).values({ entityId, userId, action: "transaction.categorize", details: { txId, ...patch } });
}

export async function bulkCategorize(userId: string, entityId: string, txIds: string[], category: Category): Promise<number> {
  await requireEntity(userId, entityId, "ACCOUNTANT");
  if (txIds.length === 0) return 0;
  const db = await getDb();
  const res = await db.update(transactions).set({ category, reviewStatus: "REVIEWED", updatedAt: new Date() }).where(and(eq(transactions.entityId, entityId), inArray(transactions.id, txIds))).returning({ id: transactions.id });
  await db.insert(auditLog).values({ entityId, userId, action: "transaction.bulkCategorize", details: { count: res.length, category } });
  return res.length;
}

/** Apply a category to every transaction whose counterparty address matches (e.g. once a wallet is declared as SELF). */
export async function categorizeByAddress(entityId: string, address: string, category: Category, kind: "SELF" | "EXTERNAL"): Promise<number> {
  const db = await getDb();
  const rows = await db.select({ id: transactions.id, counterparty: transactions.counterparty }).from(transactions).where(and(eq(transactions.entityId, entityId), sql`lower(${transactions.counterparty}->>'address') = ${address.toLowerCase()}`));
  for (const r of rows) await db.update(transactions).set({ category, counterparty: { ...(r.counterparty ?? { kind }), kind }, reviewStatus: "REVIEWED" }).where(eq(transactions.id, r.id));
  return rows.length;
}

export async function createManualTransaction(userId: string, entityId: string, tx: Omit<CanonicalTx, "id" | "source" | "externalId">): Promise<string> {
  await requireEntity(userId, entityId, "ACCOUNTANT");
  const db = await getDb();
  const externalId = `manual:${crypto.randomUUID()}`;
  const [row] = await db.insert(transactions).values(txToRow({ ...tx, id: externalId, source: "manual", externalId }, entityId)).returning({ id: transactions.id });
  await db.insert(auditLog).values({ entityId, userId, action: "transaction.manual", details: { txId: row.id, type: tx.type } });
  return row.id;
}

export async function deleteTransaction(userId: string, entityId: string, txId: string): Promise<void> {
  await requireEntity(userId, entityId, "ACCOUNTANT");
  const db = await getDb();
  await db.delete(transactions).where(and(eq(transactions.id, txId), eq(transactions.entityId, entityId), eq(transactions.source, "manual")));
}

export async function deleteAccountTransactions(userId: string, entityId: string, accountId: string, source?: string): Promise<number> {
  await requireEntity(userId, entityId, "ADMIN");
  const db = await getDb();
  const conds = [eq(transactions.entityId, entityId), eq(transactions.accountId, accountId)];
  if (source) conds.push(eq(transactions.source, source));
  const res = await db.delete(transactions).where(and(...conds)).returning({ id: transactions.id });
  return res.length;
}

export interface TxStats { total: number; flagged: number; byType: Record<string, number>; first?: Date; last?: Date; accounts: { id: string; label: string; count: number }[] }

export async function transactionStats(entityId: string): Promise<TxStats> {
  const db = await getDb();
  const byType = await db.select({ type: transactions.type, n: count() }).from(transactions).where(eq(transactions.entityId, entityId)).groupBy(transactions.type);
  const [{ flagged }] = await db.select({ flagged: count() }).from(transactions).where(and(eq(transactions.entityId, entityId), eq(transactions.reviewStatus, "FLAGGED")));
  const [range] = await db.select({ first: sql<Date | null>`min(${transactions.timestamp})`, last: sql<Date | null>`max(${transactions.timestamp})` }).from(transactions).where(eq(transactions.entityId, entityId));
  const perAccount = await db.select({ id: exchangeAccounts.id, label: exchangeAccounts.label, n: count(transactions.id) }).from(exchangeAccounts).leftJoin(transactions, eq(transactions.accountId, exchangeAccounts.id)).where(eq(exchangeAccounts.entityId, entityId)).groupBy(exchangeAccounts.id, exchangeAccounts.label);
  const total = byType.reduce((a, r) => a + Number(r.n), 0);
  return {
    total, flagged: Number(flagged), byType: Object.fromEntries(byType.map((r) => [r.type, Number(r.n)])),
    first: range?.first ? new Date(range.first) : undefined, last: range?.last ? new Date(range.last) : undefined,
    accounts: perAccount.map((a) => ({ id: a.id, label: a.label, count: Number(a.n) })),
  };
}
