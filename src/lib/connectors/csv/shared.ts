import Papa from "papaparse";
import { D, ZERO, type Decimal } from "@/lib/engine/money";
import { isFiat, type CanonicalTx, type Category, type Leg, type TxType } from "@/lib/engine/model";
import { sha256 } from "@/lib/security/crypto";

/**
 * Shared plumbing for exchange CSV importers.
 *
 * Every platform exports a different layout, renames its columns between
 * versions and localises its headers. Parsers here therefore look columns up by
 * meaning rather than by position, and anything they cannot interpret is
 * reported instead of dropped: an operation the importer does not understand
 * still lands in the ledger as a movement to qualify.
 */
export interface ParseContext {
  accountId: string;
  selfAddresses?: Set<string>;
  /** Fallback platform label, used in references. */
  platform: string;
}

export interface CsvImportResult {
  transactions: CanonicalTx[];
  rowCount: number;
  ignoredRows: number;
  unknownOperations: Record<string, number>;
  warnings: string[];
  from?: Date;
  to?: Date;
  format: string;
  platform: string;
}

export interface CsvFormat {
  id: string;
  platform: string;
  label: string;
  /** Short hint shown in the interface to help the user find the export. */
  where: string;
  /** 0 = not this format, 1 = certain. */
  detect(header: string[], rows: Record<string, string>[], fileName: string): number;
  parse(rows: Record<string, string>[], ctx: ParseContext): CsvImportResult;
}

export const norm = (s: string): string => s.trim().toLowerCase().replace(/﻿/g, "").replace(/[_\-.]+/g, " ").replace(/\s+/g, " ");

export function parseRows(text: string): { header: string[]; rows: Record<string, string>[]; errors: string[] } {
  const clean = text.replace(/^﻿/, "");
  const parsed = Papa.parse<Record<string, string>>(clean, { header: true, skipEmptyLines: "greedy", transformHeader: (h) => h.trim(), delimiter: "" });
  return {
    header: (parsed.meta.fields ?? []).map((h) => h.trim()),
    rows: parsed.data.filter((r) => Object.values(r).some((v) => String(v ?? "").trim() !== "")),
    errors: parsed.errors.slice(0, 5).map((e) => `Ligne ${e.row}: ${e.message}`),
  };
}

/** Reads the first column whose normalised name matches one of `names`. */
export function col(row: Record<string, string>, ...names: string[]): string {
  const wanted = names.map(norm);
  for (const [k, v] of Object.entries(row)) {
    if (wanted.includes(norm(k))) return String(v ?? "").trim();
  }
  for (const [k, v] of Object.entries(row)) {
    const n = norm(k);
    if (wanted.some((w) => n.startsWith(w) || n.includes(w))) return String(v ?? "").trim();
  }
  return "";
}

export const hasCols = (header: string[], ...names: string[]): boolean => {
  const h = header.map(norm);
  return names.every((n) => h.some((x) => x === norm(n) || x.includes(norm(n))));
};

export const countCols = (header: string[], names: string[]): number => {
  const h = header.map(norm);
  return names.filter((n) => h.some((x) => x === norm(n) || x.includes(norm(n)))).length;
};

/** Parses a decimal that may use a comma, spaces, a currency symbol or parentheses for negatives. */
export function num(v: string | undefined | null): Decimal {
  if (v === undefined || v === null) return ZERO;
  let s = String(v).trim().replace(/[\s '`]/g, "").replace(/[€$£¥₿]/g, "");
  if (!s || s === "-" || s === "—") return ZERO;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  if (s.startsWith("-")) { neg = true; s = s.slice(1); }
  if (s.includes(",") && s.lastIndexOf(",") > s.lastIndexOf(".")) s = s.replace(/\./g, "").replace(",", ".");
  else s = s.replace(/,/g, "");
  const n = Number(s);
  if (!isFinite(n)) return ZERO;
  return neg ? D(s).neg() : D(s);
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, fev: 2, mar: 3, apr: 4, avr: 4, may: 5, mai: 5, jun: 6, juin: 6, jul: 7, juil: 7,
  aug: 8, aou: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/** Parses the many date shapes exports use, always yielding a UTC instant. */
export function parseDate(v: string, assumeUtc = true): Date | null {
  if (!v) return null;
  const s = v.trim().replace(/\bUTC\b/i, "").trim();
  // 2025-01-02 10:30:00 / 2025-01-02T10:30:00Z / 2025-01-02T10:30:00.000Z
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0)));
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(`${s}T00:00:00Z`);
  // 02/01/2025 10:30 (day first) and 01/02/2025 10:30 AM (month first, with meridiem)
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ ,]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])?)?/);
  if (m) {
    const a = +m[1], b = +m[2];
    const monthFirst = Boolean(m[7]) || a > 12;
    const day = monthFirst ? b : a;
    const month = monthFirst ? a : b;
    let hour = +(m[4] ?? 0);
    if (m[7]) {
      const pm = m[7].toLowerCase() === "pm";
      if (pm && hour < 12) hour += 12;
      if (!pm && hour === 12) hour = 0;
    }
    return new Date(Date.UTC(+m[3], month - 1, day, hour, +(m[5] ?? 0), +(m[6] ?? 0)));
  }
  // 02.01.2025 10:30 (German / Swiss)
  m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:[ ]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0)));
  // "Jan. 15, 2026, 10:30 AM" and "15 January 2026 10:30" — Bitstamp and
  // several bank exports write the month as a word.
  const named = s.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})(?:,?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])?)?/)
    ?? s.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\.?\s+(\d{4})(?:[ ,]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])?)?/);
  if (named) {
    // The two patterns put the month and the day the other way round.
    const monthWord = /^[A-Za-z]/.test(named[1]) ? named[1] : named[2];
    const dayStr = /^[A-Za-z]/.test(named[1]) ? named[2] : named[1];
    const month = MONTHS[monthWord.slice(0, 3).toLowerCase()];
    if (month) {
      let hour = +(named[4] ?? 0);
      const meridiem = named[7];
      if (meridiem) {
        const pm = meridiem.toLowerCase() === "pm";
        if (pm && hour < 12) hour += 12;
        if (!pm && hour === 12) hour = 0;
      }
      return new Date(Date.UTC(+named[3], month - 1, +dayStr, hour, +(named[5] ?? 0), +(named[6] ?? 0)));
    }
  }
  // Unix seconds or milliseconds
  if (/^\d{10}$/.test(s)) return new Date(Number(s) * 1000);
  if (/^\d{13}$/.test(s)) return new Date(Number(s));
  const d = new Date(assumeUtc && !/[Zz]|[+-]\d{2}:?\d{2}$/.test(s) ? `${s}Z` : s);
  return isNaN(d.getTime()) ? null : d;
}

