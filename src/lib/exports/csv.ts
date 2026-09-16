import { cents, ZERO, type Decimal } from "@/lib/engine/money";
import { zonedParts } from "@/lib/engine/tz";
import type { AuditFileInput, AuditFileOutput } from "./types";

/**
 * Generic ledger export.
 *
 * Every jurisdiction covered here has either a mandatory audit file or a
 * dominant interchange format, except the Gulf states, where the requirement is
 * to keep records for the statutory retention period in a form an auditor can
 * read. This is that file: one row per line, signed amounts, ISO dates, UTF-8
 * with a byte-order mark so Excel opens it correctly in any locale.
 */
const COLUMNS = [
  "journal_code", "journal_label", "entry_number", "entry_date", "period",
  "account", "account_label", "aux_account", "aux_label",
  "document_ref", "document_date", "line_label", "debit", "credit",
  "currency", "currency_amount", "entry_kind", "tx_id",
] as const;

const esc = (s: string | undefined): string => {
  const v = (s ?? "").replace(/[\r\n]+/g, " ").trim();
  return /[",;]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
};

const money = (d: Decimal): string => cents(d).toFixed(2);

const pad2 = (n: number) => String(n).padStart(2, "0");

const isoDate = (d: Date, tz: string): string => {
  const p = zonedParts(d, tz);
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
};

export function exportGenericCsv(input: AuditFileInput): AuditFileOutput {
  const tz = input.timezone ?? "UTC";
  const rows: string[] = [];
  let debit = ZERO;
  let credit = ZERO;
  let lines = 0;

  for (const entry of input.entries) {
    for (const l of entry.lines) {
      lines += 1;
      debit = debit.plus(cents(l.debit));
      credit = credit.plus(cents(l.credit));
      rows.push([
        esc(entry.journalCode), esc(entry.journalLib), esc(entry.num), isoDate(entry.date, tz),
        isoDate(entry.date, tz).slice(0, 7),
        esc(l.account), esc(l.accountLabel), esc(l.auxAccount), esc(l.auxLabel),
        esc(entry.pieceRef), isoDate(entry.pieceDate, tz), esc(l.label),
        money(l.debit), money(l.credit),
        esc(l.currency ?? input.entity.currency), l.currencyAmount ? l.currencyAmount.toFixed(8) : "",
        esc(entry.kind), esc(entry.txId),
      ].join(";"));
    }
  }

  const warnings: string[] = [];
  if (!debit.eq(credit)) warnings.push(`Le fichier n'est pas équilibré : ${money(debit)} au débit contre ${money(credit)} au crédit.`);

  return {
    format: "CSV",
    fileName: `ledger_${input.entity.name.replace(/\W+/g, "_").slice(0, 30)}_${isoDate(input.fiscalYear.end, tz).slice(0, 4)}.csv`,
    content: "﻿" + [COLUMNS.join(";"), ...rows].join("\r\n") + "\r\n",
    encoding: "utf-8",
    mimeType: "text/csv",
    warnings,
    notes: [
      "Format générique : une ligne par ligne d'écriture, montants signés positifs en débit et crédit séparés, dates ISO. Il n'a pas de valeur réglementaire en lui-même et sert à la reprise dans un autre logiciel comptable.",
      "Conservez-le avec le journal détaillé des opérations et les justificatifs de cours : c'est l'ensemble qui constitue la piste d'audit, pas le seul fichier d'écritures.",
    ],
    stats: { entries: input.entries.length, lines, debit, credit },
  };
}
