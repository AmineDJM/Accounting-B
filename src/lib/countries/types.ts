import type { ChartOfAccounts } from "../engine/chart";
import type { CountryCode, LegalRef } from "../engine/trace";
import type { LotMethod } from "../engine/tax/lots";
import type { DisposalKind, TaxComputationInput, TaxComputationResult } from "../engine/tax/types";

export type { CountryCode };

export interface LocalizedText {
  fr: string;
  en: string;
  /** Label in the country's own language, used for legal and accounting vocabulary. */
  native?: string;
}

/* ------------------------------------------------------------------ Individuals */

export interface Bracket {
  /** Upper bound of the bracket, null for the last one. */
  upTo: string | null;
  rate: string;
}

export interface Allowance {
  amount: string;
  /**
   * FREIGRENZE — exceeding it makes the whole amount taxable (Germany §23 EStG).
   * FREIBETRAG — only the excess is taxable (Belgium's yearly exemption).
   */
  kind: "FREIGRENZE" | "FREIBETRAG";
  label: LocalizedText;
  refs?: LegalRef[];
}

export interface GainsYearParams {
  /** Flat rate applied to the taxable base. */
  flatRate?: string;
  /** Progressive brackets, used when there is no flat rate. */
  brackets?: Bracket[];
  /** Components displayed separately in the estimate (income tax, social levies, surcharges). */
  components?: { label: LocalizedText; rate: string; note?: string }[];
  /** Reduced or increased rate for a subset of assets (Italy's euro e-money tokens). */
  specialRates?: { label: LocalizedText; rate: string; matches: (asset: string) => boolean }[];
  allowance?: Allowance;
  /** Exemption driven by the year's total disposal proceeds (France's 305 €). */
  proceedsThreshold?: { amount: string; label: LocalizedText; refs?: LegalRef[] };
  /**
   * Country-specific estimator, used where a flat rate cannot express the
   * charge. Germany taxes the gain at the taxpayer's marginal rate, so the
   * estimate is the difference between the tariff applied to total income with
   * and without the gain; it returns null when the engine lacks that input.
   */
  estimator?: (base: string, options: Record<string, string | number | boolean>) => { components: { label: LocalizedText; amount: string; rate?: string }[]; note?: LocalizedText } | null;
  /** Shown instead of an amount when no estimate can be produced. */
  noEstimateNote?: LocalizedText;
  notes?: LocalizedText[];
}

export interface IncomeKindRule {
  /** Taxed when received, or only when the tokens received are later disposed of. */
  taxedAtReceipt: boolean;
  /**
   * Cost attached to the tokens received. MARKET = their value on receipt
   * (the usual rule when the receipt is itself taxed); ZERO = no cost at all,
   * so the whole later disposal is taxable — Austria's §27a(4) Z 5 EStG and
   * Portugal's art. 5.º n.º 11 CIRS both work that way.
   */
  acquisitionCost: "MARKET" | "ZERO";
  category: LocalizedText;
  flatRate?: string;
  note?: LocalizedText;
  refs?: LegalRef[];
}

export interface IncomeRules extends IncomeKindRule {
  allowance?: Allowance;
  progressive?: boolean;
  /** Overrides for the income kinds a country treats differently from its default. */
  byKind?: Partial<Record<"STAKING" | "MINING" | "AIRDROP" | "LENDING" | "REFERRAL" | "SALARY" | "OTHER", Partial<IncomeKindRule>>>;
}

export interface LossRules {
  /** Losses offset gains of the same category within the year. */
  offsetWithinYear: boolean;
  /** Number of years losses may be carried forward; null means unlimited, 0 means not allowed. */
  carryForwardYears: number | null;
  carryBack?: boolean;
  note?: LocalizedText;
  refs?: LegalRef[];
}

