import Link from "next/link";
import { AlertTriangle, Building2, Eye, FileCheck2, Globe2, TrendingUp, Users } from "lucide-react";
import { requireSignedIn } from "@/auth";
import { metrics } from "@/lib/services/admin";
import { PageHeader, Stat, Table, Td, Th } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtDate } from "@/lib/utils";

export const metadata = { title: "Vue d'ensemble — administration" };

const n = (v: number) => new Intl.NumberFormat("fr-FR").format(v);

export default async function AdminOverview() {
  const { id } = await requireSignedIn();
  const m = await metrics(id);
  const peak = Math.max(1, ...m.activity.map((a) => a.transactions));
  const failedJobs = m.jobs.filter((j) => j.status === "FAILED").reduce((a, j) => a + j.n, 0);
  const runningJobs = m.jobs.filter((j) => j.status === "RUNNING" || j.status === "QUEUED").reduce((a, j) => a + j.n, 0);

  return (
    <>
      <PageHeader
        title="Vue d'ensemble"
        description="Qui utilise le service, ce qu'il en produit, et ce qui ne marche pas. Les trois questions dans cet ordre."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Comptes actifs"
          value={n(m.accounts.active)}
          sub={`${n(m.accounts.invited)} en attente · ${n(m.accounts.suspended)} désactivé(s) · ${n(m.accounts.admins)} admin`}
          icon={Users}
        />
        <Stat
          label="Vus ces 7 jours"
          value={n(m.accounts.seenLast7)}
          sub={`${n(m.accounts.seenLast30)} sur 30 jours · ${n(m.accounts.createdLast30)} créé(s) ce mois`}
          icon={TrendingUp}
        />
        <Stat
          label="Dossiers"
          value={n(m.files.total)}
          sub={`${n(m.files.companies)} entreprise(s) · ${n(m.files.individuals)} particulier(s)`}
          icon={Building2}
        />
        <Stat
          label="Juridictions ouvertes"
          value={n(m.files.byCountry.length)}
          sub={m.files.byCountry.slice(0, 5).map((c) => c.country).join(" · ") || "aucune"}
          icon={Globe2}
        />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Opérations importées" value={n(m.work.transactions)} sub={`${n(m.work.exchangeAccounts)} compte(s) connecté(s)`} />
        <Stat label="Journaux générés" value={n(m.work.journalRuns)} sub={`${n(m.work.taxRuns)} calcul(s) fiscaux`} icon={FileCheck2} />
        <Stat label="Rapprochements DAC8" value={n(m.work.reconciliations)} sub={`${n(m.work.statements)} relevé(s) importé(s)`} />
        <Stat
          label="Travaux en échec"
          value={n(failedJobs)}
          sub={runningJobs ? `${n(runningJobs)} en cours` : "rien en cours"}
          tone={failedJobs ? "negative" : undefined}
          icon={AlertTriangle}
        />
      </div>

      {m.draftExposure.length ? (
        <Card className="mt-6 border-warning-soft">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 text-warning" aria-hidden />
              {n(m.draftExposure.reduce((a, c) => a + c.files, 0))} dossier(s) sous un jeu de règles non relu
            </CardTitle>
            <CardDescription>
              Le registre de risque de l&apos;exploitant : ces dossiers produisent des chiffres à partir de textes encodés mais non validés par un professionnel local. Faire relire un pack retire toute sa ligne.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {m.draftExposure.map((c) => (
                <span key={c.country} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1 text-sm">
                  <span aria-hidden>{c.flag}</span>
                  {c.name}
                  <Badge tone="warning">{n(c.files)}</Badge>
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="mt-6 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Opérations importées, 30 derniers jours</CardTitle>
            <CardDescription>Le meilleur signal d&apos;usage réel : un compte qui importe est un compte qui travaille.</CardDescription>
          </CardHeader>
          <CardContent>
            {m.activity.length === 0 ? (
              <p className="text-sm text-fg-subtle">Aucun import sur la période.</p>
            ) : (
              <div className="flex h-40 items-end gap-1" role="img" aria-label="Histogramme des imports quotidiens">
                {m.activity.map((a) => (
                  // The wrapper needs its own height: a percentage height
                  // inside a box with none resolves to zero and the bar
                  // disappears.
                  <div key={a.day} className="group relative flex h-full flex-1 items-end" title={`${a.day} : ${n(a.transactions)} opération(s)`}>
                    <div className="w-full rounded-t bg-primary/80 transition-colors group-hover:bg-primary" style={{ height: `${Math.max(3, (a.transactions / peak) * 100)}%` }} />
                  </div>
                ))}
              </div>
            )}
            <p className="mt-2 text-xs text-fg-subtle">
              {n(m.activity.reduce((a, d) => a + d.transactions, 0))} opération(s) importée(s) sur {m.activity.length} jour(s) d&apos;activité.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Eye className="h-4 w-4 text-fg-subtle" aria-hidden /> Consultations de comptes</CardTitle>
            <CardDescription>Chaque fois qu&apos;un administrateur regarde le service à travers un compte client.</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="space-y-2 text-sm">
              <div className="flex items-baseline justify-between">
                <dt className="text-fg-muted">Sessions ouvertes</dt>
                <dd className={`num tabular font-medium ${m.impersonations.open ? "text-warning" : ""}`}>{n(m.impersonations.open)}</dd>
              </div>
              <div className="flex items-baseline justify-between">
                <dt className="text-fg-muted">Sur 30 jours</dt>
                <dd className="num tabular font-medium">{n(m.impersonations.last30)}</dd>
              </div>
            </dl>
            <Link href="/admin/audit" className="mt-3 inline-block text-sm text-primary hover:underline">Voir le journal →</Link>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Répartition par juridiction</CardTitle>
          <CardDescription>Où le produit est réellement utilisé, ce qui n&apos;est pas toujours là où on l&apos;attend.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <thead><tr><Th>Pays</Th><Th className="text-right">Dossiers</Th><Th className="text-right">Comptes</Th><Th>Règles</Th></tr></thead>
            <tbody>
              {m.files.byCountry.map((c) => (
                <tr key={c.country}>
                  <Td><span className="mr-2" aria-hidden>{c.flag}</span>{c.name}</Td>
                  <Td className="text-right num tabular">{n(c.files)}</Td>
                  <Td className="text-right num tabular">{n(c.accounts)}</Td>
                  <Td>{m.draftExposure.some((d) => d.country === c.country) ? <Badge tone="warning">non relues</Badge> : <Badge tone="positive">relues</Badge>}</Td>
                </tr>
              ))}
              {m.files.byCountry.length === 0 ? <tr><Td colSpan={4} className="text-fg-subtle">Aucun dossier.</Td></tr> : null}
            </tbody>
          </Table>
        </CardContent>
      </Card>

      {m.failures.length ? (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Derniers échecs</CardTitle>
            <CardDescription>Un import ou un calcul qui échoue est un client bloqué qui ne le signalera pas forcément.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <thead><tr><Th>Quand</Th><Th>Type</Th><Th>Dossier</Th><Th>Message</Th></tr></thead>
              <tbody>
                {m.failures.map((f) => (
                  <tr key={f.id}>
                    <Td className="whitespace-nowrap text-fg-muted">{fmtDate(f.at, true)}</Td>
                    <Td><Badge tone="neutral">{f.kind}</Badge></Td>
                    <Td className="font-mono text-xs text-fg-subtle">{f.entityId.slice(0, 8)}</Td>
                    <Td className="text-fg-muted">{f.message ?? "—"}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}
