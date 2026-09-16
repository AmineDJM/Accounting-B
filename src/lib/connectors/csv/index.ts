import { importBinanceCsv } from "@/lib/connectors/binance/csv";
import { BITPANDA, stripBitpandaPreamble } from "./bitpanda";
import { BITSTAMP } from "./bitstamp";
import { BITVAVO } from "./bitvavo";
import { COINBASE } from "./coinbase";
import { CRYPTOCOM } from "./cryptocom";
import { GENERIC, GENERIC_CSV_TEMPLATE } from "./generic";
import { KRAKEN } from "./kraken";
import { LEDGER } from "./ledger";
import { emptyResult, finalise, hasCols, parseRows, type CsvFormat, type CsvImportResult, type ParseContext } from "./shared";

export * from "./shared";
export { GENERIC_CSV_TEMPLATE };

/**
 * Binance keeps its own importer, which predates this registry and handles a
 * layout nothing else shares: one row per asset movement, with the two sides of
 * a trade tied together only by their timestamp and their sub-account.
 */
const BINANCE: CsvFormat = {
  id: "binance",
  platform: "Binance",
  label: "Binance — relevé de transactions (CSV)",
  where: "Binance → Wallet → Transaction History → Generate all statements",
  detect(header, _rows, fileName) {
    if (/binance/i.test(fileName)) return 1;
    if (hasCols(header, "UTC_Time", "Operation", "Coin", "Change")) return 1;
    if (hasCols(header, "UTC Time", "Operation", "Coin")) return 0.95;
    return 0;
  },
  parse() {
    // Never reached: importCsv routes Binance through its own reader, which
    // needs the raw text rather than parsed rows.
    return emptyResult(BINANCE.id, BINANCE.platform);
  },
};

/** Every reader, in the order they are offered in the interface. */
export const CSV_FORMATS: CsvFormat[] = [BINANCE, COINBASE, KRAKEN, BITVAVO, BITPANDA, CRYPTOCOM, BITSTAMP, LEDGER, GENERIC];

export interface DetectedFormat {
  format: CsvFormat;
  confidence: number;
  /** Other readers that also recognised the file, best first. */
  alternatives: { id: string; label: string; confidence: number }[];
}

/**
 * Picks the reader for a file.
 *
 * Detection scores every reader rather than stopping at the first match, so a
 * file that two readers claim is reported as ambiguous instead of being parsed
 * silently by whichever came first in the list.
 */
export function detectFormat(text: string, fileName = ""): DetectedFormat {
  const prepared = prepare(text, fileName);
  const { header, rows } = parseRows(prepared);
  const scored = CSV_FORMATS
    .map((format) => ({ format, confidence: safeDetect(format, header, rows, fileName) }))
    .filter((s) => s.confidence > 0)
    .sort((a, b) => b.confidence - a.confidence);
  const best = scored[0] ?? { format: GENERIC, confidence: 0.05 };
  return {
    format: best.format,
    confidence: best.confidence,
    alternatives: scored.slice(1).map((s) => ({ id: s.format.id, label: s.format.label, confidence: s.confidence })),
  };
}

function safeDetect(format: CsvFormat, header: string[], rows: Record<string, string>[], fileName: string): number {
  try {
    return format.detect(header, rows.slice(0, 50), fileName);
  } catch {
    return 0;
  }
}

/** Strips the preamble some platforms put before the real header row. */
function prepare(text: string, fileName: string): string {
  const stripped = stripBitpandaPreamble(text);
  void fileName;
  return stripped;
}

export interface ImportOptions extends ParseContext {
  /** Force a reader instead of detecting one. */
  formatId?: string;
}

/**
 * Reads a file into canonical transactions.
 *
 * The result always names the reader used and what it could not interpret, so
 * the interface can show the user which platform was recognised and let them
 * override it before anything is written to the ledger.
 */
export function importCsv(text: string, options: ImportOptions): CsvImportResult & { confidence: number; alternatives: DetectedFormat["alternatives"] } {
  const prepared = prepare(text, "");
  const detected = options.formatId
    ? { format: CSV_FORMATS.find((f) => f.id === options.formatId) ?? GENERIC, confidence: 1, alternatives: [] as DetectedFormat["alternatives"] }
    : detectFormat(text);

  if (detected.format.id === BINANCE.id) {
    const r = importBinanceCsv(text, options.accountId, options.selfAddresses ?? new Set());
    return {
      ...r,
      format: BINANCE.id,
      platform: BINANCE.platform,
      confidence: detected.confidence,
      alternatives: detected.alternatives,
    };
  }

  const { rows, errors } = parseRows(prepared);
  if (!rows.length) {
    const empty = finalise(emptyResult(detected.format.id, detected.format.platform), []);
    empty.warnings.push("Le fichier ne contient aucune ligne exploitable.", ...errors);
    return { ...empty, confidence: 0, alternatives: detected.alternatives };
  }

  const result = detected.format.parse(rows, { accountId: options.accountId, selfAddresses: options.selfAddresses, platform: options.platform || detected.format.platform });
  result.warnings.unshift(...errors);
  if (detected.confidence < 0.6) {
    result.warnings.unshift(
      `Format non identifié avec certitude : le fichier a été lu avec le lecteur « ${detected.format.label} ». Vérifiez les premières opérations, ou choisissez le lecteur vous-même.`,
    );
  }
  if (detected.alternatives.some((a) => a.confidence >= detected.confidence - 0.05)) {
    result.warnings.unshift(
      `Plusieurs lecteurs reconnaissent ce fichier (${[detected.format.label, ...detected.alternatives.map((a) => a.label)].join(", ")}). Celui retenu est ${detected.format.label}.`,
    );
  }
  return { ...result, confidence: detected.confidence, alternatives: detected.alternatives };
}

/** Rows shown in the import screen so a user can find the right export. */
export const FORMAT_GUIDE = CSV_FORMATS.filter((f) => f.id !== GENERIC.id).map((f) => ({
  id: f.id,
  platform: f.platform,
  label: f.label,
  where: f.where,
}));
