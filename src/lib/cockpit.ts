/**
 * The practice's view of a client, and the counts drawn from it.
 *
 * Deliberately free of any server dependency: the shape crosses to the browser
 * and the summary is pure arithmetic, so both are testable without a database
 * and importable from a client component.
 */
export interface ClientRow {
  entityId: string;
  name: string;
  country: string;
  countryName: string;
  flag: string;
  currency: string;
  clientRef: string | null;
  kind: string;
  draft: boolean;
  fiscalYear: { id: string; label: string; workflow: string; dueDate: Date | null; assigneeId: string | null } | null;
  counts: { transactions: number; toQualify: number };
  lastJournalRun: Date | null;
  lastTaxRun: Date | null;
}

export type Workflow = "TODO" | "IN_PROGRESS" | "REVIEW" | "DONE";

/** Counts per workflow state, for the cockpit header. */
export function summarise(rows: ClientRow[]) {
  return {
    clients: rows.length,
    toQualify: rows.reduce((a, r) => a + r.counts.toQualify, 0),
    byWorkflow: rows.reduce<Record<string, number>>((acc, r) => {
      const k = r.fiscalYear?.workflow ?? "NONE";
      acc[k] = (acc[k] ?? 0) + 1;
      return acc;
    }, {}),
    countries: [...new Set(rows.map((r) => r.country))].sort(),
    drafts: rows.filter((r) => r.draft).length,
  };
}
