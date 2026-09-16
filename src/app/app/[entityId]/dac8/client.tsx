"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, FileUp, GitCompareArrows, Info, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, EmptyState, Table, Td, Th } from "@/components/ui/misc";
import { Input } from "@/components/ui/input";
import { RefList, TraceView } from "@/components/trace/trace-view";
import { fmtDate, fmtNum } from "@/lib/utils";
import type { LegalRef } from "@/lib/engine/trace";
import type { WireReconciliation } from "@/lib/services/serialize";
import { deleteStatementAction, expectedAction, importStatementAction, reconcileAction } from "./actions";

type FeeTreatment = "NET" | "GROSS";

interface StatementRow {
  id: string; year: number; caspName: string; caspCountry: string | null; source: string;
  fileName: string | null; currency: string; lines: number; holdings: number; accountId: string | null;
  createdAt: string; notes: string | null;
}

interface Expected {
  year: number; currency: string; inScope: boolean; note: string; total: string; notes: string[]; rrptThreshold: string | null;
  buckets: { asset: string; bucket: string; count: number; units: string; amount: string; amountGross: string; amountNet: string; fees: string }[];
}

const STATUS: Record<string, { tone: "positive" | "warning" | "negative" | "info" | "neutral"; label: string }> = {
  MATCH: { tone: "positive", label: "Concordant" },
  MINOR: { tone: "info", label: "Écart mineur" },
  DIFFERENCE: { tone: "negative", label: "Écart" },
  MISSING_IN_APP: { tone: "negative", label: "Absent de vos livres" },
  MISSING_IN_STATEMENT: { tone: "warning", label: "Absent du relevé" },
};