export const ADDRESS_RE = /0x[a-fA-F0-9]{40}|bc1[a-z0-9]{20,}|[13][a-km-zA-HJ-NP-Z1-9]{25,34}|T[a-zA-Z0-9]{33}|r[a-zA-Z0-9]{24,34}|addr1[a-z0-9]{20,}|[1-9A-HJ-NP-Za-km-z]{32,44}/;

export function findAddress(...values: (string | undefined)[]): string | undefined {
  for (const v of values) {
    if (!v) continue;
    const m = v.match(ADDRESS_RE);
    if (m) return m[0];
  }
  return undefined;
}

export const mkId = (platform: string, parts: (string | number | undefined)[]): string => `${platform.toLowerCase()}:${sha256(parts.filter((p) => p !== undefined).join("|")).slice(0, 24)}`;

export interface BuildTxInput {
  ctx: ParseContext;
  externalId: string;
  timestamp: Date;
  type: TxType;
  category: Category;
  legs: Leg[];
  ref?: string;
  note?: string;
  address?: string;
  network?: string;
  txHash?: string;
  bank?: boolean;
  knownUnitPriceEur?: Record<string, Decimal>;
}

export function buildTx(i: BuildTxInput): CanonicalTx {
  const legs = i.legs.filter((l) => l.amount.gt(0));
  const self = i.address ? i.ctx.selfAddresses?.has(i.address.toLowerCase()) ?? false : false;
  const category: Category = self && (i.type === "CRYPTO_DEPOSIT" || i.type === "CRYPTO_WITHDRAWAL") ? "INTERNAL_TRANSFER" : i.category;
  return {
    id: i.externalId,
    accountId: i.ctx.accountId,
    source: "generic_csv",
    externalId: i.externalId,
    timestamp: i.timestamp,
    type: i.type,
    category,
    legs,
    counterparty: i.bank
      ? { kind: "BANK", label: i.note }
      : i.address || i.txHash || i.network
        ? { kind: self ? "SELF" : "UNKNOWN", address: i.address, network: i.network, txHash: i.txHash }
        : undefined,
    ref: i.ref,
    note: i.note,
    knownUnitPriceEur: i.knownUnitPriceEur,
  };
}

/** Builds the legs of an exchange, netting an asset that appears on both sides. */
export function tradeLegs(out: { asset: string; amount: Decimal }[], inn: { asset: string; amount: Decimal }[], fees: { asset: string; amount: Decimal }[]): Leg[] {
  const legs: Leg[] = [];
  for (const o of out) if (o.amount.gt(0)) legs.push({ asset: o.asset.toUpperCase(), amount: o.amount, role: "OUT" });
  for (const i of inn) if (i.amount.gt(0)) legs.push({ asset: i.asset.toUpperCase(), amount: i.amount, role: "IN" });
  for (const f of fees) if (f.amount.gt(0)) legs.push({ asset: f.asset.toUpperCase(), amount: f.amount, role: "FEE" });
  return legs;
}

export const isFiatAsset = (asset: string): boolean => isFiat(asset);

export function emptyResult(format: string, platform: string): CsvImportResult {
  return { transactions: [], rowCount: 0, ignoredRows: 0, unknownOperations: {}, warnings: [], format, platform };
}

export function finalise(res: CsvImportResult, dates: Date[]): CsvImportResult {
  res.transactions.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  if (dates.length) {
    res.from = new Date(Math.min(...dates.map((d) => d.getTime())));
    res.to = new Date(Math.max(...dates.map((d) => d.getTime())));
  }
  for (const [op, n] of Object.entries(res.unknownOperations)) {
    res.warnings.push(`Opération « ${op} » non reconnue (${n} ligne${n > 1 ? "s" : ""}) : importée comme mouvement à qualifier.`);
  }
  return res;
}
