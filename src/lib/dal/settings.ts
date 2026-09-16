import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { auditLog, platformSettings } from "@/lib/db/schema";
import { decryptSecret, encryptSecret, secretHint } from "@/lib/security/crypto";

/**
 * Settings that belong to the deployment rather than to a file.
 *
 * A fresh install has nothing typed into it: no Google client, no pricing key.
 * An administrator fills them from the console and they take effect on the next
 * request — the alternative, an environment variable, costs a redeployment and
 * a trip to the hosting dashboard every time something changes.
 *
 * The environment still wins when it is set, so an operator who prefers to
 * manage secrets there keeps that control.
 */
export type SettingKey = "google.clientId" | "google.clientSecret" | "coingecko.apiKey";

const SECRET_KEYS = new Set<SettingKey>(["google.clientSecret", "coingecko.apiKey"]);

interface Row { key: string; value: string | null; secretEnc: string | null; hint: string | null; updatedAt: Date }

/**
 * A short cache, because Auth.js reads the configuration on every request.
 * One instance serves the whole deployment, so writes clear it directly; the
 * TTL is only there for the case where they do not.
 */
let cache: { at: number; rows: Map<string, Row> } | null = null;
const TTL_MS = 30_000;

async function load(): Promise<Map<string, Row>> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.rows;
  const db = await getDb();
  const rows = (await db.select().from(platformSettings)) as Row[];
  const map = new Map(rows.map((r) => [r.key, r]));
  cache = { at: Date.now(), rows: map };
  return map;
}

export function invalidateSettings(): void {
  cache = null;
}

/** The decrypted value, or null. Never send the result to the browser. */
export async function getSetting(key: SettingKey): Promise<string | null> {
  const row = (await load()).get(key);
  if (!row) return null;
  if (row.secretEnc) {
    try {
      return decryptSecret(row.secretEnc);
    } catch {
      // A wrong APP_ENCRYPTION_KEY must not take the sign-in page down with it.
      return null;
    }
  }
  return row.value;
}

export async function setSetting(key: SettingKey, raw: string | null, adminId: string | null): Promise<void> {
  const db = await getDb();
  const trimmed = (raw ?? "").trim();
  if (!trimmed) {
    await db.delete(platformSettings).where(eq(platformSettings.key, key));
  } else {
    const secret = SECRET_KEYS.has(key);
    const row = {
      key,
      value: secret ? null : trimmed,
      secretEnc: secret ? encryptSecret(trimmed) : null,
      hint: secret ? secretHint(trimmed) : null,
      updatedBy: adminId,
      updatedAt: new Date(),
    };
    await db.insert(platformSettings).values(row).onConflictDoUpdate({ target: platformSettings.key, set: row });
  }
  await db.insert(auditLog).values({ userId: adminId, action: "platform.setting", details: { key, cleared: !trimmed } });
  invalidateSettings();
}

export interface CredentialSource {
  clientId: string | null;
  clientSecret: string | null;
  /** Where the value came from, which the console shows so nobody hunts for it. */
  source: "ENV" | "CONSOLE" | "NONE";
}

/** The Google client in force: the environment first, then the console. */
export async function googleCredentials(): Promise<CredentialSource> {
  const envId = process.env.AUTH_GOOGLE_ID ?? process.env.GOOGLE_CLIENT_ID;
  const envSecret = process.env.AUTH_GOOGLE_SECRET ?? process.env.GOOGLE_CLIENT_SECRET;
  if (envId && envSecret) return { clientId: envId, clientSecret: envSecret, source: "ENV" };
  const [clientId, clientSecret] = await Promise.all([getSetting("google.clientId"), getSetting("google.clientSecret")]);
  if (clientId && clientSecret) return { clientId, clientSecret, source: "CONSOLE" };
  return { clientId: null, clientSecret: null, source: "NONE" };
}

/** The pricing fallback key, from the environment or the console. */
export async function coingeckoKey(): Promise<string | null> {
  return process.env.COINGECKO_API_KEY ?? (await getSetting("coingecko.apiKey"));
}

/** What the console may display: presence and a hint, never a secret. */
export async function settingsOverview(): Promise<{ key: SettingKey; set: boolean; hint: string | null; updatedAt: Date | null }[]> {
  const rows = await load();
  const keys: SettingKey[] = ["google.clientId", "google.clientSecret", "coingecko.apiKey"];
  return keys.map((key) => {
    const row = rows.get(key);
    return {
      key,
      set: Boolean(row?.value ?? row?.secretEnc),
      hint: row?.hint ?? (row?.value ? `…${row.value.slice(-6)}` : null),
      updatedAt: row?.updatedAt ?? null,
    };
  });
}
