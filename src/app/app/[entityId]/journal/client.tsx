"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { BookOpen, Download, Play, ShieldCheck, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, EmptyState, Money, Stat, Table, Td, Th } from "@/components/ui/misc";
import { JobPanel, useJob } from "@/components/app/job-progress";
import { fmtDate, fmtEur, fmtNum } from "@/lib/utils";
import { generateJournalAction } from "./actions";

interface Year { id: string; label: string; start: string; end: string; status: string }
interface Run { id: string; createdAt: string; method: string; withInventory: boolean; summary: Record<string, unknown>; warnings: { code: string; level: string; message: string; txId?: string; date?: string }[]; inventory: { asset: string; qty: string; bookValueEur: string; marketPriceEur: string | null; marketValueEur: string | null; latentEur: string | null; provisionEur: string }[]; realized: { txId: string; date: string; asset: string; qty: string; proceedsEur: string; costBasisEur: string; gainEur: string; kind: string }[] }
interface Entry { num: string; journalCode: string; date: string; label: string; pieceRef: string; kind: string; lines: { account: string; accountLabel: string; label: string; debit: string; credit: string; currencyAmount?: string; currency?: string }[] }
interface Report { ok: boolean; rows: number; entries: number; totalDebit: string; totalCredit: string; issues: { level: string; code: string; message: string; row?: number }[] }

