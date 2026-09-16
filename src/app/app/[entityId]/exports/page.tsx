import { desc, and, eq } from "drizzle-orm";
import { Download, FileText, ListOrdered, Receipt, Table2 } from "lucide-react";
import { requireUser } from "@/auth";
import { getDb } from "@/lib/db";
import { jobs, journalRuns, fiscalYears } from "@/lib/db/schema";
import { requireEntity } from "@/lib/dal/entities";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/misc";
import { fmtDate } from "@/lib/utils";
import { getPack } from "@/lib/countries/registry";
import { formatsFor } from "@/lib/services/auditfile";
import { FORMAT_LABELS } from "@/lib/exports";

export const metadata = { title: "Exports" };

export default async function ExportsPage({ params }: { params: Promise<{ entityId: string }> }) {
  const { entityId } = await params;
  const user = await requireUser();
  const { entity } = await requireEntity(user.id, entityId);
  const db = await getDb();
  const runs = await db.select({ run: journalRuns, fy: fiscalYears }).from(journalRuns).innerJoin(fiscalYears, eq(fiscalYears.id, journalRuns.fiscalYearId)).where(eq(journalRuns.entityId, entityId)).orderBy(desc(journalRuns.createdAt)).limit(12);
  const [tax] = await db.select().from(jobs).where(and(eq(jobs.entityId, entityId), eq(jobs.kind, "PRICING"), eq(jobs.status, "DONE"))).orderBy(desc(jobs.createdAt)).limit(1);
  const api = `/api/entities/${entityId}/export`;
  const pack = getPack(entity.country);
  const nativeFormat = pack.company.auditFile;
  const formats = formatsFor(entity.country);
  return (
    <>
      <PageHeader
        eyebrow={`${pack.flag} ${pack.name.fr}`}
        title="Exports"
        description={`Fichiers prêts pour le cabinet ou pour la déclaration. Le fichier d'audit produit par défaut est celui qu'attend ${pack.name.fr} : ${FORMAT_LABELS[nativeFormat].fr}.`}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><FileText className="h-4 w-4 text-primary" /> Fichier d&apos;audit par exercice</CardTitle>
            <CardDescription>{pack.company.auditFileNote.fr}</CardDescription>
          </CardHeader>
          <CardContent>
            {runs.length === 0 ? <p className="text-sm text-fg-subtle">Générez d&apos;abord un journal.</p> : (
              <ul className="divide-y divide-border">{runs.map(({ run, fy }) => (
                <li key={run.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                  <span className="font-medium">Exercice {fy.label}</span>
                  <span className="text-xs text-fg-subtle">généré le {fmtDate(run.createdAt, true)}</span>
                  {run.withInventory ? <Badge>inventaire</Badge> : null}
                  <span className="ml-auto flex flex-wrap gap-1">
                    <a href={`${api}/auditfile/${run.id}`}><Button size="sm"><Download className="h-4 w-4" /> {FORMAT_LABELS[nativeFormat].fr.split(" (")[0]}</Button></a>
                    {formats.filter((f) => f.format !== nativeFormat).map((f) => (
                      <a key={f.format} href={`${api}/auditfile/${run.id}?format=${f.format}`} title={`Produire le fichier au format ${f.label}`}>
                        <Button size="sm" variant="ghost">{f.format}</Button>
                      </a>
                    ))}
                    <a href={`${api}/entries/${run.id}`}><Button size="sm" variant="outline">Écritures</Button></a>
                    <a href={`${api}/balance/${run.id}`}><Button size="sm" variant="outline">Balance</Button></a>
                  </span>
                </li>
              ))}</ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Receipt className="h-4 w-4 text-primary" /> Fiscalité personnelle</CardTitle>
            <CardDescription>Le détail de chaque opération du dernier calcul, avec son traitement et le motif retenu quand elle n&apos;est pas imposée.</CardDescription>
          </CardHeader>
          <CardContent>{tax ? <a href={`${api}/tax/${tax.id}`}><Button size="sm"><Download className="h-4 w-4" /> Opérations (CSV)</Button></a> : <p className="text-sm text-fg-subtle">Aucun calcul disponible.</p>}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><ListOrdered className="h-4 w-4 text-primary" /> Transactions</CardTitle><CardDescription>Toutes les opérations normalisées (entrées, sorties, frais, adresses, hash, références) : la pièce justificative de vos écritures.</CardDescription></CardHeader>
          <CardContent><a href={`${api}/transactions/all`}><Button size="sm" variant="outline"><Download className="h-4 w-4" /> Transactions (CSV)</Button></a></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Table2 className="h-4 w-4 text-primary" /> Plan de comptes</CardTitle><CardDescription>Comptes utilisés par {entity.name} selon le plan {pack.company.framework.fr}, y compris les sous-comptes attribués à chaque jeton, à créer dans le logiciel du cabinet.</CardDescription></CardHeader>
          <CardContent><a href={`${api}/chart/all`}><Button size="sm" variant="outline"><Download className="h-4 w-4" /> Plan de comptes (CSV)</Button></a></CardContent>
        </Card>
      </div>
    </>
  );
}
