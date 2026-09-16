import { ZERO } from "@/lib/engine/money";
import { buildFecRows } from "@/lib/engine/fecbuild";
import { fecFileName, serializeFec, validateFec } from "@/lib/engine/fec";
import type { AuditFileInput, AuditFileOutput } from "./types";

/**
 * Fichier des écritures comptables — article A47 A-1 du LPF.
 *
 * The builder and the validator live in the engine, because the FEC is also
 * what the French journal page displays and re-reads. This wrapper puts them
 * behind the same interface as the other audit files, so the export page does
 * not have to special-case France.
 */
export function exportFecFile(input: AuditFileInput): AuditFileOutput {
  const rows = buildFecRows(input.entries, { validationDate: input.generatedAt ?? new Date() });
  const report = validateFec(rows, input.fiscalYear);
  const siren = (input.entity.legalId ?? "").replace(/\D/g, "");
  const warnings = report.issues.filter((i) => i.level === "error").map((i) => `${i.code}${i.row ? ` (ligne ${i.row})` : ""} : ${i.message}`);
  const soft = report.issues.filter((i) => i.level === "warning").map((i) => `${i.code}${i.row ? ` (ligne ${i.row})` : ""} : ${i.message}`);

  if (siren.length !== 9) {
    warnings.push("Le SIREN doit comporter neuf chiffres : il donne son nom au fichier (SIRENFECAAAAMMJJ.txt) et l'administration le contrôle avant tout le reste.");
  }

  return {
    format: "FEC",
    fileName: fecFileName(siren || "000000000", input.fiscalYear.end),
    content: serializeFec(rows),
    encoding: "utf-8",
    mimeType: "text/plain",
    warnings,
    notes: [
      "Le fichier est remis à l'administration au premier jour d'un contrôle de comptabilité, sous quinze jours en cas de demande. Il est contrôlé par l'outil « Test Compta Demat » de la DGFiP, que les règles vérifiées ici reproduisent.",
      "Les jetons sont inscrits au compte 522 et leur cession dégage un résultat net en 7674 ou 6674, conformément aux articles 619-10 à 619-17 du PCG issus du règlement ANC 2018-07.",
      ...soft,
    ],
    stats: { entries: report.entryCount, lines: report.rowCount, debit: report.totalDebit ?? ZERO, credit: report.totalCredit ?? ZERO },
  };
}
