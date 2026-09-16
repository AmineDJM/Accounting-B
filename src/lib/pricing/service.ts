import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { D } from "@/lib/engine/money";
import { isFiat, FIAT_WRAPPERS, type CanonicalTx, type PriceQuote } from "@/lib/engine/model";
import { createPriceTable, type PriceTable } from "@/lib/engine/valuation";
import type { Db } from "@/lib/db";
import { priceCoverage, prices as pricesTable } from "@/lib/db/schema";
import { BinanceKlinesProvider, CoinGeckoProvider, EcbFxProvider, type PriceProvider } from "./providers";

const DAY = 24 * 60 * 60 * 1000;
const dayKey = (d: Date) => d.toISOString().slice(0, 10);

export interface PricingNeed { asset: string; at: Date }

export function defaultProviders(): PriceProvider[] {
  const list: PriceProvider[] = [new BinanceKlinesProvider(), new EcbFxProvider()];
  if (process.env.COINGECKO_ENABLED !== "false") list.push(new CoinGeckoProvider({ apiKey: process.env.COINGECKO_API_KEY }));
  return list;
}

/** Every (asset, instant) the engine will need to value a set of transactions, plus closing dates. */
export function pricingNeeds(txs: CanonicalTx[], extraDates: Date[] = [], extraAssets: string[] = []): PricingNeed[] {
  const needs: PricingNeed[] = [];
  const assets = new Set<string>(extraAssets.map((a) => a.toUpperCase()));
  for (const tx of txs) {
    for (const l of tx.legs) {
      const a = l.asset.toUpperCase();
      if (a === "EUR") continue;
      assets.add(a);
      needs.push({ asset: a, at: tx.timestamp });
    }
  }
  for (const d of extraDates) for (const a of assets) needs.push({ asset: a, at: d });
  return needs;
}

/**
 * Ensures the price cache covers every needed (asset, day), fetching from the
 * providers only what is missing, then returns a PriceTable for the engine.
 */
export class PricingService {
  constructor(private readonly db: Db, private readonly providers: PriceProvider[] = defaultProviders(), private readonly log: (m: string) => void = () => {}) {}

  async ensure(needs: PricingNeed[], opts: { granularity?: "15m" | "1h" } = {}): Promise<{ fetched: number; missing: { asset: string; day: string }[] }> {
    const gran = opts.granularity ?? "15m";
    const byAsset = new Map<string, Set<string>>();
    for (const n of needs) {
      const a = FIAT_WRAPPERS[n.asset] ?? n.asset;
      if (a === "EUR") continue;
      byAsset.set(a, (byAsset.get(a) ?? new Set()).add(dayKey(n.at)));
    }
    let fetched = 0;
    const missing: { asset: string; day: string }[] = [];
    for (const [asset, days] of byAsset) {
      const covered = await this.db.select().from(priceCoverage).where(and(eq(priceCoverage.asset, asset), inArray(priceCoverage.day, [...days])));
      const coveredDays = new Set(covered.map((c) => c.day));
      const toFetch = [...days].filter((d) => !coveredDays.has(d)).sort();
      if (toFetch.length === 0) continue;
      const provider = this.providers.find((p) => p.supports(asset));
      if (!provider) { for (const d of toFetch) missing.push({ asset, day: d }); continue; }
      // group consecutive days into ranges (max 30 days per request) to limit calls
      const ranges: [string, string][] = [];
      let start = toFetch[0], prev = toFetch[0];
      for (const d of toFetch.slice(1)) {
        const gap = (Date.parse(d) - Date.parse(prev)) / DAY;
        if (gap > 3 || (Date.parse(d) - Date.parse(start)) / DAY > 30) { ranges.push([start, prev]); start = d; }
        prev = d;
      }
      ranges.push([start, prev]);
      for (const [s, e] of ranges) {
        const from = new Date(`${s}T00:00:00Z`), to = new Date(Date.parse(`${e}T00:00:00Z`) + DAY - 1);
        let quotes: PriceQuote[] = [];
        let used = provider.name;
        try {
          quotes = await provider.fetchRange(asset, from, to, isFiat(asset) ? "1d" : gran);
          if (quotes.length === 0) {
            const fallback = this.providers.find((p) => p !== provider && p.supports(asset));
            if (fallback) { quotes = await fallback.fetchRange(asset, from, to, "1d"); used = fallback.name; }
          }
        } catch (err) {
          this.log(`Cours ${asset} ${s}→${e} (${provider.name}) : ${(err as Error).message}`);
          const fallback = this.providers.find((p) => p !== provider && p.supports(asset));
          if (fallback) {
            try { quotes = await fallback.fetchRange(asset, from, to, "1d"); used = fallback.name; } catch (e2) { this.log(`Cours ${asset} (${fallback.name}) : ${(e2 as Error).message}`); }
          }
        }
        if (quotes.length) {
          for (let i = 0; i < quotes.length; i += 500) {
            await this.db.insert(pricesTable).values(quotes.slice(i, i + 500).map((q) => ({ asset, ts: q.at, priceEur: q.priceEur.toFixed(12), source: q.source, granularity: isFiat(asset) ? "1d" : gran }))).onConflictDoNothing();
          }
          fetched += quotes.length;
        }
        const gotDays = new Set(quotes.map((q) => dayKey(q.at)));
        for (const d of daysBetween(s, e)) {
          if (!days.has(d)) continue;
          const ok = gotDays.has(d) || (isFiat(asset) && quotes.length > 0);
          if (!ok) missing.push({ asset, day: d });
          await this.db.insert(priceCoverage).values({ asset, day: d, status: ok ? "OK" : "MISSING", source: used }).onConflictDoUpdate({ target: [priceCoverage.asset, priceCoverage.day], set: { status: ok ? "OK" : "MISSING", source: used, updatedAt: new Date() } });
        }
      }
    }
    return { fetched, missing };
  }

  /** Loads cached quotes for the given assets and period into an in-memory table. */
  async table(assets: string[], from: Date, to: Date): Promise<PriceTable> {
    const list = [...new Set(assets.map((a) => FIAT_WRAPPERS[a.toUpperCase()] ?? a.toUpperCase()).filter((a) => a !== "EUR"))];
    if (list.length === 0) return createPriceTable([]);
    const rows = await this.db.select().from(pricesTable).where(and(inArray(pricesTable.asset, list), gte(pricesTable.ts, new Date(from.getTime() - 10 * DAY)), lte(pricesTable.ts, new Date(to.getTime() + DAY))));
    return createPriceTable(rows.map((r) => ({ asset: r.asset, at: r.ts, priceEur: D(r.priceEur), source: r.source })), { toleranceCrypto: 36 * 60 * 60 * 1000 });
  }
}

function daysBetween(s: string, e: string): string[] {
  const out: string[] = [];
  for (let t = Date.parse(`${s}T00:00:00Z`); t <= Date.parse(`${e}T00:00:00Z`); t += DAY) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}
