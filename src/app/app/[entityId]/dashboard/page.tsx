import Link from "next/link";
import { ArrowRight, CircleAlert, Coins, ListOrdered, RefreshCw, Wallet } from "lucide-react";
import { requireUser } from "@/auth";
import { requireEntity } from "@/lib/dal/entities";
import { listAccounts } from "@/lib/dal/accounts";
import { loadDashboard } from "@/lib/services/dashboard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, EmptyState, Money, PageHeader, Stat, Table, Td, Th } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FlowsChart, PortfolioChart } from "@/components/app/charts";
import { fmtDate, fmtEur, fmtNum, fmtPct, TX_TYPE_LABELS } from "@/lib/utils";

export const metadata = { title: "Tableau de bord" };

export default async function DashboardPage({ params }: { params: Promise<{ entityId: string }> }) {
  const { entityId } = await params;
  const user = await requireUser();
  const { entity } = await requireEntity(user.id, entityId);
  const [data, accounts] = await Promise.all([loadDashboard(user.id, entityId), listAccounts(user.id, entityId)]);
  const base = `/app/${entityId}`;
  const lastSync = accounts.map((a) => a.lastSyncAt).filter(Boolean).sort().at(-1) as Date | undefined;

  if (accounts.length === 0) {
    return (
      <>
        <PageHeader title={`Bonjour, ${entity.name}`} description="Commencez par connecter un compte d'échange ou importer un export CSV." />
        <EmptyState icon={Wallet} title="Aucun compte connecté" description="Ajoutez votre compte Binance (clé API en lecture seule) ou importez l'export « Transaction History ». Tout l'historique est nécessaire pour un coût d'acquisition exact." action={<Link href={`${base}/accounts?welcome=1`}><Button>Connecter un compte <ArrowRight className="h-4 w-4" /></Button></Link>} />
      </>
    );
  }

  const todo: { text: string; href: string }[] = [];
  if (data.stats.total === 0) todo.push({ text: "Importer les transactions (synchronisation API ou CSV)", href: `${base}/accounts` });
  if (data.stats.flagged > 0) todo.push({ text: `${data.stats.flagged} opération(s) à qualifier (transferts, paiements, réceptions)`, href: `${base}/transactions?reviewStatus=FLAGGED` });
  if (data.missingPrices.length > 0) todo.push({ text: `Cours manquants pour ${data.missingPrices.slice(0, 5).join(", ")}${data.missingPrices.length > 5 ? "…" : ""} — lancez une génération pour télécharger les cours`, href: entity.kind === "COMPANY" ? `${base}/journal` : `${base}/tax` });
  if (data.stats.total > 0) todo.push({ text: entity.kind === "COMPANY" ? "Générer le journal de l'exercice et télécharger le FEC" : "Calculer les plus-values de l'année (formulaire 2086)", href: entity.kind === "COMPANY" ? `${base}/journal` : `${base}/tax` });

  return (
    <>
      <PageHeader title="Tableau de bord" description={`${entity.kind === "COMPANY" ? "Société" : "Particulier"} · méthode ${entity.costMethod === "CUMP" ? "coût moyen pondéré" : "PEPS"} · ${accounts.length} compte${accounts.length > 1 ? "s" : ""}`} actions={<Link href={`${base}/accounts`}><Button variant="outline" size="sm"><RefreshCw className="h-4 w-4" /> Synchroniser</Button></Link>} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Valeur du portefeuille" value={fmtEur(data.totalValueEur)} sub={data.missingPrices.length ? `${data.missingPrices.length} actif(s) sans cours` : `Cours au ${fmtDate(data.pricedAt, true)}`} icon={Coins} />
        <Stat label="Transactions" value={fmtNum(data.stats.total, 0)} sub={data.stats.first ? `du ${fmtDate(data.stats.first)} au ${fmtDate(data.stats.last!)}` : "Aucune donnée"} icon={ListOrdered} />
        <Stat label="À qualifier" value={fmtNum(data.stats.flagged, 0)} tone={data.stats.flagged ? "negative" : "positive"} sub={data.stats.flagged ? "Réceptions / envois sans catégorie" : "Tout est catégorisé"} icon={CircleAlert} />
        <Stat label="Dernière synchronisation" value={lastSync ? fmtDate(lastSync) : "—"} sub={lastSync ? fmtDate(lastSync, true) : "Import CSV ou API"} icon={RefreshCw} />
      </div>

      {todo.length ? (
        <Card className="mt-6">
          <CardHeader><CardTitle>À faire</CardTitle><CardDescription>Les étapes qui restent avant des comptes complets.</CardDescription></CardHeader>
          <CardContent>
            <ul className="divide-y divide-border">
              {todo.map((t) => (
                <li key={t.text}><Link href={t.href} className="flex items-center justify-between gap-3 py-2.5 text-sm hover:text-primary"><span>{t.text}</span><ArrowRight className="h-4 w-4 shrink-0 text-fg-subtle" /></Link></li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Valeur du portefeuille</CardTitle><CardDescription>12 derniers mois, au cours de clôture quotidien (cache).</CardDescription></CardHeader>
          <CardContent><PortfolioChart data={data.timeline} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Flux fiat</CardTitle><CardDescription>Dépôts et retraits en euros par mois.</CardDescription></CardHeader>
          <CardContent><FlowsChart data={data.monthlyFlows} /></CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader><CardTitle>Positions</CardTitle><CardDescription>Quantités calculées à partir des transactions importées.</CardDescription></CardHeader>
          <CardContent className="px-0 pb-0">
            {data.holdings.length === 0 ? <p className="px-5 pb-5 text-sm text-fg-subtle">Aucune position.</p> : (
              <Table className="rounded-none border-0">
                <thead><tr><Th>Actif</Th><Th className="text-right">Quantité</Th><Th className="text-right">Cours</Th><Th className="text-right">Valeur</Th><Th className="w-32">Part</Th></tr></thead>
                <tbody>
                  {data.holdings.slice(0, 12).map((h) => (
                    <tr key={h.asset}>
                      <Td className="font-medium">{h.asset}</Td>
                      <Td className="num text-right">{fmtNum(h.qty)}</Td>
                      <Td className="num text-right text-fg-muted">{h.priceEur ? fmtEur(h.priceEur, Number(h.priceEur) < 1 ? 4 : 2) : <Badge tone="warning">n/d</Badge>}</Td>
                      <Td className="text-right"><Money value={h.valueEur} /></Td>
                      <Td><div className="flex items-center gap-2"><div className="h-1.5 flex-1 rounded-full bg-surface-2"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.round(h.share * 100)}%` }} /></div><span className="w-12 text-right text-xs text-fg-muted">{fmtPct(h.share, 0)}</span></div></Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Répartition des opérations</CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {Object.entries(data.stats.byType).sort((a, b) => b[1] - a[1]).map(([t, n]) => (
                <li key={t} className="flex items-center justify-between"><span className="text-fg-muted">{TX_TYPE_LABELS[t] ?? t}</span><span className="num font-medium">{fmtNum(n, 0)}</span></li>
              ))}
              {data.stats.total === 0 ? <li className="text-fg-subtle">Aucune transaction.</li> : null}
            </ul>
            {data.stats.accounts.length > 1 ? (
              <ul className="mt-4 space-y-1 border-t border-border pt-3 text-xs text-fg-muted">
                {data.stats.accounts.map((a) => <li key={a.id} className="flex justify-between"><span>{a.label}</span><span className="num">{fmtNum(a.count, 0)}</span></li>)}
              </ul>
            ) : null}
          </CardContent>
        </Card>
      </div>
      {entity.kind === "INDIVIDUAL" ? <Alert className="mt-6" tone="info" title="Périmètre">La valeur globale du portefeuille (art. 150 VH bis) doit inclure tous vos actifs numériques, y compris ceux détenus hors des comptes importés. Déclarez vos avoirs externes dans les paramètres.</Alert> : null}
    </>
  );
}
