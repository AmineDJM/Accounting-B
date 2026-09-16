import { describe, it, expect } from "vitest";
import { summarise, type ClientRow } from "@/lib/cockpit";

/**
 * The cockpit's counts are the product decision, not a display detail: a
 * partner opens the page to find the file that needs them. The summary lives
 * beside the query, so it is tested on rows rather than against a database.
 */
const row = (over: Partial<ClientRow> & { name: string }): ClientRow => ({
  entityId: over.name, country: "FR", countryName: "France", flag: "🇫🇷",
  currency: "EUR", clientRef: null, kind: "COMPANY", draft: true,
  fiscalYear: { id: "fy", label: "2026", workflow: "TODO", dueDate: null, assigneeId: null },
  counts: { transactions: 10, toQualify: 0 },
  lastJournalRun: null, lastTaxRun: null,
  ...over,
});

const rows = [
  row({ name: "Calme", counts: { transactions: 40, toQualify: 0 }, fiscalYear: { id: "a", label: "2026", workflow: "DONE", dueDate: null, assigneeId: null } }),
  row({ name: "À réviser", fiscalYear: { id: "b", label: "2026", workflow: "REVIEW", dueDate: null, assigneeId: null } }),
  row({ name: "En retard", counts: { transactions: 12, toQualify: 5 } }),
  row({ name: "Suisse", country: "CH", countryName: "Suisse", currency: "CHF" }),
];

describe("cockpit summary", () => {
  it("counts what is waiting across the whole portfolio", () => {
    const s = summarise(rows);
    expect(s.clients).toBe(4);
    expect(s.toQualify).toBe(5);
    expect(s.countries).toEqual(["CH", "FR"]);
    expect(s.drafts).toBe(4);
  });

  it("groups files by their workflow state", () => {
    const s = summarise(rows);
    expect(s.byWorkflow.DONE).toBe(1);
    expect(s.byWorkflow.REVIEW).toBe(1);
    expect(s.byWorkflow.TODO).toBe(2);
  });

  it("keeps a file with no fiscal year rather than dropping it", () => {
    const s = summarise([...rows, row({ name: "Neuf", fiscalYear: null })]);
    expect(s.byWorkflow.NONE).toBe(1);
    expect(s.clients).toBe(5);
  });
});
