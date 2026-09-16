"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Calculator, Download, Info, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, EmptyState, Money, Stat, Table, Td, Th } from "@/components/ui/misc";
import { JobPanel, useJob } from "@/components/app/job-progress";
import { fmtDate, fmtEur, fmtNum } from "@/lib/utils";
import { computeTaxAction } from "./actions";

export interface TaxResult { computedAt: string; missingPrices: number; totalAcquisitionEur: string; years: { year: number; disposals: number; totalProceedsEur: string; totalGainsEur: string; totalLossesEur: string; netGainEur: string; exempt: boolean; taxablePfuEur: string; estimatedTaxPfuEur: string; estimatedSocialOnlyEur: string }[]; disposals: { txId: string; date: string; asset: string; qty: string; portfolioValueEur: string; grossProceedsEur: string; feesEur: string; netProceedsEur: string; totalAcquisitionEur: string; fractionsPreviouslyDeductedEur: string; netAcquisitionEur: string; fractionEur: string; gainEur: string; warnings: string[] }[]; warnings: string[] }

export function TaxClient({ entityId, canEdit, isCompany, result, jobId: lastJobId, accounts, externalHoldings }: { entityId: string; canEdit: boolean; isCompany: boolean; result: TaxResult | null; jobId: string | null; accounts: { label: string; exchange: string; externalUserId: string | null; createdAt: string }[]; externalHoldings: Record<string, string> }) {
  const [jobId, setJobId] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [year, setYear] = useState<number | null>(null);
  const job = useJob(entityId, jobId, (j) => { if (j.status === "DONE") toast.success("Calcul terminé"); else toast.error(j.message ?? "Échec"); });
  const years = result?.years ?? [];
  const selected = year ?? years.at(-1)?.year ?? null;
  const y = years.find((v) => v.year === selected);
  const disposals = (result?.disposals ?? []).filter((d) => !selected || new Date(d.date).getUTCFullYear() === selected);

  return (
    <div className="space-y-6">
      {isCompany ? <Alert tone="info" title="Dossier entreprise">Ce calcul s&apos;applique aux personnes physiques. Pour une société, utilisez le journal comptable : le résultat de cession y est déterminé par écriture.</Alert> : null}
      <div className="flex flex-wrap items-center gap-3">
        {canEdit ? <Button loading={pending} disabled={job?.status === "RUNNING"} onClick={() => start(async () => { const r = await computeTaxAction(entityId); if (r.ok) setJobId(r.id); else toast.error(r.error); })}><Calculator className="h-4 w-4" /> {result ? "Recalculer" : "Calculer les plus-values"}</Button> : null}
        {result ? <span className="text-sm text-fg-muted">Dernier calcul le {fmtDate(result.computedAt, true)}{result.missingPrices ? ` · ${result.missingPrices} cours manquant(s)` : ""}</span> : null}
        {lastJobId && result ? <a className="ml-auto" href={`/api/entities/${entityId}/export/tax/${lastJobId}`}><Button variant="outline" size="sm"><Download className="h-4 w-4" /> Lignes 2086 (CSV)</Button></a> : null}
      </div>
      {job ? <JobPanel job={job} title="Calcul des plus-values" /> : null}

      {!result ? (
        <EmptyState icon={Receipt} title="Aucun calcul" description="Le calcul valorise chaque cession, la valeur globale du portefeuille au moment de la cession et le prix total d'acquisition net des fractions déjà déduites, puis agrège par année civile." />
      ) : years.length === 0 ? (
        <Alert tone="info" title="Aucune cession imposable">Aucune vente contre euros ni paiement en crypto n&apos;a été trouvé. Les échanges crypto ↔ crypto ne déclenchent pas d&apos;imposition.</Alert>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">{years.map((v) => <button key={v.year} onClick={() => setYear(v.year)} className={`rounded-full border px-3 py-1 text-sm ${v.year === selected ? "border-primary bg-primary-soft text-primary" : "border-border bg-surface text-fg-muted hover:bg-surface-2"}`}>{v.year}{v.exempt ? " · exonéré" : ""}</button>)}</div>
          {y ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Stat label={`Cessions ${y.year}`} value={fmtEur(y.totalProceedsEur)} sub={`${y.disposals} cession(s) · ${y.exempt ? "sous le seuil de 305 €" : "au-dessus de 305 €"}`} />
              <Stat label="Plus-values / moins-values" value={<Money value={y.netGainEur} signed />} sub={`+${fmtEur(y.totalGainsEur)} / −${fmtEur(y.totalLossesEur)}`} />
              <Stat label="Base imposable (PFU)" value={fmtEur(y.taxablePfuEur)} sub={y.exempt ? "Exonération : total des cessions ≤ 305 €" : Number(y.netGainEur) < 0 ? "Moins-value nette : non reportable" : "Case 3AN de la 2042 C"} />
              <Stat label="Impôt estimé (30 %)" value={fmtEur(y.estimatedTaxPfuEur)} sub={`12,8 % IR + 17,2 % PS · option barème : ${fmtEur(y.estimatedSocialOnlyEur)} de PS + IR au TMI`} />
            </div>
          ) : null}

          <Card>
            <CardHeader><CardTitle>Détail des cessions (formulaire 2086)</CardTitle><CardDescription>Une ligne par cession imposable, dans l&apos;ordre chronologique. Les fractions de capital initial déduites lors des cessions antérieures réduisent le prix total d&apos;acquisition.</CardDescription></CardHeader>
            <CardContent className="px-0 pb-0">
              <Table className="rounded-none border-0">
                <thead><tr><Th>Date</Th><Th>Actif</Th><Th className="text-right">Qté</Th><Th className="text-right">Valeur portefeuille</Th><Th className="text-right">Prix de cession</Th><Th className="text-right">Frais</Th><Th className="text-right">Prix net</Th><Th className="text-right">PTA net</Th><Th className="text-right">Fraction</Th><Th className="text-right">PV / MV</Th></tr></thead>
                <tbody>{disposals.map((d) => (
                  <tr key={d.txId} className={d.warnings.length ? "bg-warning-soft/30" : ""}>
                    <Td className="whitespace-nowrap text-fg-muted">{fmtDate(d.date)}</Td><Td className="font-medium">{d.asset}</Td><Td className="num text-right">{fmtNum(d.qty)}</Td><Td className="num text-right">{fmtEur(d.portfolioValueEur)}</Td><Td className="num text-right">{fmtEur(d.grossProceedsEur)}</Td><Td className="num text-right">{fmtEur(d.feesEur)}</Td><Td className="num text-right">{fmtEur(d.netProceedsEur)}</Td><Td className="num text-right">{fmtEur(d.netAcquisitionEur)}</Td><Td className="num text-right">{fmtEur(d.fractionEur)}</Td><Td className="text-right"><Money value={d.gainEur} signed /></Td>
                  </tr>
                ))}</tbody>
              </Table>
            </CardContent>
          </Card>
          {result.warnings.length ? <Alert tone="warning" title={`${result.warnings.length} avertissement(s)`}><ul className="list-disc pl-4">{result.warnings.slice(0, 10).map((w, i) => <li key={i}>{w}</li>)}</ul></Alert> : null}
        </>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Comptes à déclarer (formulaire 3916-bis)</CardTitle><CardDescription>Tout compte d&apos;actifs numériques ouvert, détenu, utilisé ou clos à l&apos;étranger doit être déclaré chaque année, même fermé en cours d&apos;année (art. 1649 bis C CGI, amende de 750 € par compte omis).</CardDescription></CardHeader>
          <CardContent>
            {accounts.length === 0 ? <p className="text-sm text-fg-subtle">Aucun compte.</p> : (
              <ul className="divide-y divide-border text-sm">{accounts.map((a, i) => <li key={i} className="flex items-center justify-between py-2"><span>{a.label} <Badge className="ml-1">{a.exchange === "BINANCE" ? "Binance" : "Autre"}</Badge></span><span className="text-xs text-fg-subtle">{a.externalUserId ? `ID ${a.externalUserId}` : "ID utilisateur : voir l'export CSV"}</span></li>)}</ul>
            )}
            <p className="mt-3 text-xs text-fg-subtle">Binance : Binance France SAS (PSAN jusqu&apos;au 30/06/2026) puis entité hors UE — indiquez l&apos;adresse figurant dans vos conditions d&apos;utilisation. Vérifiez la désignation exacte avec votre conseil.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Avoirs hors des comptes importés</CardTitle><CardDescription>La valeur globale du portefeuille inclut tous vos actifs numériques (wallets, autres plateformes). Déclarez-les dans les paramètres pour un calcul exact.</CardDescription></CardHeader>
          <CardContent>
            {Object.keys(externalHoldings).length ? <ul className="text-sm">{Object.entries(externalHoldings).map(([a, q]) => <li key={a} className="flex justify-between py-1"><span>{a}</span><span className="num">{fmtNum(q)}</span></li>)}</ul> : <p className="text-sm text-fg-subtle">Aucun avoir externe déclaré.</p>}
            <Link href={`/app/${entityId}/settings#external`} className="mt-3 inline-flex items-center gap-1 text-sm text-primary hover:underline"><Info className="h-4 w-4" /> Modifier dans les paramètres</Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
