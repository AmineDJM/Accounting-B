import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { listFiscalYears, requireEntity } from "@/lib/dal/entities";
import { transactionStats } from "@/lib/dal/transactions";
import { latestRun, listRuns, loadEntries, trialBalance } from "@/lib/services/journal";
import { buildFecRows } from "@/lib/engine/fecbuild";
import { validateFec } from "@/lib/engine/fec";
import { PageHeader } from "@/components/ui/misc";
import { JournalClient } from "./client";

export const metadata = { title: "Journal & FEC" };

export default async function JournalPage({ params, searchParams }: { params: Promise<{ entityId: string }>; searchParams: Promise<{ fy?: string }> }) {
  const { entityId } = await params;
  const { fy } = await searchParams;
  const user = await requireUser();
  const { entity, role } = await requireEntity(user.id, entityId);
  if (entity.kind !== "COMPANY") redirect(`/app/${entityId}/tax`);
  const years = await listFiscalYears(entityId);
  const stats = await transactionStats(entityId);
  const anchor = stats.last ?? new Date();
  const current = years.find((y) => y.id === fy) ?? years.filter((y) => y.startDate <= anchor).at(-1) ?? years[0];
  const run = current ? await latestRun(entityId, current.id) : null;
  const [runs, entries] = await Promise.all([current ? listRuns(entityId, current.id) : Promise.resolve([]), run ? loadEntries(run.id) : Promise.resolve([])]);
  const rows = run ? buildFecRows(entries, { validationDate: run.createdAt }) : [];
  const report = run && current ? validateFec(rows, { start: current.startDate, end: current.endDate }) : null;
  const balance = trialBalance(entries);

  return (
    <>
      <PageHeader title="Journal & FEC" description="Écritures générées selon le PCG (art. 619-12 à 619-15) : jetons en 522, cessions en 7674/6674, inventaire en 4742/4752 avec provision. Chaque génération est conservée." actions={<Link href={`/app/${entityId}/exports`} className="text-sm text-primary hover:underline">Tous les exports →</Link>} />
      <JournalClient
        entityId={entityId}
        canEdit={role !== "VIEWER"}
        years={years.map((y) => ({ id: y.id, label: y.label, start: y.startDate.toISOString(), end: y.endDate.toISOString(), status: y.status }))}
        currentId={current?.id ?? null}
        run={run ? { id: run.id, createdAt: run.createdAt.toISOString(), method: run.method, withInventory: run.withInventory, summary: run.summary as Record<string, unknown>, warnings: run.warnings, inventory: run.inventory as never, realized: run.realized as never } : null}
        runs={runs.map((r) => ({ id: r.id, createdAt: r.createdAt.toISOString(), entries: Number((r.summary as { totals?: { entries?: number } }).totals?.entries ?? 0), withInventory: r.withInventory }))}
        entries={entries.slice(0, 400).map((e) => ({ num: e.num, journalCode: e.journalCode, date: e.date.toISOString(), label: e.label, pieceRef: e.pieceRef, kind: e.kind, lines: e.lines.map((l) => ({ account: l.account, accountLabel: l.accountLabel, label: l.label, debit: l.debit.toFixed(2), credit: l.credit.toFixed(2), currencyAmount: l.currencyAmount?.toString(), currency: l.currency })) }))}
        entriesTotal={entries.length}
        balance={balance.map((b) => ({ account: b.account, label: b.label, debit: b.debit.toFixed(2), credit: b.credit.toFixed(2), balance: b.balance.toFixed(2) }))}
        report={report ? { ok: report.ok, rows: report.rowCount, entries: report.entryCount, totalDebit: report.totalDebit.toFixed(2), totalCredit: report.totalCredit.toFixed(2), issues: report.issues.slice(0, 50) } : null}
      />
    </>
  );
}
