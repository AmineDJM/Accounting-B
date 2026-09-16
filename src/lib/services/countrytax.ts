import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { auditLog, taxRuns } from "@/lib/db/schema";
import { requireEntity } from "@/lib/dal/entities";
import { pick } from "@/lib/countries/types";
import type { TaxComputationResult, YearSummary } from "@/lib/engine/tax/types";
import { D } from "@/lib/engine/money";
import { prepareValuation } from "./journal";
import { contextFor, DRAFT_NOTICE } from "./country";

export type StoredTaxRun = typeof taxRuns.$inferSelect;

/**
 * Runs the country's own engine over the entity's history.
 *
 * The result is stored whole, trace included, because the point of the trace is
 * that the figure filed in March can still be explained in November when the
 * administration asks. A stored run is therefore never recomputed to answer a
 * question about the past: it is read back.
 */
export async function computeCountryTax(
  userId: string,
  entityId: string,
  opts: { years?: number[]; store?: boolean; options?: Record<string, string | number | boolean> } = {},
  log: (m: string) => void = () => {},
): Promise<{ result: TaxComputationResult; missingPrices: number; draft: boolean; notice: string | null }> {
  const { entity } = await requireEntity(userId, entityId);
  const ctx = contextFor(entity);
  const { valued, table, missing } = await prepareValuation(entityId, entity, [], log);
  const settings = (entity.settings ?? {}) as { externalHoldings?: Record<string, string> };
  const externalHoldings = settings.externalHoldings
    ? Object.fromEntries(Object.entries(settings.externalHoldings).map(([k, v]) => [k, D(v)]))
    : undefined;

  const result = ctx.pack.engine(
    {
      country: ctx.pack.code,
      currency: ctx.currency,
      valued,
      prices: table,
      externalHoldings,
      options: opts.options,
      years: opts.years,
      now: new Date(),
    },
    ctx.pack,
  );

  if (missing.length) {
    result.warnings.push({
      level: "warning",
      message: `${missing.length} cours manquant(s) : les lignes concernées sont valorisées au dernier cours connu, ce qui peut décaler une position de clôture.`,
    });
  }

  const db = await getDb();
  if (opts.store) {
    await db.insert(taxRuns).values({
      entityId,
      country: ctx.pack.code,
      regime: result.regime,
      currency: result.currency,
      result: JSON.parse(JSON.stringify(result)) as Record<string, unknown>,
      packVersion: ctx.pack.review.lastReviewed,
      createdBy: userId,
    });
  }
  await db.insert(auditLog).values({
    entityId,
    userId,
    action: "tax.country.compute",
    details: { country: ctx.pack.code, years: result.years.map((y) => y.year), disposals: result.events.length },
  });

  return {
    result,
    missingPrices: missing.length,
    draft: ctx.draft,
    notice: ctx.draft ? pick(DRAFT_NOTICE, ctx.locale) : null,
  };
}

/** The runs kept for this entity, newest first, for the "what did we file" question. */
export async function listTaxRuns(userId: string, entityId: string, limit = 20): Promise<StoredTaxRun[]> {
  await requireEntity(userId, entityId);
  const db = await getDb();
  return db.select().from(taxRuns).where(eq(taxRuns.entityId, entityId)).orderBy(desc(taxRuns.createdAt)).limit(limit);
}

export async function getTaxRun(userId: string, entityId: string, runId: string): Promise<StoredTaxRun | null> {
  await requireEntity(userId, entityId);
  const db = await getDb();
  const [run] = await db.select().from(taxRuns).where(and(eq(taxRuns.id, runId), eq(taxRuns.entityId, entityId)));
  return run ?? null;
}

/** The lines a country's forms expect, flattened for the interface. */
export function formLinesFor(result: TaxComputationResult, year: number): YearSummary["formLines"] {
  return result.years.find((y) => y.year === year)?.formLines ?? [];
}

/** CSV of the year's taxable events, for the working papers. */
export function eventsCsv(result: TaxComputationResult, year?: number): string {
  const rows = result.events.filter((e) => (year ? e.date.getUTCFullYear() === year : true));
  const header = ["Date", "Actif", "Quantité", "Nature", "Contrepartie", "Prix de cession", "Frais", "Prix de cession net", "Prix d'acquisition", "Résultat", "Exonéré", "Motif", "Jours de détention"];
  const f = (v: { toFixed: (n: number) => string }) => v.toFixed(2).replace(".", ",");
  const lines = rows.map((e) =>
    [
      e.date.toISOString().slice(0, 10),
      e.asset,
      e.qty.toString().replace(".", ","),
      e.disposalKind,
      e.counterAsset ?? "",
      f(e.proceeds),
      f(e.fees),
      f(e.netProceeds),
      f(e.costBasis),
      f(e.gain),
      e.exempt ? "oui" : "non",
      (e.exemptReason ?? "").replace(/[;\r\n]+/g, " "),
      e.holdingDays ?? "",
    ].join(";"),
  );
  return "﻿" + [header.join(";"), ...lines].join("\r\n") + "\r\n";
}
