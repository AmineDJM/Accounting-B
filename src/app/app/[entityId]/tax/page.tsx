import { desc, and, eq } from "drizzle-orm";
import { requireUser } from "@/auth";
import { getDb } from "@/lib/db";
import { jobs } from "@/lib/db/schema";
import { requireEntity } from "@/lib/dal/entities";
import { getPack } from "@/lib/countries/registry";
import { PageHeader } from "@/components/ui/misc";
import { TaxClient, type TaxJobResult } from "./client";

export const metadata = { title: "Fiscalité personnelle" };

export default async function TaxPage({ params }: { params: Promise<{ entityId: string }> }) {
  const { entityId } = await params;
  const user = await requireUser();
  const { entity, role } = await requireEntity(user.id, entityId);
  const pack = getPack(entity.country);
  const db = await getDb();
  const [last] = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.entityId, entityId), eq(jobs.kind, "PRICING"), eq(jobs.status, "DONE")))
    .orderBy(desc(jobs.createdAt))
    .limit(1);

  const isWealth = pack.individual.kind === "WEALTH";
  const description = isWealth
    ? `${pack.name.fr} impose la position détenue, pas la plus-value. Le calcul reconstitue la position à la date de référence et détaille chaque cession à titre d'information.`
    : `Règles de ${pack.name.fr}, appliquées article par article. Chaque montant est explicable jusqu'à l'opération et au texte dont il découle.`;

  return (
    <>
      <PageHeader
        eyebrow={`${pack.flag} ${pack.name.fr}`}
        title="Fiscalité personnelle"
        description={description}
      />
      <TaxClient
        entityId={entityId}
        canEdit={role !== "VIEWER"}
        isCompany={entity.kind === "COMPANY"}
        result={(last?.result as TaxJobResult | null) ?? null}
        jobId={last?.id ?? null}
        pack={{
          code: pack.code,
          name: pack.name.fr,
          flag: pack.flag,
          currency: entity.baseCurrency,
          regime: pack.individual.kind,
          draft: pack.review.status !== "REVIEWED",
          lastReviewed: pack.review.lastReviewed,
          forms: pack.forms.map((f) => ({ name: f.name, label: f.label.fr, deadline: f.deadline?.fr, boxes: f.boxes.map((b) => ({ id: b.id, box: b.box, label: b.label.fr })) })),
          foreignAccounts: pack.foreignAccounts ? { form: pack.foreignAccounts.form, label: pack.foreignAccounts.label.fr } : null,
          dac8: { inScope: pack.dac8.inScope, note: pack.dac8.note.fr, firstYear: pack.dac8.firstReportedYear ?? null },
          assumptions: pack.assumptions.map((a) => a.fr),
        }}
      />
    </>
  );
}
