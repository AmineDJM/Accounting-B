import { notFound } from "next/navigation";
import { requireUser } from "@/auth";
import { AccessError, listEntitiesForUser, requireEntity } from "@/lib/dal/entities";
import { transactionStats } from "@/lib/dal/transactions";
import { AppShell } from "@/components/app/shell";
import { ViewAsBanner } from "@/components/app/view-as-banner";
import { getPack } from "@/lib/countries/registry";

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
    <>
      {user.viewingAs ? (
        <ViewAsBanner
          target={user.email ?? user.name ?? "ce compte"}
          admin={user.viewingAs.adminEmail ?? "administrateur"}
          expiresLabel={new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(user.viewingAs.expiresAt)}
          reason={user.viewingAs.reason}
        />
      ) : null}
    <AppShell
      entity={{ id: membership.entity.id, name: membership.entity.name, kind: membership.entity.kind, role: membership.role, country: membership.entity.country, flag: getPack(membership.entity.country).flag }}
      entities={memberships.map((m) => ({ id: m.entity.id, name: m.entity.name, kind: m.entity.kind, role: m.role, country: m.entity.country, flag: getPack(m.entity.country).flag }))}
      user={{ name: user.name, email: user.email, image: user.image, isAdmin: user.role === "SUPER_ADMIN" && !user.viewingAs }}
      flagged={stats.flagged}
    >
      {children}
    </AppShell>
    </>
  );
}