export interface GainsRules {
  kind: "GAINS";
  /** Disposals that trigger taxation. Anything else is deferred. */
  taxableDisposals: DisposalKind[];
  costMethod: LotMethod;
  costMethodLabel: LocalizedText;
  /** Germany applies FIFO wallet by wallet. */
  perWallet: boolean;
  /** Units held at least this many days are exempt (Portugal: 365). */
  exemptAfterDays?: number;
  /**
   * Units held longer than this many whole calendar years are exempt, compared
   * on the calendar rather than on a day count — Germany's §23 EStG exempts a
   * disposal made more than one year after acquisition, which a fixed 365-day
   * test gets wrong across a leap year.
   */
  exemptAfterYears?: number;
  exemptAfterDaysLabel?: LocalizedText;
  /** Units acquired before this date are grandfathered or stepped up. */
  legacyBefore?: string;
  legacyTreatment?: "EXEMPT" | "STEP_UP";
  legacyLabel?: LocalizedText;
  /** Disposal fees reduce the taxable proceeds. */
  deductFees: boolean;
  /**
   * Acquisition fees are added to the cost of the asset acquired. Austria
   * excludes them for private investors (§27a(4) Z 2 EStG); Belgium ignores
   * fees entirely when computing the gain.
   */
  capitaliseAcquisitionFees: boolean;
  /**
   * How a swap that the country does not tax is carried forward.
   * `rollsOverCost` gives the asset received the cost of the asset given up
   * (Austria §27b(3), Portugal art. 10.º n.º 23, Italy's costo medio ponderato).
   * `carriesAcquisitionDate` keeps the original acquisition date, which decides
   * whether a holding-period exemption or a grandfathering status survives.
   */
  deferredSwap?: { rollsOverCost: boolean; carriesAcquisitionDate: boolean; note: LocalizedText };
  /** Disposals matching a predicate raise a review flag rather than being silently classified. */
  flagDisposals?: { id: string; matches: (asset: string, counterAsset: string | undefined, kind: DisposalKind) => boolean; message: LocalizedText }[];
  /** Annual levy on the value held, applied on top of the gains tax (Italy's bollo / IVCA at 2 ‰). */
  wealthLevy?: { rate: string; label: LocalizedText; note: LocalizedText; refs: LegalRef[] };
  years: Record<number, GainsYearParams>;
  income: IncomeRules;
  losses: LossRules;
  /**
   * Set for jurisdictions without personal income tax on these gains (Gulf
   * states). The engine still computes and traces every disposal, but marks it
   * as not taxable and shows this notice instead of an amount.
   */
  noPersonalTax?: LocalizedText;
  /** Obligations that survive the absence of personal income tax. */
  caveats?: LocalizedText[];
  /** Engine variant: France prices disposals against the whole portfolio. */
  variant?: "LOTS" | "FR_PORTFOLIO";
}

/** Countries that tax the stock rather than the flow (Switzerland, Netherlands). */
export interface WealthRules {
  kind: "WEALTH";
  /** Valuation date within the year. */
  referenceDate: { month: number; day: number };
  /**
   * Which end of the reference day counts. Switzerland values the position at
   * the close of 31 December; the Dutch peildatum of 1 January is the position
   * at the start of that day, so a purchase made on 1 January is after it. The
   * difference is a whole day of trading and it changes the amount declared.
   */
  referenceMoment?: "START_OF_DAY" | "END_OF_DAY";
  referenceLabel: LocalizedText;
  /** Capital gains on private assets are exempt. */
  capitalGainsExempt: boolean;
  capitalGainsNote: LocalizedText;
  /** Deemed-return / wealth-tax parameters per year. */
  years: Record<number, WealthYearParams>;
  income: IncomeRules;
  /** Criteria that would move the taxpayer to a business regime. */
  businessTest: LocalizedText[];
  /**
   * Netherlands: the taxpayer may prove the actual return of the year and be
   * taxed on it when it is lower than the deemed return (tegenbewijsregeling).
   */
  actualReturn?: {
    label: LocalizedText;
    note: LocalizedText;
    /** Unrealised value changes are part of the actual return. */
    includeUnrealised: boolean;
    /** Costs are deductible from the actual return. */
    deductCosts: boolean;
    refs: LegalRef[];
  };
  /**
   * Switzerland: the five cumulative criteria of circular no. 36 that keep a
   * taxpayer in the tax-exempt private-investor category.
   */
  qualificationTest?: {
    label: LocalizedText;
    note: LocalizedText;
    /** Minimum holding period, in days, of the assets disposed of. */
    minHoldingDays: number;
    /** Yearly transaction volume must not exceed this multiple of the opening portfolio. */
    maxVolumeMultiple: number;
    /** Criteria the engine cannot observe and that the taxpayer must confirm. */
    declarative: LocalizedText[];
    refs: LegalRef[];
  };
}

