/**
 * Seeds a demo user + company + individual with a synthetic Binance CSV export
 * and a manual price table, so the app can be explored without any network access.
 *   npx tsx scripts/seed-demo.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config();
process.env.APP_ENCRYPTION_KEY ??= "demo-encryption-key-change-me-please";

import { eq } from "drizzle-orm";
import { getDb } from "../src/lib/db";
import { entities, entityMembers, exchangeAccounts, priceCoverage, prices, users, walletAddresses } from "../src/lib/db/schema";
import { importBinanceCsv } from "../src/lib/connectors/binance/csv";
import { upsertTransactions } from "../src/lib/dal/transactions";
import { ensureFiscalYears } from "../src/lib/dal/entities";

const DAY = 24 * 3600 * 1000;

function demoCsv(): string {
  const rows: string[] = [`"User_ID","UTC_Time","Account","Operation","Coin","Change","Remark"`];
  const r = (t: string, op: string, coin: string, change: string, remark = "") => rows.push(`"41879234","${t}","Spot","${op}","${coin}","${change}","${remark}"`);
  r("2024-01-08 09:12:00", "Fiat Deposit", "EUR", "15000.00000000");
  r("2024-01-08 10:30:00", "Transaction Buy", "BTC", "0.20000000"); r("2024-01-08 10:30:00", "Transaction Spend", "EUR", "8000.00000000".replace(/^/, "-")); r("2024-01-08 10:30:00", "Transaction Fee", "BTC", "-0.00020000");
  r("2024-01-15 14:05:00", "Transaction Buy", "ETH", "2.50000000"); r("2024-01-15 14:05:00", "Transaction Spend", "EUR", "-5000.00000000"); r("2024-01-15 14:05:00", "Transaction Fee", "BNB", "-0.01500000");
  r("2024-01-15 14:04:00", "Transaction Buy", "BNB", "0.50000000"); r("2024-01-15 14:04:00", "Transaction Spend", "EUR", "-140.00000000");
  r("2024-03-02 08:00:00", "Simple Earn Flexible Subscription", "ETH", "-1.00000000");
  for (let m = 3; m <= 12; m++) r(`2024-${String(m).padStart(2, "0")}-15 00:00:00`, "Simple Earn Flexible Interest", "ETH", "0.00250000");
  r("2024-04-10 16:20:00", "Binance Convert", "BTC", "-0.05000000"); r("2024-04-10 16:20:00", "Binance Convert", "USDT", "3300.00000000");
  r("2024-06-21 11:00:00", "Transaction Sold", "ETH", "-0.50000000"); r("2024-06-21 11:00:00", "Transaction Revenue", "EUR", "1620.00000000"); r("2024-06-21 11:00:00", "Transaction Fee", "EUR", "-1.62000000");
  r("2024-07-05 09:30:00", "Withdraw", "ETH", "-0.30000000", "Withdraw fee is included. 0x9a1c3f0b2e4d5a6b7c8d9e0f1a2b3c4d5e6f7a8b");
  r("2024-08-19 18:45:00", "Withdraw", "USDT", "-1200.00000000", "Withdraw fee is included. TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE");
  r("2024-09-01 12:00:00", "Small Assets Exchange BNB", "DOGE", "-25.00000000"); r("2024-09-01 12:00:00", "Small Assets Exchange BNB", "TRX", "-40.00000000"); r("2024-09-01 12:00:00", "Small Assets Exchange BNB", "BNB", "0.00900000");
  r("2024-08-25 10:00:00", "Deposit", "DOGE", "25.00000000"); r("2024-08-25 10:01:00", "Deposit", "TRX", "40.00000000");
  r("2024-10-12 15:10:00", "Buy Crypto", "EUR", "-500.00000000"); r("2024-10-12 15:10:00", "Buy Crypto", "SOL", "3.20000000");
  r("2024-11-20 09:00:00", "Fiat Withdraw", "EUR", "-2000.00000000");
  r("2024-12-05 20:00:00", "Deposit", "ETH", "0.40000000", "0x5f3c1a9b7d2e4f6a8c0b1d3e5f7a9c2b4d6e8f0a");
  r("2025-01-20 10:00:00", "Transaction Buy", "BTC", "0.02000000"); r("2025-01-20 10:00:00", "Transaction Spend", "USDT", "-2000.00000000"); r("2025-01-20 10:00:00", "Transaction Fee", "BNB", "-0.00400000");
  r("2025-03-14 13:30:00", "Transaction Sold", "BTC", "-0.10000000"); r("2025-03-14 13:30:00", "Transaction Revenue", "EUR", "7800.00000000"); r("2025-03-14 13:30:00", "Transaction Fee", "EUR", "-7.80000000");
  r("2025-05-02 08:15:00", "Withdraw", "BTC", "-0.02000000", "Withdraw fee is included. bc1qdemo7x8k2m3n4p5q6r7s8t9u0v1w2x3y4z5a6b");
  r("2025-06-30 23:00:00", "Fiat Withdraw", "EUR", "-3000.00000000");
  return rows.join("\n") + "\n";
}

/** Smooth synthetic daily price curves (EUR) so every transaction and closing date has a quote. */
function priceCurve(asset: string, day: number): number {
  const t = day / 365;
  const base: Record<string, [number, number]> = { BTC: [38000, 0.9], ETH: [2100, 0.5], BNB: [280, 0.6], SOL: [90, 1.2], USDT: [0.92, 0.0], DOGE: [0.08, 0.5], TRX: [0.1, 0.3] };
  const [p0, amp] = base[asset] ?? [1, 0];
  return p0 * (1 + amp * (0.5 * Math.sin(t * 2.1) + 0.4 * t) ) * (1 + 0.03 * Math.sin(day / 3));
}

