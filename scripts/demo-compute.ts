/**
 * Runs, for the demo data, the computations the screenshots are meant to show:
 * a journal per company and a tax result per file. Driving the buttons from
 * Playwright is flaky — a job that takes thirty seconds outlives the click —
 * so the work is done here and the capture only has to load a page.
 *   npx tsx scripts/demo-compute.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config();
process.env.APP_ENCRYPTION_KEY ??= "demo-encryption-key-change-me-please";

import { eq } from "drizzle-orm";
import { getDb } from "../src/lib/db";
import { entities, fiscalYears, users } from "../src/lib/db/schema";
import { createJob, getJob, spawn } from "../src/lib/dal/jobs";
import { startJournalRun } from "../src/lib/services/journal";
import { computeCountryTax } from "../src/lib/services/countrytax";
import { toWire } from "../src/lib/services/serialize";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function settle(entityId: string, jobId: string, label: string) {
  for (let i = 0; i < 180; i++) {
    const j = await getJob(entityId, jobId);
    if (j?.status === "DONE") return j;
    if (j?.status === "FAILED") { console.log(`   ${label} : échec — ${j.message ?? ""}`); return null; }
    await wait(1000);
  }
  console.log(`   ${label} : toujours en cours après 180 s`);
  return null;
}

async function main() {
  const db = await getDb();
  const [user] = await db.select().from(users).where(eq(users.email, "demo@chainbook.local"));
  if (!user) throw new Error("Jeu de démonstration absent : lancez d'abord `npm run seed`.");
  const rows = await db.select().from(entities).where(eq(entities.createdBy, user.id));

  for (const e of rows) {
    console.log(`${e.country} ${e.name}`);
    if (e.kind === "COMPANY") {
      const fys = await db.select().from(fiscalYears).where(eq(fiscalYears.entityId, e.id));
      const fy = fys.sort((a, b) => a.endDate.getTime() - b.endDate.getTime()).find((f) => f.endDate.getUTCFullYear() === 2025) ?? fys[0];
      if (fy) {
        const job = await startJournalRun(user.id, e.id, fy.id, { withInventory: true });
        const done = await settle(e.id, job.id, "journal");
        if (done) console.log(`   journal ${fy.label} : ${(done.result as { entries: number }).entries} écritures`);
      }
    }
    const job = await createJob(e.id, "PRICING", user.id, null, "Calcul de la fiscalité personnelle");
    spawn(job, async (ctx) => {
      const { result, missingPrices, draft, notice } = await computeCountryTax(user.id, e.id, { store: true }, (m) => void ctx.log(m));
      return { ...toWire(result), missingPrices, draft, notice };
    });
    const done = await settle(e.id, job.id, "fiscalité");
    if (done) {
      const r = done.result as { years?: { year: number; taxableBase: string }[] };
      const last = r.years?.at(-1);
      console.log(`   fiscalité : ${r.years?.length ?? 0} année(s)${last ? `, base ${last.year} = ${last.taxableBase}` : ""}`);
    }
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
