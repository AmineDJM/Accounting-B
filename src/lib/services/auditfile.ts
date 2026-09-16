import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { auditLog, fiscalYears, journalRuns } from "@/lib/db/schema";
import { requireEntity } from "@/lib/dal/entities";
import { ZERO } from "@/lib/engine/money";
import { auditFileBytes, exportAuditFile, FORMAT_LABELS, type AuditFileFormat, type AuditFileInput, type AuditFileOutput, type AccountBalance } from "@/lib/exports";
import { loadEntries, trialBalance } from "./journal";
import { contextFor } from "./country";

/**
 * Produces the audit file the entity's country expects.
 *
 * Which file that is comes from the country pack: the FEC in France, a DATEV
 * posting batch in Germany and Austria, SAF-T in Portugal, XAF in the
 * Netherlands, and a generic ledger everywhere the law asks for readable
 * records rather than a prescribed layout. A practice can still ask for another
 * format — a Belgian file handed to a German colleague, say — so the format is
 * an argument with the country's own as the default.
 */
export async function buildAuditFile(
  userId: string,
  entityId: string,
  runId: string,
  format?: AuditFileFormat,
): Promise<{ output: AuditFileOutput; bytes: Uint8Array; defaultFormat: AuditFileFormat }> {
  const { entity } = await requireEntity(userId, entityId);
  const ctx = contextFor(entity);
  const db = await getDb();
  const [run] = await db.select().from(journalRuns).where(and(eq(journalRuns.id, runId), eq(journalRuns.entityId, entityId)));
  if (!run) throw new Error("Journal introuvable");
  const [fy] = await db.select().from(fiscalYears).where(eq(fiscalYears.id, run.fiscalYearId));
  const entries = await loadEntries(runId);

  // Master files: the chart with the balances the ledger itself produces, which
  // is what SAF-T and XAF require and what makes a file self-checking.
  const balance = trialBalance(entries);
  const accounts: AccountBalance[] = balance.map((b) => ({
    number: b.account,
    label: b.label,
    openingDebit: ZERO,
    openingCredit: ZERO,
    closingDebit: b.balance.gt(0) ? b.balance : ZERO,
    closingCredit: b.balance.lt(0) ? b.balance.neg() : ZERO,
    groupingCategory: "GM",
    accountType: /^[1-5]/.test(b.account) ? "B" : "P",
  }));

  const settings = (entity.settings ?? {}) as { address?: AuditFileInput["entity"]["address"]; consultantNumber?: string; clientNumber?: string; accountLength?: number; vatId?: string };
  const chosen = format ?? ctx.pack.company.auditFile;
  const input: AuditFileInput = {
    entity: {
      name: entity.name,
      legalId: entity.siren ?? entity.taxId ?? undefined,
      vatId: settings.vatId,
      country: ctx.pack.code,
      currency: ctx.currency,
      address: settings.address,
      consultantNumber: settings.consultantNumber,
      clientNumber: settings.clientNumber ?? entity.clientRef ?? undefined,
      accountLength: settings.accountLength,
    },
    fiscalYear: { start: fy.startDate, end: fy.endDate, label: fy.label },
    entries,
    chart: ctx.chart,
    accounts,
    generatedAt: run.createdAt,
    software: { name: "Chainbook", version: "1.0" },
    timezone: ctx.timezone,
  };

  const output = exportAuditFile(chosen, input);
  if (chosen !== ctx.pack.company.auditFile) {
    output.notes.unshift(
      `Format demandé explicitement. Le format attendu dans le pays de ce dossier est « ${FORMAT_LABELS[ctx.pack.company.auditFile].fr} ».`,
    );
  }
  output.notes.push(ctx.pack.company.auditFileNote.fr);
  await db.insert(auditLog).values({
    entityId, userId, action: "export.auditfile",
    details: { runId, format: chosen, lines: output.stats.lines, warnings: output.warnings.length },
  });
  return { output, bytes: auditFileBytes(output), defaultFormat: ctx.pack.company.auditFile };
}

/** The formats offered for this entity, its country's first. */
export function formatsFor(country: string): { format: AuditFileFormat; label: string; recommended: boolean }[] {
  const order: AuditFileFormat[] = ["FEC", "DATEV", "SAFT_PT", "XAF_NL", "CSV"];
  return order.map((format) => ({
    format,
    label: FORMAT_LABELS[format].fr,
    recommended: FORMAT_LABELS[format].countries.includes(country.toUpperCase()),
  })).sort((a, b) => Number(b.recommended) - Number(a.recommended));
}
