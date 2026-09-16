import { requireUser } from "@/auth";
import { requireEntity } from "@/lib/dal/entities";
import { listAccounts } from "@/lib/dal/accounts";
import { listTransactions } from "@/lib/dal/transactions";
import { PageHeader } from "@/components/ui/misc";
import { TransactionsClient, type TxView } from "./client";

export const metadata = { title: "Transactions" };

export default async function TransactionsPage({ params, searchParams }: { params: Promise<{ entityId: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { entityId } = await params;
  const sp = await searchParams;
  const user = await requireUser();
  const { role } = await requireEntity(user.id, entityId);
  const filter = {
    accountId: sp.accountId || undefined, type: sp.type || undefined, category: sp.category || undefined, asset: sp.asset || undefined, q: sp.q || undefined,
    reviewStatus: (sp.reviewStatus as "AUTO" | "REVIEWED" | "FLAGGED" | undefined) || undefined,
    from: sp.from ? new Date(sp.from) : undefined, to: sp.to ? new Date(`${sp.to}T23:59:59Z`) : undefined,
    page: Number(sp.page ?? 1), pageSize: Number(sp.pageSize ?? 50),
  };
  const [accounts, list] = await Promise.all([listAccounts(user.id, entityId), listTransactions(user.id, entityId, filter)]);
  const rows: TxView[] = list.rows.map((r) => ({
    id: r.id, accountId: r.accountId, source: r.source, timestamp: r.timestamp.toISOString(), type: r.type, category: r.category, legs: r.legs, counterparty: r.counterparty, ref: r.ref, note: r.note, reviewStatus: r.reviewStatus,
  }));
  return (
    <>
      <PageHeader title="Transactions" description="Toutes les opérations importées, normalisées en entrées / sorties / frais. Qualifiez les réceptions et envois pour que le journal soit juste." />
      <TransactionsClient entityId={entityId} rows={rows} total={list.total} page={list.page} pageSize={list.pageSize} filters={sp} accounts={accounts.map((a) => ({ id: a.id, label: a.label }))} canEdit={role !== "VIEWER"} />
    </>
  );
}
