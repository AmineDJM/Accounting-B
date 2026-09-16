import { requireUser } from "@/auth";
import { listMembers, requireEntity } from "@/lib/dal/entities";
import { DEFAULT_CHART, type ChartOfAccounts } from "@/lib/engine/chart";
import { PageHeader } from "@/components/ui/misc";
import { SettingsClient } from "./client";

export const metadata = { title: "Paramètres" };

const CHART_LABELS: Record<string, string> = {
  bank: "Banque (paiements par carte)", internalTransfer: "Virements internes (banque ↔ plateforme)", feesFiat: "Frais sur dépôts / retraits fiat", feesTrading: "Commissions de la plateforme", feesNetwork: "Frais de réseau (on-chain)",
  gainOnTokens: "Produits nets sur cessions de jetons", lossOnTokens: "Charges nettes sur cessions de jetons", fxGain: "Gains de change (devises)", fxLoss: "Pertes de change (devises)", tokenIncome: "Revenus de jetons (staking, earn, airdrops)",
  suppliers: "Fournisseurs (paiements en jetons)", customers: "Clients (encaissements en jetons)", ownerAccount: "Associés – comptes courants", miscExpense: "Charges diverses (jetons perdus / donnés)", miscIncome: "Produits divers (jetons reçus)", suspense: "Compte d'attente (opérations à qualifier)",
  valuationLossAsset: "Différences d'évaluation jetons – Actif (perte latente)", valuationGainLiability: "Différences d'évaluation jetons – Passif (gain latent)", provisionRisk: "Provision pour pertes latentes sur jetons", provisionCharge: "Dotations aux provisions", provisionReversal: "Reprises sur provisions",
  fxConversionLoss: "Différences de conversion – Actif", fxConversionGain: "Différences de conversion – Passif", fxProvision: "Provisions pour pertes de change", roundingExpense: "Arrondis (charge)", roundingIncome: "Arrondis (produit)",
};

export default async function SettingsPage({ params }: { params: Promise<{ entityId: string }> }) {
  const { entityId } = await params;
  const user = await requireUser();
  const { entity, role } = await requireEntity(user.id, entityId);
  const { members, pending } = await listMembers(user.id, entityId);
  const overrides = (entity.chartOverrides ?? {}) as Partial<ChartOfAccounts>;
  const chart = Object.entries(DEFAULT_CHART).filter(([, v]) => typeof v === "object").map(([key, v]) => {
    const def = v as { number: string; label: string };
    const o = overrides[key as keyof ChartOfAccounts] as { number: string; label: string } | undefined;
    return { key, description: CHART_LABELS[key] ?? key, number: o?.number ?? def.number, label: o?.label ?? def.label, defaultNumber: def.number };
  });
  return (
    <>
      <PageHeader title="Paramètres" description="Identité du dossier, plan de comptes, accès des collaborateurs." />
      <SettingsClient
        entityId={entityId}
        role={role}
        entity={{ name: entity.name, kind: entity.kind, siren: entity.siren ?? "", legalForm: entity.legalForm ?? "", fiscalYearEndMonth: entity.fiscalYearEndMonth, fiscalYearEndDay: entity.fiscalYearEndDay, costMethod: entity.costMethod as "CUMP" | "FIFO" }}
        chart={chart}
        capitalizeFees={Boolean(overrides.capitalizeFees)}
        assetAccounts={Object.entries(entity.assetAccountMap ?? {}).map(([asset, number]) => ({ asset, number }))}
        externalHoldings={Object.entries(((entity.settings ?? {}) as { externalHoldings?: Record<string, string> }).externalHoldings ?? {}).map(([a, q]) => `${a} ${q}`).join("\n")}
        members={members.map((m) => ({ userId: m.userId, email: m.email, name: m.name, role: m.role, since: m.since.toISOString() }))}
        pending={pending.map((p) => ({ id: p.id, email: p.email, role: p.role, expiresAt: p.expiresAt.toISOString(), token: p.token }))}
        currentUserId={user.id}
      />
    </>
  );
}
