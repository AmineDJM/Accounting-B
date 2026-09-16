"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Calculator, Download, FileText, Landmark, Receipt, Scale, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, EmptyState, Stat, Table, Td, Th } from "@/components/ui/misc";
import { JobPanel, useJob } from "@/components/app/job-progress";
import { RefList, TraceView } from "@/components/trace/trace-view";
import { fmtDate, fmtNum } from "@/lib/utils";
import type { WireTax } from "@/lib/services/serialize";
import { computeTaxAction } from "./actions";

export type TaxJobResult = WireTax & { missingPrices: number; draft: boolean; notice: string | null };

export interface PackInfo {
  code: string;
  name: string;
  flag: string;
  currency: string;
  regime: "GAINS" | "WEALTH";
  draft: boolean;
  lastReviewed: string;
  forms: { name: string; label: string; deadline?: string; boxes: { id: string; box: string; label: string }[] }[];
  foreignAccounts: { form: string; label: string } | null;
  dac8: { inScope: boolean; note: string; firstYear: number | null };
  assumptions: string[];
}

const money = (v: string | number, currency: string) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency, maximumFractionDigits: 2 }).format(Number(v));

export function TaxClient({
  entityId, canEdit, isCompany, result, jobId: lastJobId, pack,
}: {
  entityId: string; canEdit: boolean; isCompany: boolean; result: TaxJobResult | null; jobId: string | null; pack: PackInfo;
}) {
  const [jobId, setJobId] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [year, setYear] = useState<number | null>(null);
  const [openTrace, setOpenTrace] = useState<string | null>(null);
  const job = useJob(entityId, jobId, (j) => {
    if (j.status === "DONE") toast.success("Calcul terminé");
    else toast.error(j.message ?? "Échec");
  });

  const years = result?.years ?? [];
  const selected = year ?? years.at(-1)?.year ?? null;
  const y = years.find((v) => v.year === selected) ?? null;
  const currency = result?.currency ?? pack.currency;
  const events = useMemo(
    () => (result?.events ?? []).filter((e) => !selected || new Date(e.date).getUTCFullYear() === selected),
    [result, selected],
  );
  const income = useMemo(
    () => (result?.income ?? []).filter((i) => !selected || new Date(i.date).getUTCFullYear() === selected),
    [result, selected],
  );
  const snapshot = result?.wealth.find((w) => w.year === selected) ?? null;

  return (
    <div className="space-y-6">
      {pack.draft ? (
        <Alert tone="warning" title={`Règles ${pack.name} non relues`}>
          Les textes cités ont été lus et encodés le {fmtDate(pack.lastReviewed)}, mais aucun professionnel local ne les a validés.
          Les hypothèses retenues sont listées en bas de page : vérifiez-les avant toute déclaration.
        </Alert>
      ) : null}

      {isCompany ? (
        <Alert tone="info" title="Dossier entreprise">
          Ce calcul porte sur la fiscalité des personnes physiques. Pour une société, le résultat de cession est déterminé écriture par écriture dans le journal comptable.
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        {canEdit ? (
          <Button
            loading={pending}
            disabled={job?.status === "RUNNING"}
            onClick={() =>
              start(async () => {
                const r = await computeTaxAction(entityId);
                if (r.ok) setJobId(r.id);
                else toast.error(r.error);
              })
            }
          >
            <Calculator className="h-4 w-4" /> {result ? "Recalculer" : "Calculer"}
          </Button>
        ) : null}
        {result ? (
          <span className="text-sm text-fg-muted">
            Calculé le {fmtDate(result.computedAt, true)}
            {result.missingPrices ? ` · ${result.missingPrices} cours manquant(s)` : ""}
          </span>
        ) : null}
        {lastJobId && result ? (
          <a className="ml-auto" href={`/api/entities/${entityId}/export/tax/${lastJobId}`}>
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4" /> Détail des opérations (CSV)
            </Button>
          </a>
        ) : null}
      </div>

      {job ? <JobPanel job={job} title="Calcul de la fiscalité" /> : null}

      {!result ? (
        <EmptyState
          icon={Receipt}
          title="Aucun calcul"
          description={`Le calcul applique les règles de ${pack.name} à l'historique importé et conserve, pour chaque montant, les étapes et les articles dont il découle.`}
        />
      ) : years.length === 0 ? (
        <Alert tone="info" title="Aucune opération sur la période">
          Aucune cession ni revenu en jetons n&apos;a été trouvé dans l&apos;historique importé.
        </Alert>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {years.map((v) => (
              <button
                key={v.year}
                onClick={() => setYear(Number(v.year))}
                className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                  v.year === selected ? "border-primary bg-primary-soft text-primary" : "border-border bg-surface text-fg-muted hover:bg-surface-2"
                }`}
              >
                {v.year}
              </button>
            ))}
          </div>

          {y ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {pack.regime === "WEALTH" ? (
                <>
                  <Stat label={`Position déclarée ${y.year}`} value={snapshot ? money(snapshot.total, currency) : "—"} sub={snapshot ? `${snapshot.holdings.length} actif(s) au ${fmtDate(snapshot.at)}` : undefined} icon={Wallet} />
                  <Stat label="Cessions de l'année" value={String(y.disposalCount)} sub={`${money(y.grossProceeds, currency)} de produits, non imposés`} />
                  <Stat label="Résultat des cessions" value={money(y.netGain, currency)} sub="Information : exonéré dans ce régime" tone={Number(y.netGain) >= 0 ? "positive" : "negative"} />
                  <Stat label="Revenus en jetons" value={money(y.incomeTotal, currency)} sub={`Imposable : ${money(y.incomeTaxable, currency)}`} />
                </>
              ) : (
                <>
                  <Stat label={`Cessions ${y.year}`} value={money(y.grossProceeds, currency)} sub={`${y.disposalCount} opération(s)`} />
                  <Stat label="Plus et moins-values" value={money(y.netGain, currency)} sub={`+${money(y.gains, currency)} / −${money(y.losses, currency)}`} tone={Number(y.netGain) >= 0 ? "positive" : "negative"} />
                  <Stat label="Base imposable" value={money(y.taxableBase, currency)} sub={y.lossCarryForward && Number(y.lossCarryForward) > 0 ? `Report déficitaire : ${money(y.lossCarryForward, currency)}` : undefined} />
                  <Stat
                    label="Impôt estimé"
                    value={y.estimatedTax === null ? "—" : money(y.estimatedTax, currency)}
                    sub={y.taxBreakdown.map((b) => `${b.label} ${(Number(b.rate) * 100).toFixed(2).replace(".", ",")} %`).join(" · ") || undefined}
                  />
                </>
              )}
            </div>
          ) : null}

          {y?.notes.length ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm"><Scale className="h-4 w-4 text-fg-subtle" /> Ce que dit la règle</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-fg-muted">
                {y.notes.map((n, i) => <p key={i}>{n}</p>)}
              </CardContent>
            </Card>
          ) : null}

          {y ? (
            <Card>
              <CardHeader>
                <CardTitle>Comment ce montant est obtenu</CardTitle>
                <CardDescription>
                  Dépliez chaque étape jusqu&apos;à l&apos;opération et au texte dont elle découle. Ce détail est conservé avec le calcul : il reste disponible si l&apos;administration le demande.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <TraceView root={y.trace} />
              </CardContent>
            </Card>
          ) : null}

          {y?.formLines.length ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><FileText className="h-4 w-4 text-fg-subtle" /> Cases à reporter</CardTitle>
                <CardDescription>Les montants, dans les cases des formulaires de {pack.name}.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <thead><tr><Th>Formulaire</Th><Th>Case</Th><Th>Libellé</Th><Th className="text-right">Montant</Th></tr></thead>
                  <tbody>
                    {y.formLines.map((l, i) => (
                      <tr key={i}>
                        <Td className="font-medium">{l.form}</Td>
                        <Td><Badge tone="primary">{l.box}</Badge></Td>
                        <Td className="text-fg-muted">{l.label}</Td>
                        <Td className="text-right num tabular">{money(l.raw ?? l.value, currency)}</Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </CardContent>
            </Card>
          ) : null}

          {snapshot ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Wallet className="h-4 w-4 text-fg-subtle" /> Position au {fmtDate(snapshot.at)}</CardTitle>
                <CardDescription>Ce qui est déclaré dans ce régime : la valeur détenue à la date de référence.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <thead><tr><Th>Actif</Th><Th className="text-right">Quantité</Th><Th className="text-right">Cours</Th><Th className="text-right">Valeur</Th><Th>Source</Th></tr></thead>
                  <tbody>
                    {snapshot.holdings.map((h) => (
                      <tr key={h.asset}>
                        <Td className="font-medium">{h.asset}</Td>
                        <Td className="text-right num tabular">{fmtNum(h.qty, 8)}</Td>
                        <Td className="text-right num tabular">{h.unitValue ? money(h.unitValue, currency) : "—"}</Td>
                        <Td className="text-right num tabular">{money(h.value, currency)}</Td>
                        <Td className="text-xs text-fg-subtle">{h.source}</Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </CardContent>
            </Card>
          ) : null}

          {events.length ? (
            <Card>
              <CardHeader>
                <CardTitle>Opérations {selected}</CardTitle>
                <CardDescription>Cliquez une ligne pour voir le calcul qui lui correspond.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <thead>
                    <tr>
                      <Th>Date</Th><Th>Actif</Th><Th className="text-right">Quantité</Th><Th>Nature</Th>
                      <Th className="text-right">Cession</Th><Th className="text-right">Acquisition</Th><Th className="text-right">Résultat</Th><Th>Traitement</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {events.map((e) => (
                      <Fragment key={e.id}>
                        <tr
                          onClick={() => setOpenTrace(openTrace === e.id ? null : e.id)}
                          className="cursor-pointer hover:bg-surface-2"
                        >
                          <Td>{fmtDate(e.date)}</Td>
                          <Td className="font-medium">{e.asset}</Td>
                          <Td className="text-right num tabular">{fmtNum(e.qty, 8)}</Td>
                          <Td className="text-xs text-fg-muted">{e.disposalKind}{e.counterAsset ? ` → ${e.counterAsset}` : ""}</Td>
                          <Td className="text-right num tabular">{money(e.netProceeds, currency)}</Td>
                          <Td className="text-right num tabular">{money(e.costBasis, currency)}</Td>
                          <Td className={`text-right num tabular ${Number(e.gain) >= 0 ? "text-positive" : "text-negative"}`}>{money(e.gain, currency)}</Td>
                          <Td>{e.exempt ? <Badge tone="info">non imposé</Badge> : <Badge tone="neutral">imposable</Badge>}</Td>
                        </tr>
                        {openTrace === e.id ? (
                          <tr>
                            <Td colSpan={8} className="bg-surface-2 p-3">
                              {e.exemptReason ? <p className="mb-3 text-sm text-fg-muted">{e.exemptReason}</p> : null}
                              <TraceView root={e.trace} defaultOpen={2} />
                            </Td>
                          </tr>
                        ) : null}
                      </Fragment>
                    ))}
                  </tbody>
                </Table>
              </CardContent>
            </Card>
          ) : null}

          {income.length ? (
            <Card>
              <CardHeader>
                <CardTitle>Revenus en jetons {selected}</CardTitle>
                <CardDescription>Staking, minage, airdrops et rémunérations reçues en jetons.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <thead><tr><Th>Date</Th><Th>Actif</Th><Th className="text-right">Quantité</Th><Th>Nature</Th><Th>Catégorie</Th><Th className="text-right">Valeur</Th><Th>Imposé</Th></tr></thead>
                  <tbody>
                    {income.map((i) => (
                      <tr key={i.id}>
                        <Td>{fmtDate(i.date)}</Td>
                        <Td className="font-medium">{i.asset}</Td>
                        <Td className="text-right num tabular">{fmtNum(i.qty, 8)}</Td>
                        <Td className="text-xs text-fg-muted">{i.incomeKind}</Td>
                        <Td className="text-fg-muted">{i.category}</Td>
                        <Td className="text-right num tabular">{money(i.valueBase, currency)}</Td>
                        <Td>{i.taxable ? <Badge tone="warning">à la réception</Badge> : <Badge tone="info">à la cession</Badge>}</Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </CardContent>
            </Card>
          ) : null}
        </>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {pack.forms.length ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Landmark className="h-4 w-4 text-fg-subtle" /> Formulaires de {pack.name}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              {pack.forms.map((f) => (
                <div key={f.name}>
                  <p className="font-medium">{f.name} <span className="font-normal text-fg-muted">— {f.label}</span></p>
                  {f.deadline ? <p className="mt-0.5 text-xs text-fg-subtle">{f.deadline}</p> : null}
                  <ul className="mt-1.5 space-y-0.5">
                    {f.boxes.map((b) => (
                      <li key={b.id} className="flex gap-2 text-fg-muted">
                        <Badge tone="neutral" className="shrink-0">{b.box}</Badge>
                        <span>{b.label}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              {pack.foreignAccounts ? (
                <div className="border-t border-border pt-3">
                  <p className="font-medium">{pack.foreignAccounts.form}</p>
                  <p className="mt-0.5 text-fg-muted">{pack.foreignAccounts.label}</p>
                </div>
              ) : null}
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Hypothèses retenues</CardTitle>
            <CardDescription>Ce que le calcul suppose et qu&apos;un conseil local doit confirmer.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-fg-muted">
              {(result?.assumptions ?? pack.assumptions).map((a, i) => (
                <li key={i} className="flex gap-2">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-fg-subtle" aria-hidden />
                  <span>{a}</span>
                </li>
              ))}
            </ul>
            {result?.refs.length ? (
              <div className="mt-4 border-t border-border pt-3">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-fg-subtle">Textes appliqués</p>
                <RefList refs={result.refs} />
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {result?.warnings.length ? (
        <Alert tone="warning" title={`${result.warnings.length} point(s) à vérifier`}>
          <ul className="mt-1 space-y-1">
            {result.warnings.slice(0, 20).map((w, i) => <li key={i}>{w.message}</li>)}
          </ul>
        </Alert>
      ) : null}
    </div>
  );
}
