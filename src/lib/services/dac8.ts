import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { auditLog, dac8Reconciliations, dac8Statements, type Dac8Aggregate, type Dac8Holding } from "@/lib/db/schema";
import { requireEntity } from "@/lib/dal/entities";
import { D, ZERO } from "@/lib/engine/money";
import { sha256 } from "@/lib/security/crypto";
import { computeDac8Aggregates, type FeeTreatment } from "@/lib/dac8/aggregate";
import { parseDac8 } from "@/lib/dac8/parse";
import { reconcileDac8 } from "@/lib/dac8/reconcile";
import { DAC8_BUCKETS, type Dac8Bucket, type Dac8Statement, type ReconciliationResult } from "@/lib/dac8/types";
import { prepareValuation } from "./journal";
import { contextFor } from "./country";

export type StoredStatement = typeof dac8Statements.$inferSelect;
export type StoredReconciliation = typeof dac8Reconciliations.$inferSelect;

/** Reads a statement file and records it without reconciling anything yet. */
export async function importStatement(
  userId: string,
  entityId: string,
  file: { name: string; content: string },
  opts: { accountId?: string; caspName?: string; year?: number } = {},
): Promise<{ statement: Dac8Statement; id: string }> {
  await requireEntity(userId, entityId, "ACCOUNTANT");
  const parsed = parseDac8(file.name, file.content, { caspName: opts.caspName, year: opts.year });
  const db = await getDb();
  const [row] = await db
    .insert(dac8Statements)
    .values({
      entityId,
      accountId: opts.accountId ?? null,
      year: parsed.year,
      caspName: parsed.caspName,
      caspCountry: parsed.caspCountry ?? null,
      caspIdentifier: parsed.caspIdentifier ?? null,
      source: parsed.source,
      fileName: file.name,
      sha256: sha256(file.content),
      currency: parsed.currency,
      aggregates: parsed.lines.map((l): Dac8Aggregate => ({
        asset: l.asset,
        type: l.bucket,
        count: l.count,
        units: l.units?.toString(),
        amount: l.amount?.toString(),
        currency: parsed.currency,
        typeCode: l.typeCode,
        altValuation: l.altValuation,
      })),
      holdings: parsed.holdings.map((h): Dac8Holding => ({
        asset: h.asset,
        units: h.units.toString(),
        fairMarketValue: h.fairMarketValue?.toString(),
        currency: parsed.currency,
      })),
      notes: parsed.unmapped.join("\n") || null,
      createdBy: userId,
    })
    .returning();
  await db.insert(auditLog).values({
    entityId, userId, action: "dac8.import",
    details: { casp: parsed.caspName, year: parsed.year, lines: parsed.lines.length, unmapped: parsed.unmapped.length },
  });
  return { statement: parsed, id: row.id };
}

/** Rebuilds a stored statement into the shape the reconciler reads. */
export function toStatement(row: StoredStatement): Dac8Statement {
  const known = new Set<string>(DAC8_BUCKETS);
  return {
    caspName: row.caspName,
    caspCountry: row.caspCountry ?? undefined,
    caspIdentifier: row.caspIdentifier ?? undefined,
    year: row.year,
    currency: row.currency,
    source: row.source,
    lines: row.aggregates
      .filter((a) => known.has(a.type))
      .map((a) => ({
        asset: a.asset,
        bucket: a.type as Dac8Bucket,
        count: a.count === undefined ? 0 : a.count,
        units: a.units ? D(a.units) : null,
        amount: a.amount ? D(a.amount) : a.grossAmount ? D(a.grossAmount) : null,
        typeCode: a.typeCode,
        altValuation: a.altValuation,
      })),
    holdings: row.holdings.map((h) => ({
      asset: h.asset,
      units: D(h.units),
      fairMarketValue: h.fairMarketValue ? D(h.fairMarketValue) : null,
    })),
    holdingsOutsideCarf: row.holdings.length > 0,
    unmapped: row.notes ? row.notes.split("\n").filter(Boolean) : [],
  };
}

