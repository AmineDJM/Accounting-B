"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/auth";
import { bulkCategorize, categorizeTransaction, createManualTransaction, deleteTransaction } from "@/lib/dal/transactions";
import { D } from "@/lib/engine/money";
import type { Category, Leg, TxType } from "@/lib/engine/model";

export type Result = { ok: true; message?: string } | { ok: false; error: string };

const CATEGORIES = ["TRADE", "BANK_TRANSFER", "INTERNAL_TRANSFER", "PURCHASE_GOODS", "CUSTOMER_RECEIPT", "OWNER_CONTRIBUTION", "OWNER_WITHDRAWAL", "STAKING_INCOME", "AIRDROP", "GIFT_RECEIVED", "GIFT_GIVEN", "LOST", "FOUND", "UNKNOWN"] as const;

export async function categorizeAction(entityId: string, txId: string, input: { category: string; note?: string; counterpartyKind?: "SELF" | "EXTERNAL" | "BANK" | "UNKNOWN" }): Promise<Result> {
  try {
    const user = await requireUser();
    const category = z.enum(CATEGORIES).parse(input.category) as Category;
    await categorizeTransaction(user.id, entityId, txId, { category, note: input.note, counterpartyKind: input.counterpartyKind ?? (category === "INTERNAL_TRANSFER" ? "SELF" : undefined), reviewStatus: category === "UNKNOWN" ? "FLAGGED" : "REVIEWED" });
    revalidatePath(`/app/${entityId}`, "layout");
    return { ok: true, message: "Opération qualifiée" };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function bulkCategorizeAction(entityId: string, txIds: string[], category: string): Promise<Result> {
  try {
    const user = await requireUser();
    const n = await bulkCategorize(user.id, entityId, txIds, z.enum(CATEGORIES).parse(category) as Category);
    revalidatePath(`/app/${entityId}`, "layout");
    return { ok: true, message: `${n} opération(s) qualifiée(s)` };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

const manualSchema = z.object({
  accountId: z.string().min(1),
  type: z.enum(["TRADE", "FIAT_DEPOSIT", "FIAT_WITHDRAWAL", "CRYPTO_DEPOSIT", "CRYPTO_WITHDRAWAL", "REWARD", "ADJUSTMENT", "FEE"]),
  category: z.enum(CATEGORIES),
  timestamp: z.string().min(10),
  outAsset: z.string().trim().toUpperCase().optional().or(z.literal("")),
  outAmount: z.string().optional().or(z.literal("")),
  inAsset: z.string().trim().toUpperCase().optional().or(z.literal("")),
  inAmount: z.string().optional().or(z.literal("")),
  feeAsset: z.string().trim().toUpperCase().optional().or(z.literal("")),
  feeAmount: z.string().optional().or(z.literal("")),
  ref: z.string().max(120).optional().or(z.literal("")),
  note: z.string().max(500).optional().or(z.literal("")),
  address: z.string().max(120).optional().or(z.literal("")),
});

export async function createManualAction(entityId: string, input: z.input<typeof manualSchema>): Promise<Result> {
  try {
    const user = await requireUser();
    const d = manualSchema.parse(input);
    const legs: Leg[] = [];
    if (d.outAsset && d.outAmount && D(d.outAmount).gt(0)) legs.push({ asset: d.outAsset, amount: D(d.outAmount), role: "OUT" });
    if (d.inAsset && d.inAmount && D(d.inAmount).gt(0)) legs.push({ asset: d.inAsset, amount: D(d.inAmount), role: "IN" });
    if (d.feeAsset && d.feeAmount && D(d.feeAmount).gt(0)) legs.push({ asset: d.feeAsset, amount: D(d.feeAmount), role: "FEE" });
    if (legs.length === 0) return { ok: false, error: "Indiquez au moins un montant." };
    const ts = new Date(d.timestamp);
    if (isNaN(ts.getTime())) return { ok: false, error: "Date invalide" };
    await createManualTransaction(user.id, entityId, {
      accountId: d.accountId, type: d.type as TxType, category: d.category as Category, timestamp: ts, legs, ref: d.ref || undefined, note: d.note || undefined,
      counterparty: d.address ? { kind: d.category === "INTERNAL_TRANSFER" ? "SELF" : "EXTERNAL", address: d.address } : d.type.startsWith("FIAT") ? { kind: "BANK" } : undefined,
    });
    revalidatePath(`/app/${entityId}`, "layout");
    return { ok: true, message: "Opération ajoutée" };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function deleteManualAction(entityId: string, txId: string): Promise<Result> {
  try {
    const user = await requireUser();
    await deleteTransaction(user.id, entityId, txId);
    revalidatePath(`/app/${entityId}`, "layout");
    return { ok: true, message: "Opération supprimée" };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
