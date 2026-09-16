import { AE } from "./ae";
import { AT } from "./at";
import { BE } from "./be";
import { CH } from "./ch";
import { DE } from "./de";
import { ES } from "./es";
import { FR } from "./fr";
import { IT } from "./it";
import { NL } from "./nl";
import { OM } from "./om";
import { PT } from "./pt";
import { QA } from "./qa";
import type { CountryCode, CountryPack, LocalizedText } from "./types";

/**
 * The twelve jurisdictions the app supports.
 *
 * Adding a country means writing a pack, not touching the engines: the three
 * engines (lot-based gains, the French portfolio formula, and the wealth
 * engine) read the rules from the pack. What a pack must never do is hide an
 * uncertainty — every one of them carries `assumptions` and a review status,
 * and the interface shows both.
 */
export const COUNTRY_PACKS: Record<CountryCode, CountryPack> = { FR, DE, AT, ES, IT, PT, BE, NL, CH, AE, OM, QA };

export const COUNTRY_CODES = Object.keys(COUNTRY_PACKS) as CountryCode[];

/** Display order: the euro area first, then the other European states, then the Gulf. */
export const COUNTRY_ORDER: CountryCode[] = ["FR", "BE", "DE", "AT", "NL", "ES", "IT", "PT", "CH", "AE", "QA", "OM"];

export function getPack(code: string | null | undefined): CountryPack {
  const key = (code ?? "FR").toUpperCase() as CountryCode;
  return COUNTRY_PACKS[key] ?? FR;
}

export function isSupportedCountry(code: string | null | undefined): code is CountryCode {
  return Boolean(code && (code.toUpperCase() as CountryCode) in COUNTRY_PACKS);
}

export interface CountryChoice {
  code: CountryCode;
  name: LocalizedText;
  flag: string;
  currency: string;
  regime: "GAINS" | "WEALTH";
  /** Short line shown next to the country in the picker. */
  summary: LocalizedText;
  reviewed: boolean;
  dac8: boolean;
}

/** One line per country, for the onboarding picker and the cockpit. */
export function countryChoices(): CountryChoice[] {
  return COUNTRY_ORDER.map((code) => {
    const p = COUNTRY_PACKS[code];
    return {
      code,
      name: p.name,
      flag: p.flag,
      currency: p.baseCurrency,
      regime: p.individual.kind,
      summary: summarise(p),
      reviewed: p.review.status === "REVIEWED",
      dac8: p.dac8.inScope,
    };
  });
}

function summarise(p: CountryPack): LocalizedText {
  if (p.individual.kind === "WEALTH") {
    const d = p.individual.referenceDate;
    const day = `${String(d.day).padStart(2, "0")}/${String(d.month).padStart(2, "0")}`;
    return {
      fr: `Imposition du patrimoine au ${day} ; plus-values privées exonérées`,
      en: `Wealth taxed at ${day}; private capital gains exempt`,
    };
  }
  const rules = p.individual;
  if (rules.noPersonalTax) return { fr: "Aucun impôt sur le revenu des personnes physiques", en: "No personal income tax" };

  const latest = rules.years[Math.max(...Object.keys(rules.years).map(Number))];
  const rate = headlineRate(latest);
  // France prices a disposal against the whole portfolio rather than against
  // lots, so naming a cost method there would describe a mechanism it does not
  // use.
  const method = rules.variant === "FR_PORTFOLIO"
    ? { fr: "assiette portefeuille", en: "portfolio basis" }
    : rules.costMethod === "AVERAGE"
      ? { fr: "prix moyen", en: "average cost" }
      : { fr: rules.costMethod, en: rules.costMethod };
  const exemptFr = rules.exemptAfterDays
    ? ` ; exonération après ${rules.exemptAfterDays} jours`
    : rules.exemptAfterYears
      ? ` ; exonération après ${rules.exemptAfterYears} an${rules.exemptAfterYears > 1 ? "s" : ""}`
      : "";
  const exemptEn = rules.exemptAfterDays
    ? `; exempt after ${rules.exemptAfterDays} days`
    : rules.exemptAfterYears
      ? `; exempt after ${rules.exemptAfterYears} year${rules.exemptAfterYears > 1 ? "s" : ""}`
      : "";
  return {
    fr: `${rate ? `Taux forfaitaire de ${formatRate(rate, "fr")}` : "Barème progressif"} ; ${method.fr}${exemptFr}`,
    en: `${rate ? `Flat rate of ${formatRate(rate, "en")}` : "Progressive scale"}; ${method.en}${exemptEn}`,
  };
}

/**
 * The rate a taxpayer would quote.
 *
 * A country may state it once (Portugal's 28 %) or split it into components
 * that add up to it (France's 12,8 % of income tax plus 17,2 % of social
 * levies, which everyone calls 30 %). Reading only `flatRate` would describe
 * France as progressive, which is the opposite of its default regime.
 */
function headlineRate(params: { flatRate?: string; components?: { rate: string }[] } | undefined): number | null {
  if (!params) return null;
  if (params.flatRate) return Number(params.flatRate);
  if (params.components?.length) return params.components.reduce((a, c) => a + Number(c.rate), 0);
  return null;
}

function formatRate(rate: number, locale: "fr" | "en"): string {
  // 0.28 × 100 is 28.000000000000004 in binary floating point, so the rate is
  // rounded before it is shown. Every rate that is actually computed goes
  // through Decimal; this one is only a label.
  const text = (Math.round(rate * 10000) / 100).toString();
  return locale === "fr" ? `${text.replace(".", ",")} %` : `${text}%`;
}

/**
 * Countries whose pack has been reviewed by a local professional. Everything
 * else is a draft, and the interface says so on every page that produces a
 * figure. This is deliberately a hard-coded list rather than a flag a user can
 * flip: a review is an event outside the software.
 */
export const REVIEWED_COUNTRIES: CountryCode[] = COUNTRY_CODES.filter((c) => COUNTRY_PACKS[c].review.status === "REVIEWED");

export * from "./types";
