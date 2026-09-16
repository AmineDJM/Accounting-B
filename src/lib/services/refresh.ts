import "server-only";
import { listAccounts } from "@/lib/dal/accounts";
import { listFiscalYears, requireEntity } from "@/lib/dal/entities";
import { activeJob, createJob, spawn, type Job, type JobContext } from "@/lib/dal/jobs";
import { platformSpec } from "@/lib/connectors/platforms";
import { runAccountSync } from "./sync";
import { runJournalGeneration } from "./journal";
import { computeCountryTax } from "./countrytax";

/**
 * Rescales a job's progress so a step can report 0 to 100 of itself while the
 * job as a whole moves between two bounds. Without it, chaining steps means
 * every one of them has to know where it sits in the sequence.
 */
function scoped(ctx: JobContext, from: number, to: number): JobContext {
  return {
    progress: (percent, message) => ctx.progress(from + ((to - from) * Math.max(0, Math.min(100, percent))) / 100, message),
    log: ctx.log,
  };
}

export interface RefreshSummary {
  synced: number;
  inserted: number;
  journalRunId: string | null;
  entries: number;
  taxYears: number;
  warnings: string[];
}

/**
 * Everything, in one go.
 *
 * The four things a file needs — the operations, their value, the journal and
 * the tax — are one chain, not four buttons: an import that is not followed by
 * a valuation and a journal has changed nothing anyone can file. Each step
 * reports into the same job, so there is one thing to watch and one place where
 * a failure shows up.
 *
 * A step that fails does not cancel the ones before it: the synchronisations
 * are kept, and the reason the journal or the tax stopped is written in the
 * log, because a network refusal on one exchange must not lose the rest.
 */
export async function startFullRefresh(userId: string, entityId: string, opts: { withInventory?: boolean } = {}): Promise<Job> {
  const { entity } = await requireEntity(userId, entityId, "ACCOUNTANT");
  const running = await activeJob(entityId);
  if (running) return running;

  const job = await createJob(entityId, "REFRESH", userId, null, "Mise à jour complète…");
  spawn(job, async (ctx) => {
    const summary: RefreshSummary = { synced: 0, inserted: 0, journalRunId: null, entries: 0, taxYears: 0, warnings: [] };
    const accounts = await listAccounts(userId, entityId);
    const connected = accounts.filter((a) => a.hasApiKey && platformSpec(a.exchange).api && a.status !== "DISABLED");

    if (connected.length) {
      const span = 55 / connected.length;
      for (let i = 0; i < connected.length; i++) {
        const a = connected[i];
        const spec = platformSpec(a.exchange);
        await ctx.log(`${spec.name} — ${a.label}`);
        try {
          const res = await runAccountSync(scoped(ctx, i * span, (i + 1) * span), userId, entityId, a.id);
          summary.synced++;
          summary.inserted += res.inserted;
          summary.warnings.push(...res.warnings);
        } catch (e) {
          const message = `${spec.name} — ${a.label} : ${(e as Error).message}`;
          summary.warnings.push(message);
          await ctx.log(message, "error");
        }
      }
    } else {
      await ctx.log("Aucune plateforme connectée par clé API : seuls les fichiers déjà importés sont pris en compte.");
    }

    if (entity.kind === "COMPANY") {
      const years = await listFiscalYears(entityId);
      // The year that has ended most recently is the one being closed.
      const now = new Date();
      const target = [...years].reverse().find((y) => y.startDate <= now) ?? years[years.length - 1];
      if (target) {
        await ctx.progress(56, `Journal ${target.label}…`);
        try {
          const res = await runJournalGeneration(scoped(ctx, 56, 80), userId, entityId, target.id, { withInventory: opts.withInventory ?? true });
          summary.journalRunId = res.runId;
          summary.entries = res.entries;
        } catch (e) {
          const message = `Journal ${target.label} : ${(e as Error).message}`;
          summary.warnings.push(message);
          await ctx.log(message, "error");
        }
      } else {
        await ctx.log("Aucun exercice ouvert : le journal n'a pas été généré.");
      }
    }

    await ctx.progress(82, "Calcul de l'impôt…");
    try {
      const { result, draft, notice } = await computeCountryTax(userId, entityId, { store: true }, (m) => void ctx.log(m));
      summary.taxYears = result.years.length;
      if (draft && notice) await ctx.log(notice, "warn");
    } catch (e) {
      const message = `Calcul fiscal : ${(e as Error).message}`;
      summary.warnings.push(message);
      await ctx.log(message, "error");
    }

    await ctx.progress(100, "À jour");
    await ctx.log(
      `${summary.synced} plateforme(s) synchronisée(s), ${summary.inserted} nouvelle(s) opération(s), ` +
        `${summary.entries} écriture(s), ${summary.taxYears} année(s) fiscales calculées.`,
    );
    return { ...summary, warnings: summary.warnings.slice(0, 20) };
  });
  return job;
}
