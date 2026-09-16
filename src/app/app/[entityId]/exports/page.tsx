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

export const metadata = { title: "Exports" };

export default async function ExportsPage({ params }: { params: Promise<{ entityId: string }> }) {
  const { entityId } = await params;
  const user = await requireUser();
  const { entity } = await requireEntity(user.id, entityId);
  const db = await getDb();
  const runs = await db.select({ run: journalRuns, fy: fiscalYears }).from(journalRuns).innerJoin(fiscalYears, eq(fiscalYears.id, journalRuns.fiscalYearId)).where(eq(journalRuns.entityId, entityId)).orderBy(desc(journalRuns.createdAt)).limit(12);
  const [tax] = await db.select().from(jobs).where(and(eq(jobs.entityId, entityId), eq(jobs.kind, "PRICING"), eq(jobs.status, "DONE"))).orderBy(desc(jobs.createdAt)).limit(1);
  const api = `/api/entities/${entityId}/export`;
  return (
    <>
      <PageHeader title="Exports" description="Fichiers prêts pour votre expert-comptable ou votre déclaration. Tous les CSV utilisent le point-virgule et la virgule décimale (Excel français)." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><FileText className="h-4 w-4 text-primary" /> FEC par exercice</CardTitle><CardDescription>Fichier des écritures comptables (art. A47 A-1 LPF) nommé SIREN + FEC + date de clôture, séparateur « | », UTF-8, avec ses écritures d&apos;inventaire.</CardDescription></CardHeader>
          <CardContent>
            {runs.length === 0 ? <p className="text-sm text-fg-subtle">Générez d&apos;abord un journal.</p> : (
              <ul className="divide-y divide-border">{runs.map(({ run, fy }) => (
                <li key={run.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                  <span className="font-medium">Exercice {fy.label}</span>
                  <span className="text-xs text-fg-subtle">généré le {fmtDate(run.createdAt, true)}</span>
                  {run.withInventory ? <Badge>inventaire</Badge> : null}
                  <span className="ml-auto flex gap-1">
                    <a href={`${api}/fec/${run.id}`}><Button size="sm"><Download className="h-4 w-4" /> FEC</Button></a>
                    <a href={`${api}/entries/${run.id}`}><Button size="sm" variant="outline">Écritures</Button></a>
                    <a href={`${api}/balance/${run.id}`}><Button size="sm" variant="outline">Balance</Button></a>
                  </span>
                </li>
              ))}</ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Receipt className="h-4 w-4 text-primary" /> Déclaration des particuliers</CardTitle><CardDescription>Lignes du formulaire 2086 issues du dernier calcul (art. 150 VH bis).</CardDescription></CardHeader>
          <CardContent>{tax ? <a href={`${api}/tax/${tax.id}`}><Button size="sm"><Download className="h-4 w-4" /> Cessions 2086 (CSV)</Button></a> : <p className="text-sm text-fg-subtle">Aucun calcul de plus-values disponible.</p>}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><ListOrdered className="h-4 w-4 text-primary" /> Transactions</CardTitle><CardDescription>Toutes les opérations normalisées (entrées, sorties, frais, adresses, hash, références) : la pièce justificative de vos écritures.</CardDescription></CardHeader>
          <CardContent><a href={`${api}/transactions/all`}><Button size="sm" variant="outline"><Download className="h-4 w-4" /> Transactions (CSV)</Button></a></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Table2 className="h-4 w-4 text-primary" /> Plan de comptes</CardTitle><CardDescription>Comptes utilisés par {entity.name}, y compris les sous-comptes 522 attribués à chaque jeton, à créer dans le logiciel de votre cabinet.</CardDescription></CardHeader>
          <CardContent><a href={`${api}/chart/all`}><Button size="sm" variant="outline"><Download className="h-4 w-4" /> Plan de comptes (CSV)</Button></a></CardContent>
        </Card>
      </div>
    </>
  );
}
