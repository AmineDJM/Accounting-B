import { requireUser } from "@/auth";
import { requireEntity } from "@/lib/dal/entities";
import { listAccounts, listWallets } from "@/lib/dal/accounts";
import { listJobs } from "@/lib/dal/jobs";
import { transactionStats } from "@/lib/dal/transactions";
import { PageHeader } from "@/components/ui/misc";
import { AccountsClient } from "./client";

export const metadata = { title: "Comptes & imports" };

export default async function AccountsPage({ params, searchParams }: { params: Promise<{ entityId: string }>; searchParams: Promise<{ welcome?: string }> }) {
  const { entityId } = await params;
  const { welcome } = await searchParams;
  const user = await requireUser();
  const { entity, role } = await requireEntity(user.id, entityId);
  const [accounts, wallets, jobs, stats] = await Promise.all([listAccounts(user.id, entityId), listWallets(user.id, entityId), listJobs(entityId, 8), transactionStats(entityId)]);
  const canEdit = role === "OWNER" || role === "ADMIN";
  return (
    <>
      <PageHeader title="Comptes & imports" description="Connectez chaque compte d'échange par clé API (lecture seule) ou importez ses exports CSV. Déclarez vos propres adresses pour que les transferts internes ne soient pas comptés comme des ventes." />
      <AccountsClient
        entityId={entityId}
        entityKind={entity.kind}
        canEdit={canEdit}
        welcome={welcome === "1"}
        accounts={accounts.map((a) => ({ id: a.id, label: a.label, exchange: a.exchange, index: a.index, journalCode: a.journalCode, hasApiKey: a.hasApiKey, apiKeyHint: a.apiKeyHint, status: a.status, statusMessage: a.statusMessage, lastSyncAt: a.lastSyncAt?.toISOString() ?? null, txCount: stats.accounts.find((s) => s.id === a.id)?.count ?? 0 }))}
        wallets={wallets.map((w) => ({ id: w.id, address: w.address, network: w.network, label: w.label, kind: w.kind }))}
        jobs={jobs.map((j) => ({ id: j.id, kind: j.kind, status: j.status, progress: j.progress, message: j.message, createdAt: j.createdAt.toISOString(), accountId: j.accountId }))}
      />
    </>
  );
}
