import { requireSignedIn } from "@/auth";
import { engagement, listAccounts, metrics } from "@/lib/services/admin";
import { PageHeader, Stat, Table, Td, Th } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtDate } from "@/lib/utils";

export const metadata = { title: "Activité — administration" };

const n = (v: number) => new Intl.NumberFormat("fr-FR").format(v);

/**
 * Engagement, as opposed to volume.
 *
 * An account that signed in once and imported nothing is not a customer, and a
 * count of accounts hides that. This page ranks accounts by what they actually
 * produced and names the ones that went quiet, because those are the two lists
 * an operator acts on.
 */
export default async function ActivityPage() {
  const { id } = await requireSignedIn();
  const [m, accounts] = await Promise.all([metrics(id), listAccounts(id)]);
  const { active, ranked, neverStarted: never, dormant, producing: withWork } = engagement(accounts);

  return (
    <>
      <PageHeader
        title="Activité"
        description="Ce que les comptes produisent réellement. Un compte qui s'est connecté une fois et n'a rien importé n'est pas un client."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Comptes ayant produit un calcul" value={n(withWork.length)} sub={`sur ${n(active.length)} actifs`} />
        <Stat label="Sans aucun dossier" value={n(never.length)} sub="activés mais jamais démarrés" tone={never.length ? "negative" : undefined} />
        <Stat label="Dormants > 30 jours" value={n(dormant.length)} sub="ont travaillé puis disparu" tone={dormant.length ? "negative" : undefined} />
        <Stat label="Travaux exécutés" value={n(m.work.journalRuns + m.work.taxRuns + m.work.reconciliations)} sub={`${n(m.work.journalRuns)} journaux · ${n(m.work.taxRuns)} fiscalité · ${n(m.work.reconciliations)} DAC8`} />
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Comptes par volume</CardTitle>
          <CardDescription>Les dix premiers, et ce qu&apos;ils ont produit.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <thead>
              <tr><Th>Compte</Th><Th className="text-right">Dossiers</Th><Th className="text-right">Opérations</Th><Th className="text-right">Journaux</Th><Th className="text-right">Fiscalité</Th><Th className="text-right">DAC8</Th><Th>Vu</Th></tr>
            </thead>
            <tbody>
              {ranked.slice(0, 10).map((a) => (
                <tr key={a.id}>
                  <Td><span className="font-medium">{a.email}</span>{a.company ? <span className="block text-xs text-fg-subtle">{a.company}</span> : null}</Td>
                  <Td className="text-right num tabular">{a.usage.entities || "—"}</Td>
                  <Td className="text-right num tabular">{a.usage.transactions ? n(a.usage.transactions) : "—"}</Td>
                  <Td className="text-right num tabular">{a.usage.journalRuns || "—"}</Td>
                  <Td className="text-right num tabular">{a.usage.taxRuns || "—"}</Td>
                  <Td className="text-right num tabular">{a.usage.reconciliations || "—"}</Td>
                  <Td className="whitespace-nowrap text-xs text-fg-muted">{a.lastSeenAt ? fmtDate(a.lastSeenAt) : "jamais"}</Td>
                </tr>
              ))}
              {ranked.length === 0 ? <tr><Td colSpan={7} className="text-fg-subtle">Aucun compte actif.</Td></tr> : null}
            </tbody>
          </Table>
        </CardContent>
      </Card>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Activés mais jamais démarrés</CardTitle>
            <CardDescription>Un compte ouvert qui n&apos;a créé aucun dossier : il manque souvent un pays, ou un accompagnement.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <thead><tr><Th>Compte</Th><Th>Pays ouverts</Th><Th>Activé le</Th></tr></thead>
              <tbody>
                {never.slice(0, 15).map((a) => (
                  <tr key={a.id}>
                    <Td className="font-medium">{a.email}</Td>
                    <Td>{a.countries.length ? a.countries.join(" ") : <Badge tone="warning">aucun</Badge>}</Td>
                    <Td className="text-xs text-fg-muted">{a.activatedAt ? fmtDate(a.activatedAt) : "—"}</Td>
                  </tr>
                ))}
                {never.length === 0 ? <tr><Td colSpan={3} className="text-fg-subtle">Tous les comptes actifs ont démarré.</Td></tr> : null}
              </tbody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Dossiers par juridiction</CardTitle>
            <CardDescription>Où le produit est utilisé, et sous quelles règles.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <thead><tr><Th>Pays</Th><Th className="text-right">Dossiers</Th><Th className="text-right">Comptes</Th></tr></thead>
              <tbody>
                {m.files.byCountry.map((c) => (
                  <tr key={c.country}>
                    <Td><span className="mr-2" aria-hidden>{c.flag}</span>{c.name}</Td>
                    <Td className="text-right num tabular">{n(c.files)}</Td>
                    <Td className="text-right num tabular">{n(c.accounts)}</Td>
                  </tr>
                ))}
                {m.files.byCountry.length === 0 ? <tr><Td colSpan={3} className="text-fg-subtle">Aucun dossier.</Td></tr> : null}
              </tbody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
