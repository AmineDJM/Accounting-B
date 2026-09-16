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
  await page.fill('input[name="email"]', "demo@finly.local");
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
  // `scripts/demo-compute.ts` runs the calculations beforehand, so the page
  // only has to load. Driving the button from here was flaky: a job that takes
  // half a minute outlives the click.
  const computed = await page.locator("text=Comment ce montant est obtenu").count();
  if (!computed) console.warn("tax page has no stored result — run `npx tsx scripts/demo-compute.ts` first");
  await page.screenshot({ path: `${OUT}/07-tax.png`, fullPage: true });
  console.log(`captured tax${computed ? " with result" : " (empty)"}`);

  // The practice cockpit and the country picker are not entity pages.
  await page.goto(`${BASE}/app/clients`); await page.waitForLoadState("networkidle"); await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/11-clients.png`, fullPage: true });
  // The administration console, which the demo account can reach.
  for (const [path, name] of [["", "13-admin"], ["/accounts", "14-admin-accounts"], ["/activity", "15-admin-activity"], ["/audit", "16-admin-audit"]] as [string, string][]) {
    await page.goto(`${BASE}/admin${path}`); await page.waitForLoadState("networkidle"); await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  }
  // The detail of one account. Reading the href and navigating to it is
  // steadier than a click: the list re-renders after its filters hydrate, and
  // a click resolved against the old tree goes nowhere.
  await page.goto(`${BASE}/admin/accounts`); await page.waitForLoadState("networkidle");
  // An active account other than the one signed in: it is the only case where
  // every panel is live, view-as included.
  const rows = await page.locator("tbody tr").evaluateAll((els) =>
    els.map((tr) => ({
      href: tr.querySelector<HTMLAnchorElement>('a[href^="/admin/accounts/"]')?.getAttribute("href") ?? "",
      text: tr.textContent ?? "",
    })),
  );
  const usable = rows.filter((r) => r.href.length > "/admin/accounts/".length);
  const target = (usable.find((r) => !/Désactivé|En attente|demo@/.test(r.text)) ?? usable[0])?.href;
  if (target) {
    await page.goto(`${BASE}${target}`); await page.waitForLoadState("networkidle"); await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}/17-admin-account.png`, fullPage: true });
  } else {
    console.warn("no account link on /admin/accounts — 17-admin-account.png not captured");
  }
  console.log("captured admin console");

  await page.goto(`${BASE}/app/new`); await page.waitForLoadState("networkidle");
  await page.click('button:has-text("Particulier")');
  await page.click('button:has-text("Continuer")');
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/12-country-picker.png`, fullPage: true });
  console.log("captured clients + country picker");
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
