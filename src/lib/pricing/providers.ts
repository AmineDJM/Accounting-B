import { D, ONE, type Decimal } from "@/lib/engine/money";
import { isFiat, FIAT_WRAPPERS } from "@/lib/engine/model";
import type { PriceQuote } from "@/lib/engine/model";

/**
 * Price providers. Each returns EUR prices for one asset over a time range.
 *  - BinanceKlinesProvider : public candles (no API key). Direct EUR pair when it
 *    exists, otherwise via USDT (X/USDT × 1/EURUSDT) or BTC (X/BTC × BTC/EUR).
 *  - EcbFxProvider         : official ECB euro reference rates (daily), the same
 *    rates published by the Banque de France, forward-filled on week-ends.
 *  - CoinGeckoProvider     : daily fallback when Binance is unreachable.
 */
export interface PriceProvider {
  readonly name: string;
  supports(asset: string): boolean;
  fetchRange(asset: string, from: Date, to: Date, granularity: "15m" | "1h" | "1d"): Promise<PriceQuote[]>;
}

const DAY = 24 * 60 * 60 * 1000;
const INTERVAL_MS = { "15m": 15 * 60 * 1000, "1h": 60 * 60 * 1000, "1d": DAY } as const;

type FetchLike = typeof fetch;

export class BinanceKlinesProvider implements PriceProvider {
  readonly name = "binance";
  private symbols: Map<string, { base: string; quote: string }> | null = null;
  constructor(private readonly opts: { baseUrl?: string; fetchImpl?: FetchLike; sleep?: (ms: number) => Promise<void> } = {}) {}

  private get fetchImpl() { return this.opts.fetchImpl ?? fetch; }
  private get base() { return (this.opts.baseUrl ?? process.env.BINANCE_API_BASE ?? "https://api.binance.com").replace(/\/$/, ""); }

  supports(asset: string) { return !isFiat(asset) || Boolean(FIAT_WRAPPERS[asset]); }

  async loadSymbols(): Promise<Map<string, { base: string; quote: string }>> {
    if (this.symbols) return this.symbols;
    const res = await this.fetchImpl(`${this.base}/api/v3/exchangeInfo`);
    if (!res.ok) throw new Error(`Binance exchangeInfo HTTP ${res.status}`);
    const json = (await res.json()) as { symbols: { symbol: string; baseAsset: string; quoteAsset: string; status: string }[] };
    this.symbols = new Map(json.symbols.map((s) => [s.symbol, { base: s.baseAsset, quote: s.quoteAsset }]));
    return this.symbols;
  }

  async klines(symbol: string, interval: "15m" | "1h" | "1d", from: number, to: number): Promise<{ openTime: number; close: Decimal }[]> {
    const out: { openTime: number; close: Decimal }[] = [];
    let start = from;
    while (start <= to) {
      const url = `${this.base}/api/v3/klines?symbol=${symbol}&interval=${interval}&startTime=${start}&endTime=${to}&limit=1000`;
      const res = await this.fetchImpl(url);
      if (res.status === 429 || res.status === 418) { await (this.opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms))))(5000); continue; }
      if (res.status === 400) return out; // unknown symbol
      if (!res.ok) throw new Error(`Binance klines ${symbol} HTTP ${res.status}`);
      const rows = (await res.json()) as (number | string)[][];
      if (rows.length === 0) break;
      for (const r of rows) out.push({ openTime: Number(r[0]), close: D(String(r[4])) });
      if (rows.length < 1000) break;
      start = Number(rows[rows.length - 1][0]) + INTERVAL_MS[interval];
    }
    return out;
  }

  async fetchRange(asset: string, from: Date, to: Date, granularity: "15m" | "1h" | "1d"): Promise<PriceQuote[]> {
    const a = asset.toUpperCase();
    const symbols = await this.loadSymbols();
    const f = from.getTime(), t = to.getTime();
    const quoteTs = (openTime: number) => new Date(openTime + INTERVAL_MS[granularity]); // candle close instant
    if (a === "EUR") return [];
    if (symbols.has(`${a}EUR`)) {
      const rows = await this.klines(`${a}EUR`, granularity, f, t);
      return rows.map((r) => ({ asset: a, at: quoteTs(r.openTime), priceEur: r.close, source: `binance:${a}EUR` }));
    }
    // stablecoins & most assets: X/USDT × (1 / EURUSDT)
    const eurUsdt = symbols.has("EURUSDT") ? await this.klines("EURUSDT", granularity, f, t) : [];
    const eurByTime = new Map(eurUsdt.map((r) => [r.openTime, r.close]));
    if (a === "USDT" && eurUsdt.length) return eurUsdt.map((r) => ({ asset: a, at: quoteTs(r.openTime), priceEur: ONE.div(r.close), source: "binance:EURUSDT^-1" }));
    if (symbols.has(`${a}USDT`) && eurUsdt.length) {
      const rows = await this.klines(`${a}USDT`, granularity, f, t);
      return rows.flatMap((r) => { const e = eurByTime.get(r.openTime); return e ? [{ asset: a, at: quoteTs(r.openTime), priceEur: r.close.div(e), source: `binance:${a}USDT/EURUSDT` }] : []; });
    }
    if (symbols.has(`${a}BTC`) && symbols.has("BTCEUR")) {
      const [rows, btc] = await Promise.all([this.klines(`${a}BTC`, granularity, f, t), this.klines("BTCEUR", granularity, f, t)]);
      const btcByTime = new Map(btc.map((r) => [r.openTime, r.close]));
      return rows.flatMap((r) => { const b = btcByTime.get(r.openTime); return b ? [{ asset: a, at: quoteTs(r.openTime), priceEur: r.close.mul(b), source: `binance:${a}BTC*BTCEUR` }] : []; });
    }
    return [];
  }
}

