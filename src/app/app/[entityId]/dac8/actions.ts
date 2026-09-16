"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/auth";
import { requireEntity } from "@/lib/dal/entities";
import { deleteStatement, expectedAggregates, importStatement, reconcile } from "@/lib/services/dac8";
import { toWire, type WireReconciliation } from "@/lib/services/serialize";
import type { FeeTreatment } from "@/lib/dac8/aggregate";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

export async function importStatementAction(entityId: string, form: FormData): Promise<ActionResult<{ id: string; lines: number; unmapped: string[] }>> {
  try {
    const user = await requireUser();
    await requireEntity(user.id, entityId, "ACCOUNTANT");
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choisissez un fichier." };
    if (file.size > 8_000_000) return { ok: false, error: "Fichier trop volumineux (8 Mo maximum)." };
    const content = await file.text();
    const caspName = String(form.get("caspName") ?? "").trim() || undefined;
    const yearRaw = Number(form.get("year"));
    const accountId = String(form.get("accountId") ?? "").trim() || undefined;
    const { id, statement } = await importStatement(user.id, entityId, { name: file.name, content }, {
      caspName,
      year: Number.isFinite(yearRaw) && yearRaw > 2000 ? yearRaw : undefined,
      accountId,
    });
    revalidatePath(`/app/${entityId}/dac8`);
    return { ok: true, data: { id, lines: statement.lines.length, unmapped: statement.unmapped } };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function reconcileAction(entityId: string, statementId: string, feeTreatment: FeeTreatment): Promise<ActionResult<WireReconciliation>> {
  try {
    const user = await requireUser();
    await requireEntity(user.id, entityId, "ACCOUNTANT");
    const { result } = await reconcile(user.id, entityId, statementId, { feeTreatment, store: true });
    revalidatePath(`/app/${entityId}/dac8`);
    return { ok: true, data: toWire(result) };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function deleteStatementAction(entityId: string, statementId: string): Promise<ActionResult<null>> {
  try {
    const user = await requireUser();
    await deleteStatement(user.id, entityId, statementId);
    revalidatePath(`/app/${entityId}/dac8`);
    return { ok: true, data: null };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function expectedAction(entityId: string, year: number, feeTreatment: FeeTreatment) {
  try {
    const user = await requireUser();
    await requireEntity(user.id, entityId);
    const { computed, total, currency, inScope, note } = await expectedAggregates(user.id, entityId, year, feeTreatment);
    return {
      ok: true as const,
      data: {
        year,
        currency,
        inScope,
        note: note.fr,
        total: total.toFixed(2),
        notes: computed.notes,
        rrptThreshold: computed.rrptThreshold ? computed.rrptThreshold.amount.toFixed(2) : null,
        buckets: computed.buckets.map((b) => ({
          asset: b.asset,
          bucket: b.bucket,
          count: b.count,
          units: b.units.toString(),
          amount: b.amount.toFixed(2),
          amountGross: b.amountGross.toFixed(2),
          amountNet: b.amountNet.toFixed(2),
          fees: b.fees.toFixed(2),
        })),
      },
    };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}
