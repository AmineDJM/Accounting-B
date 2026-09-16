import { createHmac } from "node:crypto";

/**
 * Minimal, dependency-free Binance REST client (spot + SAPI) with request
 * signing, clock-drift correction, weight-aware throttling and retries.
 *
 * Only read-only endpoints are used: create the API key with "Enable Reading"
 * only, no trading or withdrawal permission, and restrict it to the server IP.
 */
export interface BinanceCredentials { apiKey: string; apiSecret: string }

export interface BinanceClientOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  recvWindow?: number;
  /** minimum delay between two requests (ms) */
  minIntervalMs?: number;
  maxRetries?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  onRequest?: (info: { path: string; weight: number; usedWeight: number }) => void;
}

export class BinanceApiError extends Error {
  constructor(public status: number, public code: number | undefined, message: string, public path: string) {
    super(message);
    this.name = "BinanceApiError";
  }
}

export type Params = Record<string, string | number | boolean | undefined>;

export class BinanceClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly recvWindow: number;
  private readonly minInterval: number;
  private readonly maxRetries: number;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private timeOffset = 0;
  private lastRequestAt = 0;
  usedWeight = 0;
  requestCount = 0;

  constructor(private readonly creds: BinanceCredentials | null, private readonly opts: BinanceClientOptions = {}) {
    this.baseUrl = (opts.baseUrl ?? process.env.BINANCE_API_BASE ?? "https://api.binance.com").replace(/\/$/, "");
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.recvWindow = opts.recvWindow ?? 10000;
    this.minInterval = opts.minIntervalMs ?? 120;
    this.maxRetries = opts.maxRetries ?? 4;
    this.now = opts.now ?? (() => Date.now());
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  static sign(secret: string, query: string): string {
    return createHmac("sha256", secret).update(query).digest("hex");
  }

  static buildQuery(params: Params): string {
    return Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== null && v !== "")
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join("&");
  }

  async syncTime(): Promise<void> {
    const res = await this.public<{ serverTime: number }>("/api/v3/time");
    this.timeOffset = res.serverTime - this.now();
  }

  async public<T>(path: string, params: Params = {}): Promise<T> {
    return this.request<T>(path, params, false);
  }

  async signed<T>(path: string, params: Params = {}): Promise<T> {
    if (!this.creds) throw new Error("Clé API requise pour cet appel");
    return this.request<T>(path, params, true);
  }

  private async request<T>(path: string, params: Params, signed: boolean, attempt = 0): Promise<T> {
    const wait = this.lastRequestAt + this.minInterval - this.now();
    if (wait > 0) await this.sleep(wait);
    let query = BinanceClient.buildQuery(params);
    const headers: Record<string, string> = { Accept: "application/json" };
    if (signed && this.creds) {
      const ts = this.now() + this.timeOffset;
      query = `${query}${query ? "&" : ""}timestamp=${ts}&recvWindow=${this.recvWindow}`;
      query = `${query}&signature=${BinanceClient.sign(this.creds.apiSecret, query)}`;
      headers["X-MBX-APIKEY"] = this.creds.apiKey;
    } else if (this.creds) {
      headers["X-MBX-APIKEY"] = this.creds.apiKey; // some public SAPI endpoints still want the key
    }
    const url = `${this.baseUrl}${path}${query ? `?${query}` : ""}`;
    this.lastRequestAt = this.now();
    this.requestCount++;
    const res = await this.fetchImpl(url, { headers, method: "GET" });
    const used = Number(res.headers.get("x-mbx-used-weight-1m") ?? res.headers.get("x-sapi-used-ip-weight-1m") ?? 0);
    if (used) this.usedWeight = used;
    this.opts.onRequest?.({ path, weight: 0, usedWeight: this.usedWeight });
    const text = await res.text();
    let body: unknown = undefined;
    try { body = text ? JSON.parse(text) : undefined; } catch { body = text; }

    if (res.status === 429 || res.status === 418) {
      const retryAfter = Number(res.headers.get("retry-after") ?? 5);
      if (attempt >= this.maxRetries) throw new BinanceApiError(res.status, undefined, `Limite de requêtes Binance atteinte (${res.status})`, path);
      await this.sleep(Math.max(1000, retryAfter * 1000));
      return this.request<T>(path, params, signed, attempt + 1);
    }
    if (res.status === 451) throw new BinanceApiError(451, undefined, "Binance refuse la connexion depuis cette région (HTTP 451). Hébergez le serveur dans une région autorisée (UE).", path);
    if (!res.ok) {
      const b = body as { code?: number; msg?: string } | undefined;
      const code = typeof b === "object" && b ? b.code : undefined;
      const msg = typeof b === "object" && b?.msg ? b.msg : text || res.statusText;
      if (code === -1021 && attempt < this.maxRetries) { await this.syncTime(); return this.request<T>(path, params, signed, attempt + 1); }
      if (res.status >= 500 && attempt < this.maxRetries) { await this.sleep(1000 * 2 ** attempt); return this.request<T>(path, params, signed, attempt + 1); }
      throw new BinanceApiError(res.status, code, translate(code, msg), path);
    }
    const b = body as { code?: number; msg?: string; success?: boolean } | undefined;
    if (typeof b === "object" && b && typeof b.code === "number" && b.code !== 0 && b.code !== 200 && !("data" in b)) throw new BinanceApiError(200, b.code, translate(b.code, b.msg ?? "Erreur Binance"), path);
    return body as T;
  }
}

function translate(code: number | undefined, msg: string): string {
  switch (code) {
    case -2014: return "Clé API invalide (format).";
    case -2015: return "Clé API invalide, permissions insuffisantes ou adresse IP non autorisée.";
    case -1022: return "Signature invalide : vérifiez la clé secrète.";
    case -1021: return "Horloge du serveur désynchronisée de Binance.";
    case -1003: return "Trop de requêtes : limite de poids dépassée.";
    default: return msg;
  }
}
