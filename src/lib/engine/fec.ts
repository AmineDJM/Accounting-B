import { cents, fecNumber, D, ZERO, type Decimal } from "./money";
import { zonedDateStamp } from "./tz";

/**
 * Fichier des Écritures Comptables (FEC) — article A47 A-1 du Livre des
 * procédures fiscales. 18 mandatory fields, "|" or tab separator, UTF-8,
 * dates as AAAAMMJJ, decimal comma, file named SIRENFECAAAAMMJJ.txt.
 */
export const FEC_COLUMNS = [
  "JournalCode", "JournalLib", "EcritureNum", "EcritureDate", "CompteNum", "CompteLib", "CompAuxNum", "CompAuxLib",
  "PieceRef", "PieceDate", "EcritureLib", "Debit", "Credit", "EcritureLet", "DateLet", "ValidDate", "Montantdevise", "Idevise",
] as const;

export interface FecRow {
  JournalCode: string;
  JournalLib: string;
  EcritureNum: string;
  EcritureDate: string; // AAAAMMJJ
  CompteNum: string;
  CompteLib: string;
  CompAuxNum: string;
  CompAuxLib: string;
  PieceRef: string;
  PieceDate: string; // AAAAMMJJ
  EcritureLib: string;
  Debit: string; // "1234,56"
  Credit: string;
  EcritureLet: string;
  DateLet: string;
  ValidDate: string; // AAAAMMJJ
  Montantdevise: string;
  Idevise: string;
}

/** AAAAMMJJ on the accounting calendar (Europe/Paris). */
export const fecDate = (d: Date): string => zonedDateStamp(d);

