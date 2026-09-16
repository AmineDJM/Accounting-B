import { fecDate, fecText, type FecRow } from "./fec";
import { fecNumber } from "./money";
import type { JournalEntry } from "./journal";

export interface FecBuildOptions {
  validationDate: Date;
}

/** Turn journal entries into FEC rows (one per line), preserving numbering. */
export function buildFecRows(entries: JournalEntry[], opts: FecBuildOptions): FecRow[] {
  const rows: FecRow[] = [];
  const sorted = [...entries].sort((a, b) => a.date.getTime() - b.date.getTime() || a.journalCode.localeCompare(b.journalCode) || a.seq - b.seq);
  for (const e of sorted) {
    for (const l of e.lines) {
      rows.push({
        JournalCode: fecText(e.journalCode, 10),
        JournalLib: fecText(e.journalLib, 100),
        EcritureNum: e.num,
        EcritureDate: fecDate(e.date),
        CompteNum: fecText(l.account, 20),
        CompteLib: fecText(l.accountLabel, 100),
        CompAuxNum: fecText(l.auxAccount ?? "", 20),
        CompAuxLib: fecText(l.auxLabel ?? "", 100),
        PieceRef: fecText(e.pieceRef, 60),
        PieceDate: fecDate(e.pieceDate),
        EcritureLib: fecText(l.label || e.label, 200),
        Debit: l.debit.isZero() ? "0,00" : fecNumber(l.debit),
        Credit: l.credit.isZero() ? "0,00" : fecNumber(l.credit),
        EcritureLet: "",
        DateLet: "",
        ValidDate: fecDate(opts.validationDate),
        Montantdevise: l.currencyAmount ? l.currencyAmount.toFixed(8).replace(".", ",").replace(/,?0+$/, "") : "",
        Idevise: l.currency ? fecText(l.currency, 10) : "",
      });
    }
  }
  return rows;
}