export class EcbFxProvider implements PriceProvider {
  readonly name = "ecb";
  constructor(private readonly opts: { fetchImpl?: FetchLike; baseUrl?: string } = {}) {}
  supports(asset: string) { return isFiat(asset) && asset.toUpperCase() !== "EUR"; }

  async fetchRange(asset: string, from: Date, to: Date): Promise<PriceQuote[]> {
    const cur = asset.toUpperCase();
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    const start = new Date(from.getTime() - 7 * DAY); // keep a few prior days for forward-fill
    const url = `${(this.opts.baseUrl ?? "https://data-api.ecb.europa.eu").replace(/\/$/, "")}/service/data/EXR/D.${cur}.EUR.SP00.A?startPeriod=${fmt(start)}&endPeriod=${fmt(to)}&format=csvdata`;
    const res = await (this.opts.fetchImpl ?? fetch)(url, { headers: { Accept: "text/csv" } });
    if (res.status === 404) return [];
    if (!res.ok) throw new Error(`BCE EXR ${cur} HTTP ${res.status}`);
    const text = await res.text();
    const lines = text.trim().split(/\r?\n/);
    if (lines.length < 2) return [];
    const header = lines[0].split(",");
    const iTime = header.indexOf("TIME_PERIOD"), iVal = header.indexOf("OBS_VALUE");
    const out: PriceQuote[] = [];
    for (const line of lines.slice(1)) {
      const cells = line.split(",");
      const day = cells[iTime], v = cells[iVal];
      if (!day || !v) continue;
      // OBS_VALUE = units of currency per 1 EUR → 1 unit = 1/OBS_VALUE EUR (taux à 16h CET publié pour la journée)
      out.push({ asset: cur, at: new Date(`${day}T00:00:00Z`), priceEur: ONE.div(D(v)), source: "ecb" });
    }
    return out;
  }
}

export class CoinGeckoProvider implements PriceProvider {
  readonly name = "coingecko";
  private ids: Map<string, string> | null = null;
  constructor(private readonly opts: { fetchImpl?: FetchLike; baseUrl?: string; apiKey?: string } = {}) {}
  supports(asset: string) { return !isFiat(asset); }

  private async idFor(asset: string): Promise<string | undefined> {
    if (!this.ids) {
      const res = await (this.opts.fetchImpl ?? fetch)(`${this.opts.baseUrl ?? "https://api.coingecko.com"}/api/v3/coins/list`, { headers: this.opts.apiKey ? { "x-cg-demo-api-key": this.opts.apiKey } : {} });
      if (!res.ok) throw new Error(`CoinGecko HTTP ${res.status}`);
      const list = (await res.json()) as { id: string; symbol: string; name: string }[];
      // prefer the shortest id for a symbol (usually the canonical coin, e.g. "bitcoin" over "bitcoin-cash-sv")
      this.ids = new Map();
      for (const c of list) {
        const sym = c.symbol.toUpperCase();
        const cur = this.ids.get(sym);
        if (!cur || c.id.length < cur.length) this.ids.set(sym, c.id);
      }
      const known: Record<string, string> = { BTC: "bitcoin", ETH: "ethereum", BNB: "binancecoin", USDT: "tether", USDC: "usd-coin", SOL: "solana", XRP: "ripple", ADA: "cardano", DOGE: "dogecoin", DOT: "polkadot", TRX: "tron", MATIC: "matic-network", LTC: "litecoin", AVAX: "avalanche-2", LINK: "chainlink", ATOM: "cosmos", UNI: "uniswap", BUSD: "binance-usd", DAI: "dai" };
      for (const [k, v] of Object.entries(known)) this.ids.set(k, v);
    }
    return this.ids.get(asset.toUpperCase());
  }

  async fetchRange(asset: string, from: Date, to: Date): Promise<PriceQuote[]> {
    const id = await this.idFor(asset);
    if (!id) return [];
    const url = `${this.opts.baseUrl ?? "https://api.coingecko.com"}/api/v3/coins/${id}/market_chart/range?vs_currency=eur&from=${Math.floor(from.getTime() / 1000)}&to=${Math.ceil(to.getTime() / 1000)}`;
    const res = await (this.opts.fetchImpl ?? fetch)(url, { headers: this.opts.apiKey ? { "x-cg-demo-api-key": this.opts.apiKey } : {} });
    if (!res.ok) throw new Error(`CoinGecko ${id} HTTP ${res.status}`);
    const json = (await res.json()) as { prices: [number, number][] };
    return json.prices.map(([ts, p]) => ({ asset: asset.toUpperCase(), at: new Date(ts), priceEur: D(p), source: `coingecko:${id}` }));
  }
}