export interface WealthYearParams {
  /** Tax-free capital (Netherlands heffingsvrij vermogen). */
  exemptCapital?: string;
  /** Deemed return applied to the holdings (Netherlands). */
  deemedReturnRate?: string;
  /** Rate applied to the deemed return or to net wealth. */
  rate?: string;
  rateLabel?: LocalizedText;
  notes?: LocalizedText[];
}

export type IndividualRules = GainsRules | WealthRules;

/* ------------------------------------------------------------------ Companies */

export type ClosingValuationMode =
  /** Transitory accounts 4742/4752 plus a provision, reversed on the first day of the next year (France, art. 619-12 PCG). */
  | "TRANSITORY_ACCOUNTS"
  /** Lower of cost or market: write the asset down through the P&L, write it back up when allowed. */
  | "WRITE_DOWN"
  /** Remeasure to fair value through profit or loss. */
  | "FAIR_VALUE_PL"
  /** No year-end remeasurement. */
  | "NONE";

export type AuditFileFormat = "FEC" | "DATEV" | "SAFT_PT" | "XAF_NL" | "CSV";

export interface CompanyRules {
  framework: LocalizedText;
  chart: ChartOfAccounts;
  /** Sub-account width used when allocating one account per asset. */
  assetAccountWidth?: number;
  auditFile: AuditFileFormat;
  auditFileNote: LocalizedText;
  closingValuation: ClosingValuationMode;
  closingValuationNote: LocalizedText;
  /** Cost methods the framework accepts, first is the default. */
  costMethods: LotMethod[];
  corporateTax: { label: LocalizedText; rate: string; note?: LocalizedText }[];
  refs: LegalRef[];
}

/* ------------------------------------------------------------------ Reporting */

export interface FormDef {
  /** Official name, in the local language. */
  name: string;
  label: LocalizedText;
  /** Boxes the app fills, keyed by an internal id. */
  boxes: { id: string; box: string; label: LocalizedText; note?: LocalizedText }[];
  deadline?: LocalizedText;
  url?: string;
}

export interface ForeignAccountReporting {
  required: boolean;
  form: string;
  label: LocalizedText;
  threshold?: string;
  penalty?: LocalizedText;
  refs: LegalRef[];
}

/* ------------------------------------------------------------------ Pack */

export interface CountryPack {
  code: CountryCode;
  name: LocalizedText;
  flag: string;
  baseCurrency: string;
  alternativeCurrencies?: string[];
  timezone: string;
  /** Locale used to format numbers and dates for this country. */
  locale: string;
  /** Interface languages a user of this country is likely to want. */
  uiLocales: string[];
  fiscalYear: { endMonth: number; endDay: number };
  /** Personal income tax year, when it differs from the calendar year. */
  personalTaxYear?: { endMonth: number; endDay: number };
  individual: IndividualRules;
  company: CompanyRules;
  forms: FormDef[];
  foreignAccounts?: ForeignAccountReporting;
  dac8: {
    inScope: boolean;
    firstReportedYear?: number;
    note: LocalizedText;
  };
  /** Statements the engine relies on that a local professional must confirm. */
  assumptions: LocalizedText[];
  review: {
    status: "DRAFT" | "REVIEWED";
    lastReviewed: string;
    reviewer?: string;
  };
  refs: LegalRef[];
  /** Engine that computes the personal tax position for this country. */
  engine: (input: TaxComputationInput, pack: CountryPack) => TaxComputationResult;
}

export const t = (fr: string, en: string, native?: string): LocalizedText => ({ fr, en, native });
export const pick = (text: LocalizedText, locale: string): string => (locale.startsWith("fr") ? text.fr : text.en);
export const nativeOr = (text: LocalizedText, locale: string): string => text.native ?? pick(text, locale);
