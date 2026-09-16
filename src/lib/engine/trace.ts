/**
 * Explainability: every computed figure carries the reasoning that produced it.
 *
 * A `TraceStep` is a serialisable node (stored in job results, rendered in the
 * UI, exported in the audit pack) describing one computation: its label, the
 * formula applied, the inputs used, the result, and the legal texts it relies
 * on. Steps nest, so a yearly total can be expanded down to a single trade and
 * the exact price quote used to value it.
 */

export type CountryCode = "FR" | "ES" | "IT" | "DE" | "AT" | "PT" | "BE" | "NL" | "CH" | "AE" | "OM" | "QA";

export interface LegalRef {
  /** Jurisdiction the reference belongs to, or "EU" / "OECD" for supranational texts. */
  jurisdiction: CountryCode | "EU" | "OECD";
  /** Short citation as a professional would write it, in the local language. */
  code: string;
  /** Optional plain-language title. */
  title?: string;
  url?: string;
  /** Publication or last-update date of the source consulted (ISO). */
  asOf?: string;
}

export type TraceUnit = "MONEY" | "QTY" | "RATE" | "DAYS" | "COUNT" | "DATE" | "TEXT";

export interface TraceValue {
  label: string;
  /** Formatted for display. */
  value: string;
  /** Exact decimal string, when the value is numeric. */
  raw?: string;
  unit?: TraceUnit;
  currency?: string;
  /** Pointer to the underlying object: transaction id, price source, form box… */
  ref?: string;
  note?: string;
}

export interface TraceStep {
  key: string;
  label: string;
  /** Formula in the notation of the local rule, e.g. "PV = P − PTA × P / V". */
  formula?: string;
  inputs: TraceValue[];
  output?: TraceValue;
  note?: string;
  refs: LegalRef[];
  steps: TraceStep[];
  /** Set when the step relies on an assumption the user should check. */
  warning?: string;
}

export interface StepOptions {
  formula?: string;
  inputs?: TraceValue[];
  output?: TraceValue;
  note?: string;
  refs?: LegalRef[];
  steps?: TraceStep[];
  warning?: string;
}

export function step(key: string, label: string, opts: StepOptions = {}): TraceStep {
  return {
    key,
    label,
    formula: opts.formula,
    inputs: opts.inputs ?? [],
    output: opts.output,
    note: opts.note,
    refs: opts.refs ?? [],
    steps: opts.steps ?? [],
    warning: opts.warning,
  };
}

export const money = (label: string, raw: string, currency: string, ref?: string): TraceValue => ({ label, value: formatMoney(raw, currency), raw, unit: "MONEY", currency, ref });
export const qty = (label: string, raw: string, asset?: string, ref?: string): TraceValue => ({ label, value: `${trimNum(raw)}${asset ? ` ${asset}` : ""}`, raw, unit: "QTY", ref });
export const rate = (label: string, raw: string, ref?: string): TraceValue => ({ label, value: `${trimNum(String(Number(raw) * 100))} %`, raw, unit: "RATE", ref });
export const days = (label: string, n: number, ref?: string): TraceValue => ({ label, value: `${n} j`, raw: String(n), unit: "DAYS", ref });
export const count = (label: string, n: number, ref?: string): TraceValue => ({ label, value: String(n), raw: String(n), unit: "COUNT", ref });
export const date = (label: string, d: Date | string, ref?: string): TraceValue => ({ label, value: typeof d === "string" ? d.slice(0, 10) : d.toISOString().slice(0, 10), raw: typeof d === "string" ? d : d.toISOString(), unit: "DATE", ref });
export const text = (label: string, value: string, ref?: string): TraceValue => ({ label, value, unit: "TEXT", ref });

function trimNum(raw: string): string {
  const n = Number(raw);
  if (!isFinite(n)) return raw;
  const digits = Math.abs(n) >= 1000 ? 2 : Math.abs(n) >= 1 ? 4 : 8;
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: digits }).format(n);
}

export function formatMoney(raw: string, currency: string): string {
  const n = Number(raw);
  if (!isFinite(n)) return `${raw} ${currency}`;
  try {
    return new Intl.NumberFormat("fr-FR", { style: "currency", currency, maximumFractionDigits: 2 }).format(n);
  } catch {
    return `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(n)} ${currency}`;
  }
}

/** Flattens a trace into readable lines, used for the CSV/PDF audit pack. */
export function flattenTrace(root: TraceStep, depth = 0): { depth: number; label: string; detail: string; refs: string }[] {
  const detail = [
    root.formula ? `= ${root.formula}` : "",
    root.inputs.map((i) => `${i.label} : ${i.value}`).join(" · "),
    root.output ? `→ ${root.output.value}` : "",
    root.note ?? "",
    root.warning ? `⚠ ${root.warning}` : "",
  ].filter(Boolean).join("  |  ");
  const here = [{ depth, label: root.label, detail, refs: root.refs.map((r) => r.code).join(", ") }];
  return here.concat(...root.steps.map((s) => flattenTrace(s, depth + 1)));
}

/** Collects the distinct legal references cited anywhere in a trace. */
export function collectRefs(roots: TraceStep[]): LegalRef[] {
  const seen = new Map<string, LegalRef>();
  const walk = (s: TraceStep) => {
    for (const r of s.refs) seen.set(`${r.jurisdiction}|${r.code}`, r);
    s.steps.forEach(walk);
  };
  roots.forEach(walk);
  return [...seen.values()].sort((a, b) => a.jurisdiction.localeCompare(b.jurisdiction) || a.code.localeCompare(b.code));
}
