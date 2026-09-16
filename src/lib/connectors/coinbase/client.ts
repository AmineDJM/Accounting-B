import { createPrivateKey, createSign, randomBytes, sign as signOneShot, type KeyObject } from "node:crypto";

/**
 * Minimal Coinbase client for the Advanced Trade (v3) and account (v2) APIs.
 *
 * Coinbase authenticates a CDP key with a short-lived JWT rather than a request
 * signature: the token names the exact method and path it may be used for, and
 * lives two minutes. Keys come in two shapes and both are accepted — an EC
 * private key in PEM, signed ES256, and the newer Ed25519 secret in base64,
 * signed EdDSA.
 *
 * Only read endpoints are called: create the key with "View" permission and
 * nothing else.
 */
export interface CoinbaseCredentials {
  /** organizations/{org}/apiKeys/{key}, exactly as Coinbase prints it. */
  keyName: string;
  /** PEM (EC) or base64 (Ed25519), as downloaded. */
  privateKey: string;
}

export interface CoinbaseClientOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  minIntervalMs?: number;
  maxRetries?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

export class CoinbaseApiError extends Error {
  constructor(message: string, readonly status = 0, readonly path = "") {
    super(message);
    this.name = "CoinbaseApiError";
  }
}

const b64url = (b: Buffer | string) => Buffer.from(b).toString("base64url");

/** The two key shapes Coinbase hands out, told apart by their own text. */
export function parsePrivateKey(raw: string): { key: KeyObject; alg: "ES256" | "EdDSA" } {
  const text = raw.trim().replace(/\\n/g, "\n");
  if (text.includes("BEGIN")) {
    try {
      return { key: createPrivateKey(text), alg: "ES256" };
    } catch {
      throw new CoinbaseApiError("Clé privée PEM illisible : collez le bloc complet, lignes BEGIN et END comprises.");
    }
  }
  const bytes = Buffer.from(text, "base64");
  // Coinbase's Ed25519 secret is the 32-byte seed followed by the public key.
  if (bytes.length === 64 || bytes.length === 32) {
    const seed = bytes.subarray(0, 32);
    try {
      const key = createPrivateKey({
        key: { kty: "OKP", crv: "Ed25519", d: seed.toString("base64url"), x: (bytes.length === 64 ? bytes.subarray(32) : Buffer.alloc(32)).toString("base64url") },
        format: "jwk",
      });
      return { key, alg: "EdDSA" };
    } catch {
      throw new CoinbaseApiError("Clé Ed25519 refusée : recopiez la valeur telle que Coinbase l'affiche.");
    }
  }
  throw new CoinbaseApiError("Format de clé privée non reconnu : attendu un bloc PEM (EC) ou une clé Ed25519 en base64.");
}

/** The request-scoped token Coinbase expects in the Authorization header. */
export function buildJwt(creds: CoinbaseCredentials, method: string, host: string, path: string, nowSeconds: number, nonce = randomBytes(16).toString("hex")): string {
  const { key, alg } = parsePrivateKey(creds.privateKey);
  const header = { alg, kid: creds.keyName, typ: "JWT", nonce };
  const payload = {
    iss: "cdp",
    sub: creds.keyName,
    nbf: nowSeconds,
    exp: nowSeconds + 120,
    uri: `${method} ${host}${path}`,
  };
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const signature =
    alg === "EdDSA"
      ? signOneShot(null, Buffer.from(signingInput), key)
      : createSign("SHA256").update(signingInput).sign({ key, dsaEncoding: "ieee-p1363" });
  return `${signingInput}.${b64url(signature)}`;
}

export class CoinbaseClient {
  private readonly baseUrl: string;
  private readonly host: string;
  private readonly fetchImpl: typeof fetch;
  private readonly minInterval: number;
  private readonly maxRetries: number;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private lastRequestAt = 0;
  requestCount = 0;

  constructor(private readonly creds: CoinbaseCredentials, opts: CoinbaseClientOptions = {}) {
    this.baseUrl = (opts.baseUrl ?? process.env.COINBASE_API_BASE ?? "https://api.coinbase.com").replace(/\/$/, "");
    this.host = new URL(this.baseUrl).host;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.minInterval = opts.minIntervalMs ?? 150;
    this.maxRetries = opts.maxRetries ?? 4;
    this.now = opts.now ?? (() => Date.now());
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  async get<T>(path: string, params: Record<string, string | number | undefined> = {}, attempt = 0): Promise<T> {
    const search = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") search.set(k, String(v));
    const query = search.toString();
    const wait = this.lastRequestAt + this.minInterval - this.now();
    if (wait > 0) await this.sleep(wait);
    // The token covers the path only: the query string is deliberately left out.
    const token = buildJwt(this.creds, "GET", this.host, path, Math.floor(this.now() / 1000));
    this.lastRequestAt = this.now();
    this.requestCount++;
    const res = await this.fetchImpl(`${this.baseUrl}${path}${query ? `?${query}` : ""}`, {
      method: "GET",
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
    });
    const text = await res.text();
    let body: unknown;
    try { body = text ? JSON.parse(text) : undefined; } catch { body = text; }

    if (res.status === 429) {
      if (attempt >= this.maxRetries) throw new CoinbaseApiError("Limite de requêtes Coinbase atteinte.", 429, path);
      await this.sleep(2000 * 2 ** attempt);
      return this.get<T>(path, params, attempt + 1);
    }
    if (res.status >= 500 && attempt < this.maxRetries) {
      await this.sleep(1000 * 2 ** attempt);
      return this.get<T>(path, params, attempt + 1);
    }
    if (!res.ok) {
      const b = body as { message?: string; error_description?: string; errors?: { message?: string }[] } | undefined;
      const msg = b?.message ?? b?.error_description ?? b?.errors?.[0]?.message ?? text ?? res.statusText;
      throw new CoinbaseApiError(translate(res.status, String(msg)), res.status, path);
    }
    return body as T;
  }
}

function translate(status: number, msg: string): string {
  if (status === 401) return "Clé Coinbase refusée : vérifiez le nom de la clé (organizations/…/apiKeys/…) et la clé privée.";
  if (status === 403) return "Permissions insuffisantes : la clé doit avoir le droit « View ».";
  if (status === 404) return "Ressource Coinbase introuvable (compte ou point d'accès).";
  return msg || `Erreur Coinbase (HTTP ${status}).`;
}
