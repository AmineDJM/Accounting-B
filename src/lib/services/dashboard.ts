import "server-only";
import { getDb } from "@/lib/db";
import { ZERO, type Decimal } from "@/lib/engine/money";
import { computeHoldings, portfolioTimeline, valueHoldings } from "@/lib/engine/portfolio";
import { createPriceTable } from "@/lib/engine/valuation";
import { PricingService } from "@/lib/pricing/service";
import { loadAllTransactions, transactionStats } from "@/lib/dal/transactions";
import { requireEntity } from "@/lib/dal/entities";

export interface DashboardData {
  stats: Awaited<ReturnType<typeof transactionStats>>;
  holdings: { asset: string; qty: string; priceEur: string | null; valueEur: string; share: number }[];
  totalValueEur: string;
  missingPrices: string[];
  timeline: { date: string; value: number }[];
  monthlyFlows: { month: string; deposits: number; withdrawals: number }[];
  pricedAt: string;
}

export async function loadDashboard(userId: string, entityId: string): Promise<DashboardData> {
  await requireEntity(userId, entityId);
  const db = await getDb();
  const [stats, txs] = await Promise.all([transactionStats(entityId), loadAllTransactions(entityId)]);
  const holdings = computeHoldings(txs);
  const assets = [...holdings.keys()];
  const pricing = new PricingService(db);
  const now = new Date();
  // dashboard uses cached prices only (never blocks on providers); a journal run fills the cache
  const table = assets.length ? await pricing.table(assets, txs[0]?.timestamp ?? now, now) : createPriceTable([]);
  const valued = valueHoldings(holdings, table, now);
  const from = new Date(Math.max(txs[0]?.timestamp.getTime() ?? now.getTime(), now.getTime() - 365 * 24 * 3600 * 1000));
  const timeline = txs.length ? portfolioTimeline(txs, table, from, now) : [];
  const flows = new Map<string, { deposits: Decimal; withdrawals: Decimal }>();
  for (const t of txs) {
    if (t.type !== "FIAT_DEPOSIT" && t.type !== "FIAT_WITHDRAWAL") continue;
    const key = t.timestamp.toISOString().slice(0, 7);
    const cur = flows.get(key) ?? { deposits: ZERO, withdrawals: ZERO };
    const amt = t.legs.find((l) => l.role !== "FEE")?.amount ?? ZERO;
    if (t.type === "FIAT_DEPOSIT") cur.deposits = cur.deposits.plus(amt); else cur.withdrawals = cur.withdrawals.plus(amt);
    flows.set(key, cur);
  }
  return {
    stats,
    holdings: valued.items.filter((h) => h.qty.abs().gt("1e-9")).map((h) => ({ asset: h.asset, qty: h.qty.toString(), priceEur: h.priceEur?.toString() ?? null, valueEur: h.valueEur.toFixed(2), share: valued.total.isZero() ? 0 : h.valueEur.div(valued.total).toNumber() })),
    totalValueEur: valued.total.toFixed(2),
    missingPrices: valued.missing,
    timeline: timeline.map((p) => ({ date: p.date.toISOString().slice(0, 10), value: Number(p.valueEur.toFixed(2)) })),
    monthlyFlows: [...flows.entries()].sort().slice(-12).map(([month, f]) => ({ month, deposits: Number(f.deposits.toFixed(2)), withdrawals: Number(f.withdrawals.toFixed(2)) })),
    pricedAt: now.toISOString(),
  };
}
