import Link from "next/link";
import { requireUser } from "@/auth";
import { cockpit, listFirmsForUser, summarise } from "@/lib/services/firms";
import { PageHeader, EmptyState, Stat, Table, Td, Th } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, Globe2, Plus, Users } from "lucide-react";
import { fmtDate } from "@/lib/utils";

export const metadata = { title: "Portefeuille clients" };

const WORKFLOW: Record<string, { label: string; tone: "neutral" | "info" | "warning" | "positive" }> = {
  TODO: { label: "À faire", tone: "neutral" },
  IN_PROGRESS: { label: "En cours", tone: "info" },
  REVIEW: { label: "À réviser", tone: "warning" },
  DONE: { label: "Terminé", tone: "positive" },
};

/**
 * The practice's list.
 *
 * Sorted so that what is waiting on the practice comes first: files with
 * transactions left to qualify, then files under review, then the rest by due
 * date. A partner opens this page to decide where to spend the afternoon, not
 * to browse.
 */
export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ firm?: string; year?: string }> }) {
  const user = await requireUser();
  const { firm, year } = await searchParams;
  const [firms, rows] = await Promise.all([
    listFirmsForUser(user.id),
    cockpit(user.id, { firmId: firm, year: year ? Number(year) : undefined }),
  ]);
  const stats = summarise(rows);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <PageHeader
        eyebrow={firms.length ? firms[0].name : undefined}
        title="Portefeuille clients"
        description="Chaque dossier avec son exercice ouvert, son état et ce qui reste à qualifier. Les dossiers en attente d'une action de votre part sont en tête."
        actions={<Link href="/app/new"><Button><Plus className="h-4 w-4" /> Nouveau dossier</Button></Link>}
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Aucun dossier"
          description="Créez un premier dossier, ou faites-vous inviter sur celui d'un client."
          action={<Link href="/app/new"><Button>Créer un dossier</Button></Link>}
        />
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Dossiers" value={stats.clients} icon={Building2} />
            <Stat label="Opérations à qualifier" value={stats.toQualify} sub={stats.toQualify ? "Un mouvement non qualifié fausse le coût d'acquisition" : "Rien en attente"} tone={stats.toQualify ? "negative" : undefined} />
            <Stat label="Juridictions" value={stats.countries.length} sub={stats.countries.join(" · ")} icon={Globe2} />
            <Stat label="À réviser" value={stats.byWorkflow.REVIEW ?? 0} sub={`${stats.byWorkflow.DONE ?? 0} terminé(s)`} />
          </div>

          {stats.drafts > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">
                  {stats.drafts} dossier{stats.drafts > 1 ? "s" : ""} sous un jeu de règles non relu
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-fg-muted">
                Les règles de ces pays sont encodées à partir des textes cités, avec leurs hypothèses affichées sur chaque calcul, mais aucun professionnel local ne les a validées. Faites-les relire avant de produire une déclaration.
              </CardContent>
            </Card>
          ) : null}

          <Table>
            <thead>
              <tr>
                <Th>Dossier</Th>
                <Th>Pays</Th>
                <Th>Exercice</Th>
                <Th>État</Th>
                <Th className="text-right">À qualifier</Th>
                <Th>Échéance</Th>
                <Th>Dernier calcul</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.entityId} className="hover:bg-surface-2">
                  <Td>
                    <Link href={`/app/${r.entityId}/dashboard`} className="font-medium hover:underline">{r.name}</Link>
                    {r.clientRef ? <span className="ml-2 text-xs text-fg-subtle">{r.clientRef}</span> : null}
                  </Td>
                  <Td>
                    <span className="mr-1" aria-hidden>{r.flag}</span>
                    {r.countryName}
                    <span className="ml-1 text-xs text-fg-subtle">{r.currency}</span>
                    {r.draft ? <Badge tone="warning" className="ml-2">non relu</Badge> : null}
                  </Td>
                  <Td className="text-fg-muted">{r.fiscalYear?.label ?? "—"}</Td>
                  <Td>
                    {r.fiscalYear ? (
                      <Badge tone={WORKFLOW[r.fiscalYear.workflow]?.tone ?? "neutral"}>{WORKFLOW[r.fiscalYear.workflow]?.label ?? r.fiscalYear.workflow}</Badge>
                    ) : "—"}
                  </Td>
                  <Td className={`text-right num tabular ${r.counts.toQualify ? "font-medium text-negative" : "text-fg-subtle"}`}>
                    {r.counts.toQualify || "—"}
                    <span className="ml-1 text-xs text-fg-subtle">/ {r.counts.transactions}</span>
                  </Td>
                  <Td className="text-fg-muted">{r.fiscalYear?.dueDate ? fmtDate(r.fiscalYear.dueDate) : "—"}</Td>
                  <Td className="text-xs text-fg-muted">
                    {r.lastTaxRun ? `Fiscalité ${fmtDate(r.lastTaxRun)}` : r.lastJournalRun ? `Journal ${fmtDate(r.lastJournalRun)}` : "jamais"}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      )}
    </div>
  );
}
