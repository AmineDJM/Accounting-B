/**
 * End-to-end check on the demo data: logs in, generates the journal of the
 * company (fiscal year 2024 + 2025), waits for the job, downloads and validates
 * the FEC, then computes the individual's capital gains.
 *   BASE_URL=http://localhost:3000 npx tsx scripts/e2e-journal.ts
 */
import { chromium } from "playwright";
import fs from "node:fs";
import { parseFec, validateFec } from "../src/lib/engine/fec";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = process.env.OUT_DIR ?? "docs/screenshots";

async function main() {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "fr-FR", acceptDownloads: true });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.error("pageerror", e.message));
  await page.goto(`${BASE}/login`);
  await page.fill('input[name="email"]', "demo@chainbook.local");
  await page.click('button:has-text("Entrer sans Google")');
  await page.waitForURL(/\/app\//, { timeout: 60000 });
  await page.waitForLoadState("networkidle");
  // make sure we are on the company dossier
  if (!(await page.getByTestId("entity-switcher").textContent())?.includes("Nova Digital SAS")) {
    const before = page.url();
    await page.getByTestId("entity-switcher").click();
    await page.getByTestId("entity-option").filter({ hasText: "Nova Digital SAS" }).click();
    await page.waitForURL((u) => u.toString() !== before, { timeout: 60000 });
    await page.waitForLoadState("networkidle");
  }
  const entityId = page.url().match(/\/app\/([^/]+)\//)![1];

  for (const label of ["2024", "2025"]) {
    await page.goto(`${BASE}/app/${entityId}/journal`);
    await page.waitForLoadState("networkidle");
    await page.selectOption("select", { label });
    await page.waitForURL(/fy=/, { timeout: 30000 });
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(800);
    await page.click('button:has-text("Générer le journal")');
    await page.waitForSelector("text=Journal généré", { timeout: 180000 });
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);
    console.log(`journal ${label}:`, (await page.locator("text=/FEC (conforme|non conforme)/").first().textContent())?.trim());
  }
  await page.screenshot({ path: `${OUT}/06-journal.png`, fullPage: true });
  await page.getByRole("tab", { name: /Alertes/ }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/09-journal-alertes.png`, fullPage: true });
  await page.getByRole("tab", { name: "Inventaire" }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/10-journal-inventaire.png`, fullPage: true });
  await page.getByRole("tab", { name: "Écritures" }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/12-journal-ecritures.png`, fullPage: true });

  // download FEC through the API with the session cookie
  const fecLink = await page.locator('a[href*="/export/fec/"]').first().getAttribute("href");
  const res = await ctx.request.get(`${BASE}${fecLink}`);
  const text = await res.text();
  const rows = parseFec(text);
  const fy = { start: new Date("2025-01-01T00:00:00Z"), end: new Date("2025-12-31T23:59:59Z") };
  const report = validateFec(rows, fy);
  console.log("FEC file:", res.headers()["content-disposition"], "rows:", rows.length, "valid:", report.ok, "issues:", report.issues.filter((i) => i.level === "error").map((i) => i.message).slice(0, 5));
  fs.writeFileSync(`${OUT}/../demo-FEC-2025.txt`, text);

  // individual entity: capital gains
  await page.goto(`${BASE}/app/${entityId}/dashboard`);
  await page.waitForLoadState("networkidle");
  await page.getByTestId("entity-switcher").click();
  await page.getByTestId("entity-option").filter({ hasText: "particulier" }).click();
  await page.waitForURL((u) => /dashboard/.test(u.toString()) && !u.toString().includes(entityId), { timeout: 60000 });
  const personId = page.url().match(/\/app\/([^/]+)\//)![1];
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: `${OUT}/13-dashboard-particulier.png`, fullPage: true });
  await page.goto(`${BASE}/app/${personId}/tax`);
  await page.waitForLoadState("networkidle");
  await page.click('button:has-text("Calculer les plus-values")');
  await page.waitForSelector("text=Calcul terminé", { timeout: 180000 });
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${OUT}/11-tax.png`, fullPage: true });
  console.log("tax page:", (await page.locator("text=/Cessions 20\\d\\d/").allTextContents()).join(" | "));
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
