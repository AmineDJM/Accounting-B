import { desc, and, eq } from "drizzle-orm";
import { requireUser } from "@/auth";
import { getDb } from "@/lib/db";
import { jobs } from "@/lib/db/schema";
import { requireEntity } from "@/lib/dal/entities";
import { listAccounts } from "@/lib/dal/accounts";
import { PageHeader } from "@/components/ui/misc";
import { TaxClient, type TaxResult } from "./client";

export const metadata = { title: "Plus-values (2086)" };

export default async function TaxPage({ params }: { params: Promise<{ entityId: string }> }) {
  const { entityId } = await params;
  const user = await requireUser();
  const { entity, role } = await requireEntity(user.id, entityId);
  const db = await getDb();
  const [last] = await db.select().from(jobs).where(and(eq(jobs.entityId, entityId), eq(jobs.kind, "PRICING"), eq(jobs.status, "DONE"))).orderBy(desc(jobs.createdAt)).limit(1);
  const accounts = await listAccounts(user.id, entityId);
  return (
    <>
      <PageHeader title="Plus-values sur actifs numériques" description="Article 150 VH bis du CGI : seules les cessions contre une monnaie ayant cours légal ou contre un bien/service sont imposables. Les échanges entre actifs numériques (stablecoins compris) sont en sursis." />
      <TaxClient entityId={entityId} canEdit={role !== "VIEWER"} isCompany={entity.kind === "COMPANY"} result={(last?.result as TaxResult | null) ?? null} jobId={last?.id ?? null} accounts={accounts.map((a) => ({ label: a.label, exchange: a.exchange, externalUserId: a.externalUserId, createdAt: a.createdAt.toISOString() }))} externalHoldings={((entity.settings ?? {}) as { externalHoldings?: Record<string, string> }).externalHoldings ?? {}} />
    </>
  );
}
