import { config } from "dotenv";
config({ path: ".env.local" }); config();
process.env.APP_ENCRYPTION_KEY ??= "demo-encryption-key-change-me-please";
import { eq } from "drizzle-orm";
import { getDb } from "../src/lib/db";
import { entities, users } from "../src/lib/db/schema";
import { computeCountryTax } from "../src/lib/services/countrytax";
import { expectedAggregates, listStatements, reconcile } from "../src/lib/services/dac8";
import { cockpit, summarise } from "../src/lib/services/firms";

async function main() {
  const db = await getDb();
  const [user] = await db.select().from(users).where(eq(users.email, "demo@finly.local"));
  const rows = await db.select().from(entities).where(eq(entities.createdBy, user.id));

  console.log("=== Cockpit ===");
  const clients = await cockpit(user.id);
  const s = summarise(clients);
  console.log(`${s.clients} dossiers · ${s.toQualify} à qualifier · pays: ${s.countries.join(",")} · brouillons: ${s.drafts}`);
  for (const c of clients) console.log(`  ${c.flag} ${c.name.padEnd(28)} ${String(c.fiscalYear?.workflow ?? "-").padEnd(12)} ${c.counts.toQualify}/${c.counts.transactions}`);

  console.log("\n=== Fiscalité par pays ===");
  for (const e of rows) {
    const { result, draft } = await computeCountryTax(user.id, e.id, { store: false });
    const last = result.years.at(-1);
    const wealth = result.wealth.at(-1);
    console.log(`${e.country} ${e.name.padEnd(26)} régime=${result.regime.padEnd(7)} années=${result.years.length} cessions=${result.events.length}`);
    if (last) {
      console.log(`   ${last.year}: base=${last.taxableBase.toFixed(2)} ${result.currency}  impôt=${last.estimatedTax ? last.estimatedTax.toFixed(2) : "—"}  exonérées=${result.events.filter((x) => x.exempt).length}/${result.events.length}`);
    }
    if (wealth) console.log(`   position ${wealth.year} au ${wealth.at.toISOString().slice(0,10)} = ${wealth.total.toFixed(2)} ${result.currency} (${wealth.holdings.length} actifs)${wealth.formLines.length ? ` · ${wealth.formLines[0].label} ${wealth.formLines[0].value}` : ""}`);
    console.log(`   hypothèses=${result.assumptions.length} refs=${result.refs.length} alertes=${result.warnings.length} brouillon=${draft}`);
    if (last?.trace) console.log(`   trace: ${last.trace.label} → ${last.trace.steps.length} étapes`);
  }

  console.log("\n=== DAC8 ===");
  const person = rows.find((r) => r.name.includes("Amine"))!;
  const exp = await expectedAggregates(user.id, person.id, 2025, "NET");
  console.log(`agrégats calculés 2025: ${exp.computed.buckets.length} lignes, total ${exp.total.toFixed(2)} ${exp.currency}, seuil RRPT ${exp.computed.rrptThreshold?.amount.toFixed(0) ?? "n/a"}`);
  for (const b of exp.computed.buckets.slice(0, 6)) console.log(`  ${b.asset.padEnd(6)} ${b.bucket.padEnd(20)} n=${String(b.count).padEnd(3)} net=${b.amountNet.toFixed(2)} brut=${b.amountGross.toFixed(2)}`);
  const [st] = await listStatements(user.id, person.id);
  if (st) {
    for (const treatment of ["NET", "GROSS"] as const) {
      const { result } = await reconcile(user.id, person.id, st.id, { feeTreatment: treatment, store: false });
      console.log(`  ${treatment}: ${result.status}, écart ${result.totals.delta.toFixed(2)} ${result.currency}, ${result.lines.filter((l) => l.status !== "MATCH").length}/${result.lines.length} lignes divergentes`);
      for (const l of result.lines.slice(0, 4)) console.log(`     ${l.asset} ${l.bucket.padEnd(20)} ${l.status}`);
    }
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
