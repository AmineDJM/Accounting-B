import { D } from "@/lib/engine/money";
import type { CanonicalTx, Category, TxType } from "@/lib/engine/model";
import type { transactions } from "@/lib/db/schema";

export type TxRow = typeof transactions.$inferSelect;
export type TxInsert = typeof transactions.$inferInsert;

export function rowToTx(r: TxRow): CanonicalTx {
  return {
    id: r.id,
    accountId: r.accountId,
    source: r.source as CanonicalTx["source"],
    externalId: r.externalId,
    timestamp: new Date(r.timestamp),
    type: r.type as TxType,
    category: r.category as Category,
    legs: r.legs.map((l) => ({ asset: l.asset, amount: D(l.amount), role: l.role })),
    counterparty: r.counterparty ? { ...r.counterparty, kind: r.counterparty.kind as NonNullable<CanonicalTx["counterparty"]>["kind"] } : undefined,
    ref: r.ref ?? undefined,
    note: r.note ?? undefined,
    knownUnitPriceEur: r.knownPrices ? Object.fromEntries(Object.entries(r.knownPrices).map(([k, v]) => [k, D(v)])) : undefined,
  };
}

export function txToRow(tx: CanonicalTx, entityId: string): TxInsert {
  return {
    entityId,
    accountId: tx.accountId,
    source: tx.source,
    externalId: tx.externalId,
    timestamp: tx.timestamp,
    type: tx.type,
    category: tx.category,
    legs: tx.legs.map((l) => ({ asset: l.asset.toUpperCase(), amount: l.amount.toString(), role: l.role })),
    counterparty: tx.counterparty ?? null,
    ref: tx.ref ?? null,
    note: tx.note ?? null,
    knownPrices: tx.knownUnitPriceEur ? Object.fromEntries(Object.entries(tx.knownUnitPriceEur).map(([k, v]) => [k, v.toString()])) : null,
    reviewStatus: tx.category === "UNKNOWN" ? "FLAGGED" : "AUTO",
  };
}