/**
 * Compares a stored statement with what the app computes from the same account.
 *
 * The fee treatment is a parameter rather than a constant because the directive
 * and the OECD schema disagree: annex VI asks for a gross amount, the XML
 * schema v1.5 for an amount net of fees. Providers follow the schema, so NET is
 * the default, and the reconciler recognises a statement drawn up the other way
 * instead of reporting a difference.
 */
export async function reconcile(
  userId: string,
  entityId: string,
  statementId: string,
  opts: { feeTreatment?: FeeTreatment; store?: boolean } = {},
  log: (m: string) => void = () => {},
): Promise<{ result: ReconciliationResult; statement: Dac8Statement }> {
  const { entity } = await requireEntity(userId, entityId, "ACCOUNTANT");
  const db = await getDb();
  const [row] = await db.select().from(dac8Statements).where(and(eq(dac8Statements.id, statementId), eq(dac8Statements.entityId, entityId)));
  if (!row) throw new Error("Relevé introuvable");

  const ctx = contextFor(entity);
  const { valued, table } = await prepareValuation(entityId, entity, [], log);
  const computed = computeDac8Aggregates(valued, row.year, {
    accountIds: row.accountId ? [row.accountId] : undefined,
    feeTreatment: opts.feeTreatment ?? "NET",
    prices: table,
    currency: ctx.currency,
  });
  const statement = toStatement(row);
  const result = reconcileDac8(statement, computed);

  if (opts.store) {
    await db.insert(dac8Reconciliations).values({
      entityId,
      statementId,
      year: row.year,
      status: result.status,
      summary: {
        caspName: result.caspName,
        currency: result.currency,
        feeTreatment: computed.feeTreatment,
        totals: {
          statementDisposals: result.totals.statementDisposals.toFixed(2),
          computedDisposals: result.totals.computedDisposals.toFixed(2),
          delta: result.totals.delta.toFixed(2),
        },
        advice: result.advice,
        trace: JSON.parse(JSON.stringify(result.trace)) as Record<string, unknown>,
      },
      lines: JSON.parse(JSON.stringify(result.lines)) as Record<string, unknown>[],
      createdBy: userId,
    });
  }
  await db.insert(auditLog).values({
    entityId, userId, action: "dac8.reconcile",
    details: { statementId, status: result.status, delta: result.totals.delta.toFixed(2) },
  });
  return { result, statement };
}

export async function listStatements(userId: string, entityId: string): Promise<StoredStatement[]> {
  await requireEntity(userId, entityId);
  const db = await getDb();
  return db.select().from(dac8Statements).where(eq(dac8Statements.entityId, entityId)).orderBy(desc(dac8Statements.year), desc(dac8Statements.createdAt));
}

export async function listReconciliations(userId: string, entityId: string): Promise<StoredReconciliation[]> {
  await requireEntity(userId, entityId);
  const db = await getDb();
  return db.select().from(dac8Reconciliations).where(eq(dac8Reconciliations.entityId, entityId)).orderBy(desc(dac8Reconciliations.createdAt)).limit(50);
}

export async function deleteStatement(userId: string, entityId: string, statementId: string): Promise<void> {
  await requireEntity(userId, entityId, "ACCOUNTANT");
  const db = await getDb();
  await db.delete(dac8Statements).where(and(eq(dac8Statements.id, statementId), eq(dac8Statements.entityId, entityId)));
  await db.insert(auditLog).values({ entityId, userId, action: "dac8.delete", details: { statementId } });
}

/**
 * What the app would have reported for a year, without any statement to compare
 * with. Useful before the first statement arrives: it is exactly what the
 * administration will receive.
 */
export async function expectedAggregates(userId: string, entityId: string, year: number, feeTreatment: FeeTreatment = "NET", log: (m: string) => void = () => {}) {
  const { entity } = await requireEntity(userId, entityId);
  const ctx = contextFor(entity);
  const { valued, table } = await prepareValuation(entityId, entity, [], log);
  const computed = computeDac8Aggregates(valued, year, { feeTreatment, prices: table, currency: ctx.currency });
  const total = computed.buckets.filter((b) => b.bucket !== "TransferWallet").reduce((a, b) => a.plus(b.amount), ZERO);
  return { computed, total, currency: ctx.currency, inScope: ctx.pack.dac8.inScope, note: ctx.pack.dac8.note };
}
