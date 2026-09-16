import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { auditLog, exchangeAccounts, walletAddresses, type ExchangeKind } from "@/lib/db/schema";
import { decryptSecret, encryptSecret, secretHint } from "@/lib/security/crypto";
import { requireEntity } from "./entities";

export type ExchangeAccount = typeof exchangeAccounts.$inferSelect;
export type WalletAddress = typeof walletAddresses.$inferSelect;

/** Public view of an account: never exposes encrypted secrets. */
export type ExchangeAccountView = Omit<ExchangeAccount, "apiKeyEnc" | "apiSecretEnc"> & { hasApiKey: boolean };

const toView = (a: ExchangeAccount): ExchangeAccountView => {
  const { apiKeyEnc, apiSecretEnc, ...rest } = a;
  return { ...rest, hasApiKey: Boolean(apiKeyEnc && apiSecretEnc) };
};

export async function listAccounts(userId: string, entityId: string): Promise<ExchangeAccountView[]> {
  await requireEntity(userId, entityId);
  const db = await getDb();
  const rows = await db.select().from(exchangeAccounts).where(eq(exchangeAccounts.entityId, entityId)).orderBy(asc(exchangeAccounts.index));
  return rows.map(toView);
}

export async function getAccount(userId: string, entityId: string, accountId: string): Promise<ExchangeAccountView> {
  await requireEntity(userId, entityId);
  const db = await getDb();
  const [row] = await db.select().from(exchangeAccounts).where(and(eq(exchangeAccounts.id, accountId), eq(exchangeAccounts.entityId, entityId))).limit(1);
  if (!row) throw new Error("Compte introuvable");
  return toView(row);
}

export async function createAccount(userId: string, entityId: string, input: { exchange: ExchangeKind; label: string; apiKey?: string; apiSecret?: string }): Promise<ExchangeAccountView> {
  await requireEntity(userId, entityId, "ADMIN");
  const db = await getDb();
  const [{ max }] = await db.select({ max: sql<number>`coalesce(max(${exchangeAccounts.index}), 0)` }).from(exchangeAccounts).where(eq(exchangeAccounts.entityId, entityId));
  const index = Number(max) + 1;
  const hasKeys = Boolean(input.apiKey && input.apiSecret);
  const [row] = await db
    .insert(exchangeAccounts)
    .values({
      entityId,
      exchange: input.exchange,
      label: input.label.trim(),
      index,
      journalCode: `CR${index}`,
      apiKeyEnc: hasKeys ? encryptSecret(input.apiKey!.trim()) : null,
      apiSecretEnc: hasKeys ? encryptSecret(input.apiSecret!.trim()) : null,
      apiKeyHint: hasKeys ? secretHint(input.apiKey!.trim()) : null,
    })
    .returning();
  await db.insert(auditLog).values({ entityId, userId, action: "account.create", details: { exchange: input.exchange, label: input.label, withKeys: hasKeys } });
  return toView(row);
}

export async function updateAccountKeys(userId: string, entityId: string, accountId: string, apiKey: string, apiSecret: string): Promise<void> {
  await requireEntity(userId, entityId, "ADMIN");
  const db = await getDb();
  await db.update(exchangeAccounts).set({ apiKeyEnc: encryptSecret(apiKey.trim()), apiSecretEnc: encryptSecret(apiSecret.trim()), apiKeyHint: secretHint(apiKey.trim()), status: "ACTIVE", statusMessage: null }).where(and(eq(exchangeAccounts.id, accountId), eq(exchangeAccounts.entityId, entityId)));
  await db.insert(auditLog).values({ entityId, userId, action: "account.keys.update", details: { accountId } });
}

export async function updateAccount(userId: string, entityId: string, accountId: string, patch: { label?: string; journalCode?: string; status?: "ACTIVE" | "DISABLED" }): Promise<void> {
  await requireEntity(userId, entityId, "ADMIN");
  const db = await getDb();
  await db.update(exchangeAccounts).set(patch).where(and(eq(exchangeAccounts.id, accountId), eq(exchangeAccounts.entityId, entityId)));
}

export async function deleteAccount(userId: string, entityId: string, accountId: string): Promise<void> {
  await requireEntity(userId, entityId, "ADMIN");
  const db = await getDb();
  await db.delete(exchangeAccounts).where(and(eq(exchangeAccounts.id, accountId), eq(exchangeAccounts.entityId, entityId)));
  await db.insert(auditLog).values({ entityId, userId, action: "account.delete", details: { accountId } });
}

/** Server-side only: decrypts the credentials of an account for a sync job. */
export async function loadCredentials(entityId: string, accountId: string): Promise<{ apiKey: string; apiSecret: string } | null> {
  const db = await getDb();
  const [row] = await db.select().from(exchangeAccounts).where(and(eq(exchangeAccounts.id, accountId), eq(exchangeAccounts.entityId, entityId))).limit(1);
  if (!row?.apiKeyEnc || !row.apiSecretEnc) return null;
  return { apiKey: decryptSecret(row.apiKeyEnc), apiSecret: decryptSecret(row.apiSecretEnc) };
}

export async function setAccountStatus(accountId: string, status: "ACTIVE" | "ERROR" | "DISABLED", message?: string | null, lastSyncAt?: Date): Promise<void> {
  const db = await getDb();
  await db.update(exchangeAccounts).set({ status, statusMessage: message ?? null, ...(lastSyncAt ? { lastSyncAt } : {}) }).where(eq(exchangeAccounts.id, accountId));
}

/* ------------------------------------------------------- Wallet addresses */
export async function listWallets(userId: string, entityId: string): Promise<WalletAddress[]> {
  await requireEntity(userId, entityId);
  const db = await getDb();
  return db.select().from(walletAddresses).where(eq(walletAddresses.entityId, entityId)).orderBy(asc(walletAddresses.createdAt));
}

export async function addWallet(userId: string, entityId: string, input: { address: string; network?: string; label?: string; kind?: "SELF" | "CUSTOMER" | "SUPPLIER" | "OTHER" }): Promise<WalletAddress> {
  await requireEntity(userId, entityId, "ACCOUNTANT");
  const db = await getDb();
  const [row] = await db.insert(walletAddresses).values({ entityId, address: input.address.trim(), network: input.network?.trim() || null, label: input.label?.trim() || null, kind: input.kind ?? "SELF" }).returning();
  return row;
}

export async function removeWallet(userId: string, entityId: string, walletId: string): Promise<void> {
  await requireEntity(userId, entityId, "ACCOUNTANT");
  const db = await getDb();
  await db.delete(walletAddresses).where(and(eq(walletAddresses.id, walletId), eq(walletAddresses.entityId, entityId)));
}

export async function selfAddressSet(entityId: string): Promise<Set<string>> {
  const db = await getDb();
  const rows = await db.select().from(walletAddresses).where(and(eq(walletAddresses.entityId, entityId), eq(walletAddresses.kind, "SELF")));
  return new Set(rows.map((r) => r.address.toLowerCase()));
}