export function Dac8Client({
  entityId, canEdit, pack, accounts, statements, buckets, refs,
}: {
  entityId: string;
  canEdit: boolean;
  pack: { code: string; name: string; flag: string; currency: string; dac8: { inScope: boolean; note: string; firstYear: number | null } };
  accounts: { id: string; label: string; exchange: string }[];
  statements: StatementRow[];
  buckets: { id: string; label: string; element: string; description: string }[];
  refs: LegalRef[];
}) {
  const currentYear = new Date().getUTCFullYear();
  const [pending, start] = useTransition();
  const [treatment, setTreatment] = useState<FeeTreatment>("NET");
  const [result, setResult] = useState<WireReconciliation | null>(null);
  const [expected, setExpected] = useState<Expected | null>(null);
  const [expectedYear, setExpectedYear] = useState(currentYear - 1);
  const formRef = useRef<HTMLFormElement>(null);

  const money = (v: string | number, currency = result?.currency ?? pack.currency) =>
    new Intl.NumberFormat("fr-FR", { style: "currency", currency, maximumFractionDigits: 2 }).format(Number(v));

  return (
    <div className="space-y-6">
      {!pack.dac8.inScope ? (
        <Alert tone="info" title={`${pack.flag} ${pack.name} hors DAC8`}>{pack.dac8.note}</Alert>
      ) : (
        <Alert tone="info" title={`Première déclaration : opérations ${pack.dac8.firstYear ?? 2026}`}>{pack.dac8.note}</Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><FileUp className="h-4 w-4 text-fg-subtle" /> Importer un relevé</CardTitle>
            <CardDescription>
              Le fichier XML du schéma CARF est lu directement. Un tableur transmis par le prestataire l&apos;est aussi : les colonnes sont reconnues par leur sens, en plusieurs langues, et ce qui n&apos;est pas compris est signalé plutôt qu&apos;ignoré.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              ref={formRef}
              action={(fd) =>
                start(async () => {
                  const r = await importStatementAction(entityId, fd);
                  if (!r.ok) { toast.error(r.error); return; }
                  toast.success(`${r.data.lines} ligne(s) importée(s)`);
                  if (r.data.unmapped.length) toast.warning(`${r.data.unmapped.length} élément(s) non reconnu(s)`);
                  formRef.current?.reset();
                })
              }
              className="grid gap-3 sm:grid-cols-2"
            >
              <label className="sm:col-span-2 text-sm">
                <span className="mb-1 block font-medium">Fichier</span>
                <input type="file" name="file" accept=".csv,.xml,.txt" required className="block w-full cursor-pointer rounded-lg border border-border bg-surface px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-surface-2 file:px-3 file:py-1.5 file:text-sm" />
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium">Prestataire</span>
                <Input name="caspName" placeholder="Binance, Kraken…" />
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium">Année</span>
                <Input name="year" type="number" min={2020} max={2100} defaultValue={currentYear - 1} />
              </label>
              <label className="sm:col-span-2 text-sm">
                <span className="mb-1 block font-medium">Compte rapproché</span>
                <select name="accountId" className="h-9 w-full rounded-lg border border-border bg-surface px-3 text-sm">
                  <option value="">Tous les comptes du dossier</option>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.label} ({a.exchange})</option>)}
                </select>
                <span className="mt-1 block text-xs text-fg-subtle">Un relevé porte sur un seul prestataire : rattachez-le au compte correspondant pour éviter un écart qui n&apos;en est pas un.</span>
              </label>
              {canEdit ? <div className="sm:col-span-2"><Button type="submit" loading={pending}>Importer</Button></div> : null}
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Traitement des frais</CardTitle>
            <CardDescription>La directive et le schéma de l&apos;OCDE ne disent pas la même chose. Le choix change les montants, pas les quantités.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {(["NET", "GROSS"] as const).map((t) => (
              <label key={t} className={`flex cursor-pointer gap-3 rounded-lg border p-3 text-sm transition-colors ${treatment === t ? "border-primary bg-primary-soft" : "border-border hover:bg-surface-2"}`}>
                <input type="radio" name="treatment" checked={treatment === t} onChange={() => setTreatment(t)} className="mt-1" />
                <span>
                  <span className="block font-medium">{t === "NET" ? "Net de frais" : "Brut"}</span>
                  <span className="mt-0.5 block text-fg-muted">
                    {t === "NET"
                      ? "Schéma XML CARF v1.5 : « net of transaction fees » sur les huit éléments. C'est ce que les prestataires renseignent."
                      : "Directive DAC8, annexe VI, section II, B.3, b et c : « montant brut payé » et « montant brut reçu »."}
                  </span>
                </span>
              </label>
            ))}
            <div className="flex items-end gap-2 border-t border-border pt-3">
              <label className="text-sm">
                <span className="mb-1 block font-medium">Année</span>
                <Input type="number" value={expectedYear} min={2020} max={2100} onChange={(e) => setExpectedYear(Number(e.target.value))} className="w-28" />
              </label>
              <Button
                variant="outline"
                loading={pending}
                onClick={() =>
                  start(async () => {
                    const r = await expectedAction(entityId, expectedYear, treatment);
                    if (r.ok) { setExpected(r.data); setResult(null); }
                    else toast.error(r.error);
                  })
                }
              >
                Ce que vos livres déclarent
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {expected ? (
        <Card>
          <CardHeader>
            <CardTitle>Agrégats {expected.year} calculés depuis vos livres</CardTitle>
            <CardDescription>
              Ce sont les chiffres qu&apos;un prestataire déclarerait pour ces opérations. Total des mouvements : {money(expected.total, expected.currency)}.
              {expected.rrptThreshold ? ` Seuil des paiements de détail déclarables : ${money(expected.rrptThreshold, expected.currency)}.` : ""}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 p-0">
            <Table>
              <thead><tr><Th>Actif</Th><Th>Élément CARF</Th><Th className="text-right">Opérations</Th><Th className="text-right">Quantité</Th><Th className="text-right">Montant</Th><Th className="text-right">Frais</Th></tr></thead>
              <tbody>
                {expected.buckets.map((b, i) => (
                  <tr key={i}>
                    <Td className="font-medium">{b.asset}</Td>
                    <Td><span className="font-mono text-xs">{b.bucket}</span></Td>
                    <Td className="text-right num tabular">{b.bucket === "TransferWallet" ? "—" : b.count}</Td>
                    <Td className="text-right num tabular">{fmtNum(b.units, 6)}</Td>
                    <Td className="text-right num tabular">{money(b.amount, expected.currency)}</Td>
                    <Td className="text-right num tabular text-fg-subtle">{money(b.fees, expected.currency)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            {expected.notes.length ? (
              <div className="space-y-2 p-4 pt-0 text-sm text-fg-muted">
                {expected.notes.map((n, i) => <p key={i} className="flex gap-2"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-fg-subtle" />{n}</p>)}
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Relevés reçus</CardTitle>
          <CardDescription>Un relevé par prestataire et par année.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {statements.length === 0 ? (
            <div className="p-5">
              <EmptyState icon={GitCompareArrows} title="Aucun relevé" description="Importez le relevé annuel que le prestataire vous a transmis, ou calculez d'abord ce que vos livres déclareraient." />
            </div>
          ) : (
            <Table>
              <thead><tr><Th>Année</Th><Th>Prestataire</Th><Th>Source</Th><Th className="text-right">Lignes</Th><Th>Importé le</Th><Th /></tr></thead>
              <tbody>
                {statements.map((s) => (
                  <tr key={s.id}>
                    <Td className="font-medium">{s.year}</Td>
                    <Td>
                      {s.caspName}
                      {s.caspCountry ? <span className="ml-1 text-xs text-fg-subtle">{s.caspCountry}</span> : null}
                      {s.holdings > 0 ? <Badge tone="warning" className="ml-2">positions hors CARF</Badge> : null}
                    </Td>
                    <Td className="text-xs text-fg-muted">{s.source}{s.fileName ? ` · ${s.fileName}` : ""}</Td>
                    <Td className="text-right num tabular">{s.lines}</Td>
                    <Td className="text-xs text-fg-muted">{fmtDate(s.createdAt, true)}</Td>
                    <Td className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          loading={pending}
                          onClick={() =>
                            start(async () => {
                              const r = await reconcileAction(entityId, s.id, treatment);
                              if (r.ok) { setResult(r.data); setExpected(null); }
                              else toast.error(r.error);
                            })
                          }
                        >
                          <GitCompareArrows className="h-4 w-4" /> Rapprocher
                        </Button>
                        {canEdit ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            aria-label={`Supprimer le relevé ${s.caspName} ${s.year}`}
                            onClick={() =>
                              start(async () => {
                                const r = await deleteStatementAction(entityId, s.id);
                                if (r.ok) toast.success("Relevé supprimé");
                                else toast.error(r.error);
                              })
                            }
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        ) : null}
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </CardContent>
      </Card>

      {result ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {result.status === "MATCH" ? <CheckCircle2 className="h-5 w-5 text-positive" /> : <AlertTriangle className="h-5 w-5 text-warning" />}
                {result.caspName} — {result.year}
              </CardTitle>
              <CardDescription>
                Cessions déclarées par le prestataire : {money(result.totals.statementDisposals)}. Calculées par vos livres : {money(result.totals.computedDisposals)}. Écart : {money(result.totals.delta)}.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <thead><tr><Th>Actif</Th><Th>Élément</Th><Th className="text-right">Relevé</Th><Th className="text-right">Vos livres</Th><Th className="text-right">Écart</Th><Th>État</Th></tr></thead>
                <tbody>
                  {result.lines.map((l, i) => (
                    <tr key={i}>
                      <Td className="font-medium">{l.asset}</Td>
                      <Td><span className="font-mono text-xs">{l.bucket}</span></Td>
                      <Td className="text-right num tabular">{l.statement?.amount ? money(l.statement.amount) : "—"}</Td>
                      <Td className="text-right num tabular">{money(l.computed.amount)}</Td>
                      <Td className="text-right num tabular">{l.deltaAmount ? money(l.deltaAmount) : "—"}</Td>
                      <Td><Badge tone={STATUS[l.status]?.tone ?? "neutral"}>{STATUS[l.status]?.label ?? l.status}</Badge></Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle>Ce qu&apos;il faut faire</CardTitle></CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm text-fg-muted">
                  {result.advice.map((a, i) => (
                    <li key={i} className="flex gap-2"><span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-fg-subtle" aria-hidden /><span>{a}</span></li>
                  ))}
                </ul>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Ligne par ligne</CardTitle><CardDescription>Chaque écart, chiffré et expliqué.</CardDescription></CardHeader>
              <CardContent className="space-y-3 text-sm">
                {result.lines.filter((l) => l.status !== "MATCH").slice(0, 8).map((l, i) => (
                  <div key={i} className="border-b border-dashed border-border pb-2 last:border-0">
                    <p className="font-medium">{l.asset} — {l.bucket}</p>
                    <p className="mt-0.5 text-fg-muted">{l.explanation}</p>
                  </div>
                ))}
                {result.lines.every((l) => l.status === "MATCH") ? <p className="text-fg-muted">Toutes les lignes concordent.</p> : null}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Détail du rapprochement</CardTitle>
              <CardDescription>Conservez ce détail dans le dossier : il documente la cohérence entre la déclaration et ce que le prestataire a transmis.</CardDescription>
            </CardHeader>
            <CardContent><TraceView root={result.trace} /></CardContent>
          </Card>
        </>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Les huit éléments du CARF</CardTitle>
          <CardDescription>Ce qu&apos;un prestataire déclare, dans les termes exacts du schéma de l&apos;OCDE.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {buckets.map((b) => (
            <div key={b.id} className="border-b border-dashed border-border pb-2 last:border-0">
              <p className="font-medium"><span className="font-mono text-xs text-primary">{b.element}</span> — {b.label}</p>
              <p className="mt-0.5 text-fg-muted">{b.description}</p>
            </div>
          ))}
          <div className="border-t border-border pt-3">
            <RefList refs={refs} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
