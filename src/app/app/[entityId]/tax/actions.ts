"use server";
import { requireUser } from "@/auth";
import { requireEntity } from "@/lib/dal/entities";
import { createJob, spawn } from "@/lib/dal/jobs";
import { computeTaxForEntity } from "@/lib/services/tax";

export type Result = { ok: true; id: string } | { ok: false; error: string };

export async function computeTaxAction(entityId: string): Promise<Result> {
  try {
    const user = await requireUser();
    await requireEntity(user.id, entityId);
    const job = await createJob(entityId, "PRICING", user.id, null, "Calcul des plus-values (art. 150 VH bis)");
    spawn(job, async (ctx) => {
      await ctx.progress(5, "Téléchargement des cours…");
      const { result, missingPrices } = await computeTaxForEntity(user.id, entityId, (m) => void ctx.log(m));
      for (const w of result.warnings.slice(0, 100)) await ctx.log(w, "warn");
      await ctx.progress(95, "Finalisation…");
      return {
        computedAt: new Date().toISOString(),
        missingPrices,
        totalAcquisitionEur: result.totalAcquisitionEur.toFixed(2),
        years: result.years.map((y) => ({ ...y, totalProceedsEur: y.totalProceedsEur.toFixed(2), totalGainsEur: y.totalGainsEur.toFixed(2), totalLossesEur: y.totalLossesEur.toFixed(2), netGainEur: y.netGainEur.toFixed(2), taxablePfuEur: y.taxablePfuEur.toFixed(2), estimatedTaxPfuEur: y.estimatedTaxPfuEur.toFixed(2), estimatedSocialOnlyEur: y.estimatedSocialOnlyEur.toFixed(2) })),
        disposals: result.disposals.map((d) => ({ txId: d.txId, date: d.date.toISOString(), asset: d.asset, qty: d.qty.toString(), portfolioValueEur: d.portfolioValueEur.toFixed(2), grossProceedsEur: d.grossProceedsEur.toFixed(2), feesEur: d.feesEur.toFixed(2), netProceedsEur: d.netProceedsEur.toFixed(2), totalAcquisitionEur: d.totalAcquisitionEur.toFixed(2), fractionsPreviouslyDeductedEur: d.fractionsPreviouslyDeductedEur.toFixed(2), netAcquisitionEur: d.netAcquisitionEur.toFixed(2), fractionEur: d.fractionEur.toFixed(2), gainEur: d.gainEur.toFixed(2), warnings: d.warnings })),
        warnings: result.warnings.slice(0, 200),
      };
    });
    return { ok: true, id: job.id };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
