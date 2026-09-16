"use server";
import { requireUser } from "@/auth";
import { requireEntity } from "@/lib/dal/entities";
import { createJob, spawn } from "@/lib/dal/jobs";
import { computeCountryTax } from "@/lib/services/countrytax";
import { toWire } from "@/lib/services/serialize";

export type Result = { ok: true; id: string } | { ok: false; error: string };

export async function computeTaxAction(entityId: string, options?: Record<string, string | number | boolean>): Promise<Result> {
  try {
    const user = await requireUser();
    await requireEntity(user.id, entityId);
    const job = await createJob(entityId, "PRICING", user.id, null, "Calcul de la fiscalité personnelle");
    spawn(job, async (ctx) => {
      await ctx.progress(5, "Téléchargement des cours…");
      const { result, missingPrices, draft, notice } = await computeCountryTax(user.id, entityId, { store: true, options }, (m) => void ctx.log(m));
      for (const w of result.warnings.slice(0, 100)) await ctx.log(w.message, w.level === "error" ? "error" : "warn");
      await ctx.progress(95, "Finalisation…");
      return { ...toWire(result), missingPrices, draft, notice };
    });
    return { ok: true, id: job.id };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
