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
  const shots: [string, string][] = [["dashboard", "03-dashboard"], ["accounts", "04-accounts"], ["transactions", "05-transactions"], ["journal", "06-journal"], ["exports", "07-exports"], ["settings", "08-settings"]];
  for (const [path, name] of shots) {
    await page.goto(`${BASE}/app/${entityId}/${path}`); await page.waitForLoadState("networkidle"); await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: path === "journal" || path === "dashboard" });
    console.log("captured", name);
  }
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
