import { config } from "dotenv";
config({ path: ".env.local" }); config();
process.env.APP_ENCRYPTION_KEY ??= "demo-encryption-key-change-me-please";
import { eq } from "drizzle-orm";
import { getDb } from "../src/lib/db";
import { entities, fiscalYears, users } from "../src/lib/db/schema";
import { startJournalRun } from "../src/lib/services/journal";
import { buildAuditFile } from "../src/lib/services/auditfile";
import { getJob } from "../src/lib/dal/jobs";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const db = await getDb();
  const [user] = await db.select().from(users).where(eq(users.email, "demo@chainbook.local"));
  const rows = await db.select().from(entities).where(eq(entities.createdBy, user.id));
  for (const e of rows.filter((r) => r.kind === "COMPANY")) {
    const fys = await db.select().from(fiscalYears).where(eq(fiscalYears.entityId, e.id));
    const fy = fys.sort((a, b) => a.endDate.getTime() - b.endDate.getTime()).find((f) => f.endDate.getUTCFullYear() === 2025) ?? fys[0];
    const job = await startJournalRun(user.id, e.id, fy.id, { withInventory: true });
    for (let i = 0; i < 90; i++) {
      const j = await getJob(e.id, job.id);
      if (j?.status === "DONE" || j?.status === "FAILED") break;
      await wait(1000);
    }
    const done = await getJob(e.id, job.id);
    if (done?.status !== "DONE") { console.log(`${e.country} ${e.name}: journal ${done?.status} ${done?.message ?? ""}`); continue; }
    const runId = (done.result as { runId: string }).runId;
    const { output, bytes, defaultFormat } = await buildAuditFile(user.id, e.id, runId);
    console.log(`${e.country} ${e.name}`);
    console.log(`   format=${defaultFormat} fichier=${output.fileName} ${bytes.length} octets encodage=${output.encoding}`);
    console.log(`   ${output.stats.entries} écritures / ${output.stats.lines} lignes · débit ${output.stats.debit.toFixed(2)} crédit ${output.stats.credit.toFixed(2)}`);
    if (output.warnings.length) for (const w of output.warnings.slice(0, 3)) console.log(`   ⚠ ${w.slice(0, 160)}`);
    console.log(`   première ligne : ${output.content.split("\n")[0].slice(0, 110)}`);
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
