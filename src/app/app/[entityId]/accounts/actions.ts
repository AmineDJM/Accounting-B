"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/auth";
import { addWallet, createAccount, deleteAccount, removeWallet, updateAccount, updateAccountKeys } from "@/lib/dal/accounts";
import { categorizeByAddress, deleteAccountTransactions } from "@/lib/dal/transactions";
import { startAccountSync, testCredentials } from "@/lib/services/sync";
import { platformSpec } from "@/lib/connectors/platforms";
import type { ExchangeKind } from "@/lib/db/schema";

export type Result = { ok: true; message?: string; id?: string } | { ok: false; error: string };

const accountSchema = z.object({
  exchange: z.enum(["BINANCE", "KRAKEN", "COINBASE", "GENERIC"]),
  label: z.string().trim().min(1).max(80),
  apiKey: z.string().trim().max(200).optional().or(z.literal("")),
  // Coinbase's private key is a PEM block, so the secret is not a one-liner.
  apiSecret: z.string().trim().max(4000).optional().or(z.literal("")),
});

export async function createAccountAction(entityId: string, input: z.input<typeof accountSchema>): Promise<Result> {
  try {
    const user = await requireUser();
    const d = accountSchema.parse(input);
    if ((d.apiKey && !d.apiSecret) || (!d.apiKey && d.apiSecret)) return { ok: false, error: "Renseignez la clé ET le secret, ou aucun des deux." };
    if (d.apiKey && d.apiSecret) {
      const test = await testCredentials(d.exchange, d.apiKey, d.apiSecret);
      if (!test.ok) return { ok: false, error: `Clé refusée par ${platformSpec(d.exchange).name} : ${test.message}` };
    }
    const acc = await createAccount(user.id, entityId, { exchange: d.exchange, label: d.label, apiKey: d.apiKey || undefined, apiSecret: d.apiSecret || undefined });
    revalidatePath(`/app/${entityId}`, "layout");
    return { ok: true, id: acc.id, message: "Compte ajouté" };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function testCredentialsAction(exchange: ExchangeKind, apiKey: string, apiSecret: string): Promise<Result> {
  await requireUser();
  const r = await testCredentials(exchange, apiKey.trim(), apiSecret.trim());
  return r.ok ? { ok: true, message: r.message } : { ok: false, error: r.message };
}

export async function updateKeysAction(entityId: string, accountId: string, exchange: ExchangeKind, apiKey: string, apiSecret: string): Promise<Result> {
  try {
    const user = await requireUser();
    const test = await testCredentials(exchange, apiKey.trim(), apiSecret.trim());
    if (!test.ok) return { ok: false, error: `Clé refusée : ${test.message}` };
    await updateAccountKeys(user.id, entityId, accountId, apiKey, apiSecret);
    revalidatePath(`/app/${entityId}/accounts`);
    return { ok: true, message: test.message };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function renameAccountAction(entityId: string, accountId: string, label: string, journalCode: string): Promise<Result> {
  try {
    const user = await requireUser();
    await updateAccount(user.id, entityId, accountId, { label: label.trim().slice(0, 80), journalCode: journalCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8) || undefined });
    revalidatePath(`/app/${entityId}/accounts`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function deleteAccountAction(entityId: string, accountId: string): Promise<Result> {
  try {
    const user = await requireUser();
    await deleteAccount(user.id, entityId, accountId);
    revalidatePath(`/app/${entityId}`, "layout");
    return { ok: true, message: "Compte et transactions supprimés" };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function purgeAccountTransactionsAction(entityId: string, accountId: string, source?: string): Promise<Result> {
  try {
    const user = await requireUser();
    const n = await deleteAccountTransactions(user.id, entityId, accountId, source);
    revalidatePath(`/app/${entityId}`, "layout");
    return { ok: true, message: `${n} transaction(s) supprimée(s)` };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function startSyncAction(entityId: string, accountId: string, opts: { fromYear?: number; exhaustive?: boolean }): Promise<Result> {
  try {
    const user = await requireUser();
    const job = await startAccountSync(user.id, entityId, accountId, { from: opts.fromYear ? new Date(Date.UTC(opts.fromYear, 0, 1)) : undefined, exhaustive: opts.exhaustive });
    return { ok: true, id: job.id, message: "Synchronisation lancée" };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function addWalletAction(entityId: string, input: { address: string; network?: string; label?: string; kind?: "SELF" | "CUSTOMER" | "SUPPLIER" | "OTHER" }): Promise<Result> {
  try {
    const user = await requireUser();
    if (!input.address || input.address.trim().length < 8) return { ok: false, error: "Adresse invalide" };
    await addWallet(user.id, entityId, input);
    const kind = input.kind ?? "SELF";
    const n = await categorizeByAddress(entityId, input.address.trim(), kind === "SELF" ? "INTERNAL_TRANSFER" : kind === "CUSTOMER" ? "CUSTOMER_RECEIPT" : kind === "SUPPLIER" ? "PURCHASE_GOODS" : "UNKNOWN", kind === "SELF" ? "SELF" : "EXTERNAL");
    revalidatePath(`/app/${entityId}`, "layout");
    return { ok: true, message: n ? `Adresse ajoutée, ${n} transaction(s) requalifiée(s)` : "Adresse ajoutée" };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function removeWalletAction(entityId: string, walletId: string): Promise<Result> {
  try {
    const user = await requireUser();
    await removeWallet(user.id, entityId, walletId);
    revalidatePath(`/app/${entityId}/accounts`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
