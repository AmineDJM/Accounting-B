import type { TaxComputationResult } from "@/lib/engine/tax/types";
import type { ReconciliationResult } from "@/lib/dac8/types";

/**
 * Wire shapes.
 *
 * `decimal.js` serialises a Decimal to its exact string and a Date to an ISO
 * string, so a result crosses to the browser without losing a digit. These
 * types describe what arrives there, so the client never has to guess whether a
 * field is a number or a string — it is always the string, and it is always
 * exact.
 */
export type Wire<T> = T extends Date
  ? string
  : T extends { toFixed(n: number): string }
    ? string
    : T extends (infer U)[]
      ? Wire<U>[]
      : T extends object
        ? { [K in keyof T]: Wire<T[K]> }
        : T;

export type WireTax = Wire<TaxComputationResult>;
export type WireReconciliation = Wire<ReconciliationResult>;

export const toWire = <T>(value: T): Wire<T> => JSON.parse(JSON.stringify(value)) as Wire<T>;
