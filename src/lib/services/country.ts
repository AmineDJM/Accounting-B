import "server-only";
import { getPack } from "@/lib/countries/registry";
import type { CountryPack } from "@/lib/countries/types";
import { rebase } from "@/lib/engine/fx";
import type { PriceTable } from "@/lib/engine/valuation";
import type { ChartOfAccounts } from "@/lib/engine/chart";
import type { Entity } from "@/lib/dal/entities";

/**
 * Resolution of a file's jurisdiction.
 *
 * Everything country-dependent flows through here: the chart of accounts, the
 * currency the books are kept in, the calendar the dates are read on and the
 * engine that computes the tax. An entity stores overrides on top of the pack,
 * so a practice can renumber an account without losing the country's rules.
 */
export interface EntityContext {
  pack: CountryPack;
  chart: ChartOfAccounts;
  currency: string;
  timezone: string;
  locale: string;
  /** True while the pack has not been reviewed by a local professional. */
  draft: boolean;
}

export function contextFor(entity: Entity): EntityContext {
  const pack = getPack(entity.country);
  const overrides = (entity.chartOverrides ?? {}) as Partial<ChartOfAccounts>;
  return {
    pack,
    chart: { ...pack.company.chart, ...overrides },
    // The entity's own currency wins: a French subsidiary of a Swiss group may
    // keep its books in euro whatever the pack's default is.
    currency: (entity.baseCurrency || pack.baseCurrency).toUpperCase(),
    timezone: entity.timezone || pack.timezone,
    locale: entity.locale || pack.locale,
    draft: pack.review.status !== "REVIEWED",
  };
}

/**
 * Returns the price table expressed in the entity's currency.
 *
 * Prices are collected once in euro. An entity keeping its books in francs or
 * in dirhams reads the same cache through a rebasing view, so a change of
 * currency never means re-fetching a year of history.
 */
export function tableFor(table: PriceTable, ctx: EntityContext): PriceTable {
  return ctx.currency === "EUR" ? table : rebase(table, ctx.currency);
}

/** The sentence shown wherever a figure produced from a draft pack is displayed. */
export const DRAFT_NOTICE = {
  fr: "Les règles de ce pays n'ont pas encore été relues par un professionnel local. Les montants sont calculés à partir des textes cités et des hypothèses listées : vérifiez-les avant toute déclaration.",
  en: "This country's rules have not yet been reviewed by a local professional. Figures are computed from the texts cited and the assumptions listed: check them before filing.",
};