/** Strip characters that would break the flat file (separators, line breaks) and collapse whitespace. */
export const fecText = (s: string | undefined | null, max = 200): string =>
  (s ?? "").replace(/[|\t\r\n]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

export function fecFileName(siren: string, closingDate: Date): string {
  const s = siren.replace(/\D/g, "").padStart(9, "0");
  return `${s}FEC${fecDate(closingDate)}.txt`;
}

export function serializeFec(rows: FecRow[], separator: "|" | "\t" = "|", lineBreak = "\r\n"): string {
  const header = FEC_COLUMNS.join(separator);
  const body = rows.map((r) => FEC_COLUMNS.map((c) => r[c]).join(separator));
  return [header, ...body].join(lineBreak) + lineBreak;
}

export interface FecIssue {
  level: "error" | "warning";
  code: string;
  message: string;
  row?: number; // 1-based row index (excluding header)
}

export interface FecValidationReport {
  ok: boolean;
  rowCount: number;
  entryCount: number;
  totalDebit: Decimal;
  totalCredit: Decimal;
  issues: FecIssue[];
}

const DATE_RE = /^\d{8}$/;
const NUM_RE = /^-?\d+,\d{2}$/;

function parseFecDate(s: string): Date | null {
  if (!DATE_RE.test(s)) return null;
  const y = Number(s.slice(0, 4)), m = Number(s.slice(4, 6)), d = Number(s.slice(6, 8));
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return date;
}

/**
 * Validates the structural rules the DGFiP "Test Compta Demat" tool checks:
 * mandatory fields, date formats, numeric formats, balanced entries, continuous
 * numbering per journal, dates within the fiscal year, chronological order.
 */
export function validateFec(rows: FecRow[], fiscalYear: { start: Date; end: Date }): FecValidationReport {
  const issues: FecIssue[] = [];
  let totalDebit = ZERO, totalCredit = ZERO;
  const entries = new Map<string, { debit: Decimal; credit: Decimal; date: string; rows: number[] }>();
  const seqByJournal = new Map<string, number[]>();
  const startStamp = fecDate(fiscalYear.start), endStamp = fecDate(fiscalYear.end);

  rows.forEach((r, i) => {
    const n = i + 1;
    const mandatory: (keyof FecRow)[] = ["JournalCode", "JournalLib", "EcritureNum", "EcritureDate", "CompteNum", "CompteLib", "PieceRef", "PieceDate", "EcritureLib", "ValidDate"];
    for (const f of mandatory) if (!r[f] || r[f].trim() === "") issues.push({ level: "error", code: "MANDATORY", message: `Champ ${f} vide`, row: n });
    for (const f of ["EcritureDate", "PieceDate", "ValidDate"] as const) {
      const d = parseFecDate(r[f]);
      if (!d) issues.push({ level: "error", code: "DATE_FORMAT", message: `${f} invalide (${r[f]}) — attendu AAAAMMJJ`, row: n });
      else if (f === "EcritureDate" && (r[f] < startStamp || r[f] > endStamp)) issues.push({ level: "error", code: "DATE_RANGE", message: `EcritureDate ${r[f]} hors exercice`, row: n });
    }
    if (r.DateLet && !parseFecDate(r.DateLet)) issues.push({ level: "error", code: "DATE_FORMAT", message: `DateLet invalide`, row: n });
    for (const f of ["Debit", "Credit"] as const) {
      if (r[f] !== "" && !NUM_RE.test(r[f])) issues.push({ level: "error", code: "NUM_FORMAT", message: `${f} invalide (${r[f]}) — attendu 1234,56`, row: n });
    }
    const debit = r.Debit ? D(r.Debit) : ZERO;
    const credit = r.Credit ? D(r.Credit) : ZERO;
    if (debit.isZero() && credit.isZero()) issues.push({ level: "warning", code: "ZERO_LINE", message: "Ligne à zéro", row: n });
    if (!debit.isZero() && !credit.isZero()) issues.push({ level: "error", code: "BOTH_SIDES", message: "Débit et crédit renseignés sur la même ligne", row: n });
    if (debit.isNegative() || credit.isNegative()) issues.push({ level: "warning", code: "NEGATIVE", message: "Montant négatif", row: n });
    if (r.CompteNum && r.CompteNum.length < 3) issues.push({ level: "error", code: "ACCOUNT", message: `CompteNum trop court (${r.CompteNum})`, row: n });
    if (r.Montantdevise && !r.Idevise) issues.push({ level: "error", code: "CURRENCY", message: "Montantdevise sans Idevise", row: n });

    totalDebit = totalDebit.plus(debit);
    totalCredit = totalCredit.plus(credit);
    const key = `${r.JournalCode}#${r.EcritureNum}`;
    const e = entries.get(key) ?? { debit: ZERO, credit: ZERO, date: r.EcritureDate, rows: [] };
    e.debit = e.debit.plus(debit);
    e.credit = e.credit.plus(credit);
    e.rows.push(n);
    if (e.date !== r.EcritureDate) issues.push({ level: "error", code: "ENTRY_DATE", message: `Dates différentes au sein de l'écriture ${r.EcritureNum}`, row: n });
    entries.set(key, e);
    const seq = seqByJournal.get(r.JournalCode) ?? [];
    const num = Number(r.EcritureNum.replace(/\D/g, ""));
    if (seq.length === 0 || seq[seq.length - 1] !== num) seq.push(num);
    seqByJournal.set(r.JournalCode, seq);
  });

  for (const [key, e] of entries) {
    if (!cents(e.debit).eq(cents(e.credit))) issues.push({ level: "error", code: "UNBALANCED", message: `Écriture ${key.split("#")[1]} déséquilibrée : débit ${fecNumber(e.debit)} / crédit ${fecNumber(e.credit)}`, row: e.rows[0] });
  }
  for (const [journal, seq] of seqByJournal) {
    const sorted = [...new Set(seq)].sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] !== sorted[i - 1] + 1) { issues.push({ level: "error", code: "SEQUENCE", message: `Rupture de séquence dans le journal ${journal} entre ${sorted[i - 1]} et ${sorted[i]}` }); break; }
    }
    for (let i = 1; i < seq.length; i++) if (seq[i] < seq[i - 1]) { issues.push({ level: "warning", code: "ORDER", message: `Écritures du journal ${journal} non ordonnées` }); break; }
  }
  // chronological order within the file
  let lastDate = "";
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].EcritureDate < lastDate) { issues.push({ level: "warning", code: "CHRONO", message: "Le fichier n'est pas trié par date d'écriture", row: i + 1 }); break; }
    lastDate = rows[i].EcritureDate;
  }
  if (!cents(totalDebit).eq(cents(totalCredit))) issues.push({ level: "error", code: "TOTAL", message: `Total débit ${fecNumber(totalDebit)} ≠ total crédit ${fecNumber(totalCredit)}` });

  return { ok: !issues.some((i) => i.level === "error"), rowCount: rows.length, entryCount: entries.size, totalDebit, totalCredit, issues };
}

/** Parse a FEC file back into rows (used for tests and for importing an existing FEC). */
export function parseFec(text: string): FecRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length === 0) return [];
  const sep = lines[0].includes("|") ? "|" : "\t";
  const header = lines[0].split(sep);
  return lines.slice(1).map((line) => {
    const cells = line.split(sep);
    const row = {} as Record<string, string>;
    header.forEach((h, i) => (row[h] = cells[i] ?? ""));
    return row as unknown as FecRow;
  });
}
