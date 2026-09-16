import { requireSignedIn } from "@/auth";
import { impersonationHistory, recentAudit } from "@/lib/services/admin";
import { PageHeader, Table, Td, Th } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtDate } from "@/lib/utils";

export const metadata = { title: "Journal d'audit — administration" };

const ACTION_TONE = (action: string): "neutral" | "warning" | "negative" | "primary" =>
  action.startsWith("platform.impersonate") ? "warning"
    : action.includes("delete") || action.includes("status") ? "negative"
      : action.startsWith("platform.") ? "primary"
        : "neutral";

export default async function AuditPage() {
  const { id } = await requireSignedIn();
  const [entries, views] = await Promise.all([recentAudit(id, 150), impersonationHistory(id, 50)]);

  return (
    <>
      <PageHeader
        title="Journal d'audit"
        description="Tout ce qui a été fait sur la plateforme et sur les dossiers. Les consultations de comptes clients sont listées à part, parce que ce sont celles qu'un titulaire peut demander à voir."
      />

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Consultations de comptes</CardTitle>
          <CardDescription>Qui a regardé quel compte, quand, pourquoi, et pendant combien de temps.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <thead><tr><Th>Début</Th><Th>Administrateur</Th><Th>Compte consulté</Th><Th>Motif</Th><Th>Durée</Th><Th /></tr></thead>
            <tbody>
              {views.map((v) => {
                const minutes = v.endedAt ? Math.round((v.endedAt.getTime() - v.startedAt.getTime()) / 60000) : null;
                return (
                  <tr key={v.id}>
                    <Td className="whitespace-nowrap text-fg-muted">{fmtDate(v.startedAt, true)}</Td>
                    <Td>{v.admin?.email ?? "—"}</Td>
                    <Td className="font-medium">{v.target?.email ?? "—"}</Td>
                    <Td className="text-fg-muted">{v.reason}</Td>
                    <Td className="num tabular">{minutes === null ? "—" : `${minutes} min`}</Td>
                    <Td>{v.open ? <Badge tone="warning">en cours</Badge> : <Badge tone="neutral">terminée</Badge>}</Td>
                  </tr>
                );
              })}
              {views.length === 0 ? <tr><Td colSpan={6} className="text-fg-subtle">Aucune consultation enregistrée.</Td></tr> : null}
            </tbody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Événements</CardTitle>
          <CardDescription>Les 150 derniers, du plus récent au plus ancien.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <thead><tr><Th>Quand</Th><Th>Action</Th><Th>Par</Th><Th>Dossier</Th><Th>Détail</Th></tr></thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id}>
                  <Td className="whitespace-nowrap text-fg-muted">{fmtDate(e.createdAt, true)}</Td>
                  <Td><Badge tone={ACTION_TONE(e.action)}>{e.action}</Badge></Td>
                  <Td className="text-fg-muted">{e.userEmail ?? e.userName ?? "système"}</Td>
                  <Td className="font-mono text-xs text-fg-subtle">{e.entityId ? e.entityId.slice(0, 8) : "—"}</Td>
                  <Td className="max-w-md truncate text-xs text-fg-muted" title={JSON.stringify(e.details)}>
                    {Object.entries(e.details ?? {}).map(([k, v]) => `${k}=${typeof v === "object" ? JSON.stringify(v) : String(v)}`).join(" · ") || "—"}
                  </Td>
                </tr>
              ))}
              {entries.length === 0 ? <tr><Td colSpan={5} className="text-fg-subtle">Rien à afficher.</Td></tr> : null}
            </tbody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