export function JournalClient({ entityId, canEdit, years, currentId, run, runs, entries, entriesTotal, balance, report }: { entityId: string; canEdit: boolean; years: Year[]; currentId: string | null; run: Run | null; runs: { id: string; createdAt: string; entries: number; withInventory: boolean }[]; entries: Entry[]; entriesTotal: number; balance: { account: string; label: string; debit: string; credit: string; balance: string }[]; report: Report | null }) {
  const router = useRouter();
  const [withInventory, setWithInventory] = useState(true);
  const [jobId, setJobId] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const job = useJob(entityId, jobId, (j) => { if (j.status === "DONE") toast.success("Journal généré"); else toast.error(j.message ?? "Échec de la génération"); });
  const year = years.find((y) => y.id === currentId);
  const totals = (run?.summary.totals ?? {}) as { debit?: string; credit?: string; entries?: number; lines?: number };
  const realizedTotal = Number(run?.summary.realizedTotal ?? 0);
  const running = job?.status === "RUNNING" || job?.status === "QUEUED";

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-end">
          <div className="w-full md:w-64">
            <label className="text-xs font-medium text-fg-muted">Exercice</label>
            <Select className="mt-1" value={currentId ?? ""} onChange={(e) => router.push(`/app/${entityId}/journal?fy=${e.target.value}`)}>{years.map((y) => <option key={y.id} value={y.id}>{y.label}{y.status === "CLOSED" ? " (clos)" : ""}</option>)}</Select>
          </div>
          <label className="flex items-center gap-2 text-sm"><Switch checked={withInventory} onCheckedChange={setWithInventory} /> Écritures d&apos;inventaire (valorisation à la clôture)</label>
          <div className="md:ml-auto">
            {canEdit ? <Button loading={pending} disabled={!currentId || running} onClick={() => start(async () => { const r = await generateJournalAction(entityId, currentId!, withInventory); if (r.ok) setJobId(r.id); else toast.error(r.error); })}><Play className="h-4 w-4" /> Générer le journal</Button> : null}
          </div>
        </CardContent>
      </Card>
      {job ? <JobPanel job={job} title="Génération du journal" /> : null}

      {!run ? (
        <EmptyState icon={BookOpen} title="Aucun journal généré pour cet exercice" description="La génération télécharge les cours manquants, valorise chaque opération en euros, calcule les plus-values au coût moyen pondéré (ou PEPS) et produit des écritures équilibrées. Comptez quelques minutes la première fois." />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Écritures" value={fmtNum(totals.entries ?? 0, 0)} sub={`${fmtNum(totals.lines ?? 0, 0)} lignes · généré le ${fmtDate(run.createdAt, true)}`} />
            <Stat label="Total débit = crédit" value={fmtEur(totals.debit ?? 0)} sub={totals.debit === totals.credit ? "Journal équilibré" : "Déséquilibre !"} tone={totals.debit === totals.credit ? "positive" : "negative"} />
            <Stat label="Résultat sur cessions" value={<Money value={realizedTotal} signed />} sub="Plus-values − moins-values réalisées (7674 / 6674)" />
            <Stat label="Alertes" value={fmtNum(run.warnings.length, 0)} tone={run.warnings.length ? "negative" : "positive"} sub={run.warnings.length ? "À examiner avant export" : "Aucune"} />
          </div>

          {report ? (
            <Alert tone={report.ok ? "positive" : "negative"} title={report.ok ? `FEC conforme : ${report.rows} lignes, ${report.entries} écritures, débit ${fmtEur(report.totalDebit)} = crédit ${fmtEur(report.totalCredit)}` : `FEC non conforme : ${report.issues.filter((i) => i.level === "error").length} erreur(s)`}>
              <div className="mt-2 flex flex-wrap gap-2">
                <a href={`/api/entities/${entityId}/export/fec/${run.id}`}><Button size="sm" variant={report.ok ? "primary" : "outline"}><Download className="h-4 w-4" /> Télécharger le FEC</Button></a>
                <a href={`/api/entities/${entityId}/export/entries/${run.id}`}><Button size="sm" variant="outline"><Download className="h-4 w-4" /> Écritures (CSV)</Button></a>
                <a href={`/api/entities/${entityId}/export/balance/${run.id}`}><Button size="sm" variant="outline"><Download className="h-4 w-4" /> Balance (CSV)</Button></a>
              </div>
              {report.issues.length ? <ul className="mt-2 list-disc pl-4 text-xs">{report.issues.slice(0, 10).map((i, k) => <li key={k}>{i.level === "error" ? "⛔" : "⚠️"} {i.message}{i.row ? ` (ligne ${i.row})` : ""}</li>)}</ul> : null}
            </Alert>
          ) : null}

          <Tabs defaultValue={run.warnings.length ? "warnings" : "entries"}>
            <TabsList>
              <TabsTrigger value="entries">Écritures</TabsTrigger>
              <TabsTrigger value="balance">Balance</TabsTrigger>
              <TabsTrigger value="inventory">Inventaire</TabsTrigger>
              <TabsTrigger value="realized">Cessions</TabsTrigger>
              <TabsTrigger value="warnings">Alertes {run.warnings.length ? <Badge tone="warning" className="ml-1">{run.warnings.length}</Badge> : null}</TabsTrigger>
              <TabsTrigger value="history">Historique</TabsTrigger>
            </TabsList>

            <TabsContent value="entries">
              <Table>
                <thead><tr><Th>N°</Th><Th>Date</Th><Th>Compte</Th><Th>Libellé</Th><Th className="text-right">Débit</Th><Th className="text-right">Crédit</Th><Th className="hidden lg:table-cell">Devise</Th></tr></thead>
                <tbody>
                  {entries.map((e) => e.lines.map((l, i) => (
                    <tr key={`${e.journalCode}${e.num}-${i}`} className={i === 0 ? "border-t-2 border-border-strong" : ""}>
                      <Td className="num text-xs text-fg-subtle">{i === 0 ? `${e.journalCode} ${e.num}` : ""}</Td>
                      <Td className="whitespace-nowrap text-xs text-fg-muted">{i === 0 ? fmtDate(e.date) : ""}</Td>
                      <Td className="whitespace-nowrap"><span className="num font-medium">{l.account}</span> <span className="text-xs text-fg-muted">{l.accountLabel}</span></Td>
                      <Td className="max-w-md truncate text-xs" title={l.label}>{l.label}</Td>
                      <Td className="num text-right">{Number(l.debit) ? fmtEur(l.debit) : ""}</Td>
                      <Td className="num text-right">{Number(l.credit) ? fmtEur(l.credit) : ""}</Td>
                      <Td className="num hidden text-xs text-fg-subtle lg:table-cell">{l.currencyAmount ? `${fmtNum(l.currencyAmount)} ${l.currency}` : ""}</Td>
                    </tr>
                  )))}
                </tbody>
              </Table>
              {entriesTotal > entries.length ? <p className="mt-2 text-xs text-fg-subtle">Aperçu des {entries.length} premières écritures sur {entriesTotal} : le fichier complet est dans les exports.</p> : null}
            </TabsContent>

            <TabsContent value="balance">
              <Table>
                <thead><tr><Th>Compte</Th><Th>Libellé</Th><Th className="text-right">Débit</Th><Th className="text-right">Crédit</Th><Th className="text-right">Solde</Th></tr></thead>
                <tbody>{balance.map((b) => <tr key={b.account}><Td className="num font-medium">{b.account}</Td><Td>{b.label}</Td><Td className="num text-right">{fmtEur(b.debit)}</Td><Td className="num text-right">{fmtEur(b.credit)}</Td><Td className="text-right"><Money value={b.balance} signed /></Td></tr>)}</tbody>
              </Table>
            </TabsContent>

            <TabsContent value="inventory">
              {run.inventory.length === 0 ? <p className="text-sm text-fg-muted">Aucune position à la clôture.</p> : (
                <Table>
                  <thead><tr><Th>Actif</Th><Th className="text-right">Quantité</Th><Th className="text-right">Valeur comptable</Th><Th className="text-right">Cours de clôture</Th><Th className="text-right">Valeur de marché</Th><Th className="text-right">Écart latent</Th><Th className="text-right">Provision</Th></tr></thead>
                  <tbody>{run.inventory.map((i) => <tr key={i.asset}><Td className="font-medium">{i.asset}</Td><Td className="num text-right">{fmtNum(i.qty)}</Td><Td className="num text-right">{fmtEur(i.bookValueEur)}</Td><Td className="num text-right">{i.marketPriceEur ? fmtEur(i.marketPriceEur, 4) : <Badge tone="warning">manquant</Badge>}</Td><Td className="num text-right">{i.marketValueEur ? fmtEur(i.marketValueEur) : "—"}</Td><Td className="text-right">{i.latentEur ? <Money value={i.latentEur} signed /> : "—"}</Td><Td className="num text-right">{fmtEur(i.provisionEur)}</Td></tr>)}</tbody>
                </Table>
              )}
              <p className="mt-2 text-xs text-fg-subtle">Gains latents au passif (4752), pertes latentes à l&apos;actif (4742) avec provision pour risque (art. 619-12 PCG). Les écritures de contre-passation au premier jour de l&apos;exercice suivant sont incluses dans l&apos;export.</p>
            </TabsContent>

            <TabsContent value="realized">
              <Table>
                <thead><tr><Th>Date</Th><Th>Actif</Th><Th className="text-right">Quantité</Th><Th className="text-right">Prix de cession</Th><Th className="text-right">Coût d&apos;acquisition</Th><Th className="text-right">Résultat</Th><Th>Nature</Th></tr></thead>
                <tbody>{run.realized.slice(0, 300).map((r, i) => <tr key={i}><Td className="whitespace-nowrap text-fg-muted">{fmtDate(r.date)}</Td><Td className="font-medium">{r.asset}</Td><Td className="num text-right">{fmtNum(r.qty)}</Td><Td className="num text-right">{fmtEur(r.proceedsEur)}</Td><Td className="num text-right">{fmtEur(r.costBasisEur)}</Td><Td className="text-right"><Money value={r.gainEur} signed /></Td><Td className="text-xs text-fg-muted">{r.kind === "FEE" ? "frais" : "cession"}</Td></tr>)}</tbody>
              </Table>
            </TabsContent>

            <TabsContent value="warnings">
              {run.warnings.length === 0 ? <Alert tone="positive" title="Aucune alerte"><span className="inline-flex items-center gap-1"><ShieldCheck className="h-4 w-4" /> Toutes les opérations ont un cours et une catégorie.</span></Alert> : (
                <ul className="space-y-2">{run.warnings.slice(0, 200).map((w, i) => (
                  <li key={i} className="flex gap-3 rounded-lg border border-border bg-surface p-3 text-sm">
                    <TriangleAlert className={`mt-0.5 h-4 w-4 shrink-0 ${w.level === "error" ? "text-negative" : "text-warning"}`} />
                    <div className="min-w-0 flex-1"><p>{w.message}</p><p className="mt-0.5 text-xs text-fg-subtle">{w.code}{w.date ? ` · ${fmtDate(w.date, true)}` : ""}{w.txId ? <> · <Link className="text-primary hover:underline" href={`/app/${entityId}/transactions?q=${encodeURIComponent(w.txId)}`}>voir l&apos;opération</Link></> : null}</p></div>
                  </li>
                ))}</ul>
              )}
            </TabsContent>

            <TabsContent value="history">
              <ul className="divide-y divide-border rounded-lg border border-border bg-surface text-sm">{runs.map((r) => <li key={r.id} className="flex items-center gap-3 px-3 py-2"><span className="text-fg-muted">{fmtDate(r.createdAt, true)}</span><span>{fmtNum(r.entries, 0)} écritures</span>{r.withInventory ? <Badge>inventaire</Badge> : null}{r.id === run.id ? <Badge tone="primary">actuel</Badge> : null}<a className="ml-auto text-primary hover:underline" href={`/api/entities/${entityId}/export/fec/${r.id}`}>FEC</a></li>)}</ul>
            </TabsContent>
          </Tabs>
          {year ? <p className="text-xs text-fg-subtle">Exercice du {fmtDate(year.start)} au {fmtDate(year.end)} · méthode {run.method}.</p> : null}
        </>
      )}
    </div>
  );
}
