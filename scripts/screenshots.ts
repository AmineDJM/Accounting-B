/**
 * Captures screenshots of the main screens with Playwright (uses the demo login).
 *   BASE_URL=http://localhost:3000 npx tsx scripts/screenshots.ts
 */
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = process.env.OUT_DIR ?? "docs/screenshots";

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "fr-FR", colorScheme: (process.env.COLOR_SCHEME as "light" | "dark") ?? "light" });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.error("pageerror", e.message));
  await page.goto(`${BASE}/`); await page.waitForLoadState("networkidle");
  await page.screenshot({ path: `${OUT}/01-landing.png`, fullPage: false });
  await page.goto(`${BASE}/login`); await page.waitForLoadState("networkidle");
  await page.screenshot({ path: `${OUT}/02-login.png` });
  await page.fill('input[name="email"]', "demo@chainbook.local");
  await page.click('button:has-text("Entrer sans Google")');
  await page.waitForURL(/\/app\//, { timeout: 60000 });
  await page.waitForLoadState("networkidle");
  const entityId = page.url().match(/\/app\/([^/]+)\//)?.[1];
  if (!entityId) throw new Error(`no entity in url ${page.url()}`);
  const shots: [string, string][] = [["dashboard", "03-dashboard"], ["accounts", "04-accounts"], ["transactions", "05-transactions"], ["journal", "06-journal"], ["tax", "07-tax"], ["dac8", "08-dac8"], ["exports", "09-exports"], ["settings", "10-settings"]];
  for (const [path, name] of shots) {
    await page.goto(`${BASE}/app/${entityId}/${path}`); await page.waitForLoadState("networkidle"); await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: path === "journal" || path === "dashboard" || path === "dac8" });
    console.log("captured", name);
  }
  // A computed result, because an empty tax page shows none of the point of
  // the product: the trace under each figure.
  await page.goto(`${BASE}/app/${entityId}/tax`); await page.waitForLoadState("networkidle");
  const alreadyComputed = await page.locator("text=Comment ce montant est obtenu").count();
  if (!alreadyComputed) {
    // The button says "Calculer" the first time and "Recalculer" afterwards;
    // it is replaced while the job runs, so a detached element is expected.
    await page.locator("button", { hasText: /^Calculer$|^Recalculer$/ }).first().click().catch(() => {});
    await page.waitForSelector("text=Comment ce montant est obtenu", { timeout: 120000 }).catch(() => {});
    await page.waitForTimeout(2500);
    await page.reload(); await page.waitForLoadState("networkidle"); await page.waitForTimeout(800);
  }
  await page.screenshot({ path: `${OUT}/07-tax.png`, fullPage: true });
  console.log("captured tax with result");

  // The practice cockpit and the country picker are not entity pages.
  await page.goto(`${BASE}/app/clients`); await page.waitForLoadState("networkidle"); await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/11-clients.png`, fullPage: true });
  await page.goto(`${BASE}/app/new`); await page.waitForLoadState("networkidle");
  await page.click('button:has-text("Particulier")');
  await page.click('button:has-text("Continuer")');
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/12-country-picker.png`, fullPage: true });
  console.log("captured clients + country picker");
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
