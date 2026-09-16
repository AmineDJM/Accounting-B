import { notFound } from "next/navigation";
import { requireUser } from "@/auth";
import { AccessError, listEntitiesForUser, requireEntity } from "@/lib/dal/entities";
import { transactionStats } from "@/lib/dal/transactions";
import { AppShell } from "@/components/app/shell";

export default async function EntityLayout({ children, params }: { children: React.ReactNode; params: Promise<{ entityId: string }> }) {
  const { entityId } = await params;
  const user = await requireUser();
  let membership;
  try {
    membership = await requireEntity(user.id, entityId);
  } catch (e) {
    if (e instanceof AccessError) notFound();
    throw e;
  }
  const [memberships, stats] = await Promise.all([listEntitiesForUser(user.id), transactionStats(entityId)]);
  return (
    <AppShell
      entity={{ id: membership.entity.id, name: membership.entity.name, kind: membership.entity.kind, role: membership.role }}
      entities={memberships.map((m) => ({ id: m.entity.id, name: m.entity.name, kind: m.entity.kind, role: m.role }))}
      user={{ name: user.name, email: user.email, image: user.image }}
      flagged={stats.flagged}
    >
      {children}
    </AppShell>
  );
}
