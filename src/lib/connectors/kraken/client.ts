import { createHash, createHmac } from "node:crypto";
import type { KrakenEnvelope } from "./types";

/**
 * Minimal Kraken REST client.
 *
 * Kraken signs a private call with HMAC-SHA512 over the path and the SHA-256 of
 * the nonce followed by the body, keyed with the base64-decoded secret. It
 * answers HTTP 200 even when it refuses, putting the reason in `error`, so the
 * status code alone proves nothing and every answer is inspected.
 *
 * Only read endpoints are called: create the key with "Query funds", "Query
 * open/closed orders & trades" and "Query ledger entries", nothing else.
 */
export interface KrakenCredentials { apiKey: string; apiSecret: string }

export interface KrakenClientOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  /** Kraken counts private calls; two seconds apart keeps a tier-1 key safe. */
  minIntervalMs?: number;
  maxRetries?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

export class KrakenApiError extends Error {
  constructor(message: string, readonly codes: string[] = [], readonly path = "") {
    super(message);
    this.name = "KrakenApiError";
  }
}

export class KrakenClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly minInterval: number;
  private readonly maxRetries: number;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private lastRequestAt = 0;
  private nonceFloor = 0;
  requestCount = 0;

  constructor(private readonly creds: KrakenCredentials | null, opts: KrakenClientOptions = {}) {
    this.baseUrl = (opts.baseUrl ?? process.env.KRAKEN_API_BASE ?? "https://api.kraken.com").replace(/\/$/, "");
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.minInterval = opts.minIntervalMs ?? 2000;
    this.maxRetries = opts.maxRetries ?? 4;
    this.now = opts.now ?? (() => Date.now());
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  /** The signature Kraken expects, exposed so a test can pin it. */
  static sign(secret: string, path: string, nonce: string, body: string): string {
    const hashed = createHash("sha256").update(nonce + body).digest();
    return createHmac("sha512", Buffer.from(secret, "base64"))
      .update(Buffer.concat([Buffer.from(path, "utf8"), hashed]))
      .digest("base64");
  }

  /**
   * A nonce that never repeats and never goes backwards, even when two calls
   * land in the same millisecond — Kraken rejects the whole key for a day if
   * one arrives out of order.
   */
  private nextNonce(): string {
    const candidate = this.now() * 1000;
    this.nonceFloor = candidate > this.nonceFloor ? candidate : this.nonceFloor + 1;
    return String(this.nonceFloor);
  }

  async public<T>(method: string, params: Record<string, string> = {}): Promise<T> {
    const query = new URLSearchParams(params).toString();
    return this.call<T>(`/0/public/${method}${query ? `?${query}` : ""}`, null);
  }

  async private<T>(method: string, params: Record<string, string | number | undefined> = {}): Promise<T> {
    if (!this.creds) throw new KrakenApiError("Clé API Kraken requise pour cet appel.");
    const path = `/0/private/${method}`;
    const body = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") body.set(k, String(v));
    return this.call<T>(path, body);
  }

  private async call<T>(path: string, body: URLSearchParams | null, attempt = 0): Promise<T> {
    const wait = this.lastRequestAt + this.minInterval - this.now();
    if (wait > 0) await this.sleep(wait);
    const headers: Record<string, string> = { Accept: "application/json" };
    let payload: string | undefined;
    if (body && this.creds) {
      const nonce = this.nextNonce();
      body.set("nonce", nonce);
      payload = body.toString();
      headers["Content-Type"] = "application/x-www-form-urlencoded";
      headers["API-Key"] = this.creds.apiKey;
      headers["API-Sign"] = KrakenClient.sign(this.creds.apiSecret, path, nonce, payload);
    }
    this.lastRequestAt = this.now();
    this.requestCount++;
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, { method: payload ? "POST" : "GET", headers, body: payload });
    const text = await res.text();
    let parsed: KrakenEnvelope<T> | undefined;
    try {
      parsed = text ? (JSON.parse(text) as KrakenEnvelope<T>) : undefined;
    } catch {
      throw new KrakenApiError(`Réponse Kraken illisible (HTTP ${res.status}).`, [], path);
    }
    if (res.status === 429 || parsed?.error?.some((e) => e.includes("Rate limit"))) {
      if (attempt >= this.maxRetries) throw new KrakenApiError("Limite de requêtes Kraken atteinte.", parsed?.error ?? [], path);
      await this.sleep(3000 * 2 ** attempt);
      return this.call<T>(path, body, attempt + 1);
    }
    if (res.status >= 500 && attempt < this.maxRetries) {
      await this.sleep(1000 * 2 ** attempt);
      return this.call<T>(path, body, attempt + 1);
    }
    if (!res.ok && !parsed) throw new KrakenApiError(`Kraken a refusé la requête (HTTP ${res.status}).`, [], path);
    if (parsed?.error?.length) throw new KrakenApiError(translate(parsed.error), parsed.error, path);
    return (parsed?.result ?? ({} as T)) as T;
  }
}

function translate(codes: string[]): string {
  const first = codes[0] ?? "";
  if (first.includes("Invalid key")) return "Clé API invalide.";
  if (first.includes("Invalid signature")) return "Signature invalide : vérifiez la clé secrète (elle se colle telle quelle, en base64).";
  if (first.includes("Invalid nonce")) return "Nonce refusé : une autre application utilise la même clé. Créez-en une dédiée.";
  if (first.includes("Permission denied")) return "Permissions insuffisantes : la clé doit pouvoir consulter les fonds, les ordres et le registre.";
  if (first.includes("Temporary lockout")) return "Kraken a temporairement bloqué la clé après trop d'échecs. Attendez quinze minutes.";
  return codes.join(" · ") || "Erreur Kraken.";
}
