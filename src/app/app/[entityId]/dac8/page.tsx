import { requireUser } from "@/auth";
import { requireEntity } from "@/lib/dal/entities";
import { listAccounts } from "@/lib/dal/accounts";
import { listStatements } from "@/lib/services/dac8";
import { getPack } from "@/lib/countries/registry";
import { BUCKET_DESCRIPTIONS, BUCKET_LABELS, DAC8_BUCKETS, DAC8_REFS } from "@/lib/dac8/types";
import { PageHeader } from "@/components/ui/misc";
import { Dac8Client } from "./client";

export const metadata = { title: "Rapprochement DAC8" };

export default async function Dac8Page({ params }: { params: Promise<{ entityId: string }> }) {
  const { entityId } = await params;
  const user = await requireUser();
  const { entity, role } = await requireEntity(user.id, entityId);
  const pack = getPack(entity.country);
  const [statements, accounts] = await Promise.all([listStatements(user.id, entityId), listAccounts(user.id, entityId)]);

  return (
    <>
      <PageHeader
        eyebrow={`${pack.flag} ${pack.name.fr}`}
        title="Rapprochement DAC8"
        description="Depuis 2026, chaque prestataire de services sur crypto-actifs transmet à son administration fiscale huit agrégats par actif et par client. Comparez ce qu'il a déclaré avec ce que vos livres produisent, et expliquez chaque écart avant qu'on vous le demande."
      />
      <Dac8Client
        entityId={entityId}
        canEdit={role !== "VIEWER"}
        pack={{ code: pack.code, name: pack.name.fr, flag: pack.flag, currency: entity.baseCurrency, dac8: { inScope: pack.dac8.inScope, note: pack.dac8.note.fr, firstYear: pack.dac8.firstReportedYear ?? null } }}
        accounts={accounts.map((a) => ({ id: a.id, label: a.label, exchange: a.exchange }))}
        statements={statements.map((s) => ({
          id: s.id,
          year: s.year,
          caspName: s.caspName,
          caspCountry: s.caspCountry,
          source: s.source,
          fileName: s.fileName,
          currency: s.currency,
          lines: s.aggregates.length,
          holdings: s.holdings.length,
          accountId: s.accountId,
          createdAt: s.createdAt.toISOString(),
          notes: s.notes,
        }))}
        buckets={DAC8_BUCKETS.map((b) => ({ id: b, label: BUCKET_LABELS[b].fr, element: BUCKET_LABELS[b].element, description: BUCKET_DESCRIPTIONS[b].fr }))}
        refs={DAC8_REFS}
      />
    </>
  );
}
