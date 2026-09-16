import type { AuditFileFormat, AuditFileExporter, AuditFileInput, AuditFileOutput } from "./types";
import { exportDatev, toWindows1252 } from "./datev";
import { exportSaftPt } from "./saft";
import { exportXafNl } from "./xaf";
import { exportGenericCsv } from "./csv";
import { exportFecFile } from "./fec";

export * from "./types";
export { toWindows1252 };

export const EXPORTERS: Record<AuditFileFormat, AuditFileExporter> = {
  FEC: exportFecFile,
  DATEV: exportDatev,
  SAFT_PT: exportSaftPt,
  XAF_NL: exportXafNl,
  CSV: exportGenericCsv,
};

export const FORMAT_LABELS: Record<AuditFileFormat, { fr: string; en: string; countries: string[] }> = {
  FEC: { fr: "Fichier des écritures comptables (FEC)", en: "French accounting entries file (FEC)", countries: ["FR"] },
  DATEV: { fr: "Lot d'écritures DATEV (EXTF Buchungsstapel)", en: "DATEV posting batch (EXTF Buchungsstapel)", countries: ["DE", "AT"] },
  SAFT_PT: { fr: "SAF-T (PT) 1.04_01", en: "SAF-T (PT) 1.04_01", countries: ["PT"] },
  XAF_NL: { fr: "XML Auditfile Financieel 3.2", en: "XML Auditfile Financieel 3.2", countries: ["NL"] },
  CSV: { fr: "Journal générique (CSV)", en: "Generic ledger (CSV)", countries: ["BE", "ES", "IT", "CH", "AE", "OM", "QA"] },
};

export function exportAuditFile(format: AuditFileFormat, input: AuditFileInput): AuditFileOutput {
  return EXPORTERS[format](input);
}

/** Bytes to serve for download, honouring the encoding the format requires. */
export function auditFileBytes(output: AuditFileOutput): Uint8Array {
  if (output.encoding === "windows-1252") return toWindows1252(output.content);
  return new TextEncoder().encode(output.content);
}
