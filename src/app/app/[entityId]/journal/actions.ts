"use server";
import { requireUser } from "@/auth";
import { startJournalRun } from "@/lib/services/journal";

export type Result = { ok: true; id: string } | { ok: false; error: string };

export async function generateJournalAction(entityId: string, fiscalYearId: string, withInventory: boolean): Promise<Result> {
  try {
    const user = await requireUser();
    const job = await startJournalRun(user.id, entityId, fiscalYearId, { withInventory });
    return { ok: true, id: job.id };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