async function main() {
  const db = await getDb();
  const email = "demo@chainbook.local";
  let [user] = await db.select().from(users).where(eq(users.email, email));
  if (!user) [user] = await db.insert(users).values({ email, name: "Compte démo", emailVerified: new Date() }).returning();

  const existing = await db.select().from(entities).where(eq(entities.createdBy, user.id));
  if (existing.length) { console.log("Demo data already present"); return; }

  const [company] = await db.insert(entities).values({ name: "Nova Digital SAS", kind: "COMPANY", siren: "912345678", legalForm: "SAS", createdBy: user.id }).returning();
  const [person] = await db.insert(entities).values({ name: "Amine D. (particulier)", kind: "INDIVIDUAL", createdBy: user.id }).returning();
  await db.insert(entityMembers).values([{ entityId: company.id, userId: user.id, role: "OWNER" }, { entityId: person.id, userId: user.id, role: "OWNER" }]);
  await db.update(users).set({ lastEntityId: company.id }).where(eq(users.id, user.id));
  for (const e of [company, person]) await ensureFiscalYears(e, new Date(Date.UTC(2024, 0, 1)));

  const csv = demoCsv();
  for (const e of [company, person]) {
    const [acc] = await db.insert(exchangeAccounts).values({ entityId: e.id, exchange: "BINANCE", label: "Binance principal", index: 1, journalCode: "CR1", externalUserId: "41879234" }).returning();
    await db.insert(walletAddresses).values([{ entityId: e.id, address: "0x9a1c3f0b2e4d5a6b7c8d9e0f1a2b3c4d5e6f7a8b", network: "ETH", label: "Ledger", kind: "SELF" }, { entityId: e.id, address: "bc1qdemo7x8k2m3n4p5q6r7s8t9u0v1w2x3y4z5a6b", network: "BTC", label: "Ledger", kind: "SELF" }]);
    const res = importBinanceCsv(csv, acc.id, new Set(["0x9a1c3f0b2e4d5a6b7c8d9e0f1a2b3c4d5e6f7a8b", "bc1qdemo7x8k2m3n4p5q6r7s8t9u0v1w2x3y4z5a6b"]));
    // qualify a few operations like a user would
    for (const t of res.transactions) {
      if (t.type === "CRYPTO_WITHDRAWAL" && t.legs[0].asset === "USDT") { t.category = "PURCHASE_GOODS"; t.counterparty = { ...(t.counterparty ?? { kind: "EXTERNAL" }), kind: "EXTERNAL", label: "Fournisseur (facture F-2024-118)" }; t.note = "Paiement fournisseur – prestation design"; }
      if (t.type === "CRYPTO_DEPOSIT" && t.legs[0].asset === "ETH") { t.category = "CUSTOMER_RECEIPT"; t.counterparty = { ...(t.counterparty ?? { kind: "EXTERNAL" }), kind: "EXTERNAL" }; t.note = "Règlement client – facture 2024-042"; }
    }
    await upsertTransactions(e.id, res.transactions);
  }

  // synthetic price cache: daily quotes 2024-01-01 → today for every asset used
  const assets = ["BTC", "ETH", "BNB", "SOL", "USDT", "DOGE", "TRX"];
  const start = Date.UTC(2023, 11, 25);
  const rows: (typeof prices.$inferInsert)[] = [];
  const cov: (typeof priceCoverage.$inferInsert)[] = [];
  for (let t = start, d = 0; t <= Date.now() + DAY; t += DAY, d++) {
    for (const a of assets) {
      for (const h of [0, 12, 23]) rows.push({ asset: a, ts: new Date(t + h * 3600 * 1000 + (h === 23 ? 59 * 60 * 1000 : 0)), priceEur: priceCurve(a, d).toFixed(8), source: "demo", granularity: "1d" });
      cov.push({ asset: a, day: new Date(t).toISOString().slice(0, 10), status: "OK", source: "demo" });
    }
  }
  for (let i = 0; i < rows.length; i += 500) await db.insert(prices).values(rows.slice(i, i + 500)).onConflictDoNothing();
  for (let i = 0; i < cov.length; i += 500) await db.insert(priceCoverage).values(cov.slice(i, i + 500)).onConflictDoNothing();
  console.log(`Seeded demo user ${email}, company ${company.id}, individual ${person.id}, ${rows.length} prices`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
