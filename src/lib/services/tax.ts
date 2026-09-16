import "server-only";
import { computeIndividualTax, type IndividualResult } from "@/lib/engine/individual";
import { requireEntity } from "@/lib/dal/entities";
import { getDb } from "@/lib/db";
import { auditLog } from "@/lib/db/schema";
import { prepareValuation } from "./journal";
import { zonedEndOfDay, zonedYear } from "@/lib/engine/tz";

function years(now: Date): Date[] {
  return [zonedEndOfDay(zonedYear(now), 12, 31)];
}

/** Individual regime: computes art. 150 VH bis results for every year with data. */
export async function computeTaxForEntity(userId: string, entityId: string, log: (m: string) => void = () => {}): Promise<{ result: IndividualResult; missingPrices: number }> {
  const { entity } = await requireEntity(userId, entityId);
  const now = new Date();
  const { valued, table, missing } = await prepareValuation(entityId, entity, [], log);
  void years(now);
  const settings = (entity.settings ?? {}) as { externalHoldings?: Record<string, string>; includeAcquisitionFees?: boolean; rewardsAtMarketValue?: boolean };
  const result = computeIndividualTax(valued, table, { externalHoldings: settings.externalHoldings, includeAcquisitionFees: settings.includeAcquisitionFees, rewardsAtMarketValue: settings.rewardsAtMarketValue });
  const db = await getDb();
  await db.insert(auditLog).values({ entityId, userId, action: "tax.compute", details: { disposals: result.disposals.length } });
  return { result, missingPrices: missing.length };
}

/** CSV export of the 2086-style disposal lines. */
export function disposalsCsv(result: IndividualResult): string {
  const header = ["Date de cession", "Actif", "Quantité", "Valeur globale du portefeuille (212)", "Prix de cession (213)", "Frais de cession (214)", "Prix de cession net (217)", "Prix total d'acquisition (218)", "Fractions de capital déjà déduites (219)", "Prix total d'acquisition net (220)", "Fraction imputée", "Plus ou moins-value (221)"];
  const f = (v: { toFixed: (n: number) => string }) => v.toFixed(2).replace(".", ",");
  const lines = result.disposals.map((d) => [d.date.toISOString().slice(0, 10), d.asset, d.qty.toString().replace(".", ","), f(d.portfolioValueEur), f(d.grossProceedsEur), f(d.feesEur), f(d.netProceedsEur), f(d.totalAcquisitionEur), f(d.fractionsPreviouslyDeductedEur), f(d.netAcquisitionEur), f(d.fractionEur), f(d.gainEur)].join(";"));
  return "﻿" + [header.join(";"), ...lines].join("\r\n");
}
