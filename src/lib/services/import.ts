import "server-only";
import { getDb } from "@/lib/db";
import { auditLog, importFiles } from "@/lib/db/schema";
import { importBinanceCsv } from "@/lib/connectors/binance/csv";
import { sha256 } from "@/lib/security/crypto";
import { selfAddressSet } from "@/lib/dal/accounts";
import { requireEntity } from "@/lib/dal/entities";
import { upsertTransactions } from "@/lib/dal/transactions";

export interface ImportSummary { fileId: string; rowCount: number; inserted: number; skipped: number; ignoredRows: number; warnings: string[]; from?: string; to?: string; userId?: string }

export async function importCsvFile(userId: string, entityId: string, accountId: string, fileName: string, text: string): Promise<ImportSummary> {
  await requireEntity(userId, entityId, "ACCOUNTANT");
  const db = await getDb();
  const self = await selfAddressSet(entityId);
  const result = importBinanceCsv(text, accountId, self);
  if (result.rowCount === 0) throw new Error("Aucune ligne reconnue : le fichier doit être l'export « Transaction History » de Binance (colonnes User_ID, UTC_Time, Account, Operation, Coin, Change, Remark).");
  const { inserted, skipped } = await upsertTransactions(entityId, result.transactions);
  const [file] = await db.insert(importFiles).values({ entityId, accountId, fileName, sizeBytes: Buffer.byteLength(text), sha256: sha256(text), rowCount: result.rowCount, importedCount: inserted, skippedCount: skipped, warnings: result.warnings, createdBy: userId }).returning();
  await db.insert(auditLog).values({ entityId, userId, action: "import.csv", details: { fileName, rows: result.rowCount, inserted, skipped } });
  return { fileId: file.id, rowCount: result.rowCount, inserted, skipped, ignoredRows: result.ignoredRows, warnings: result.warnings, from: result.from?.toISOString(), to: result.to?.toISOString(), userId: result.userId };
}
