import type { Decimal } from "../money";
import type { CountryCode, LegalRef, TraceStep } from "../trace";
import type { PriceTable } from "../valuation";
import type { ValuedTx } from "../model";

/** How the disposed asset left the taxpayer's hands. */
export type DisposalKind =
  | "FIAT" // sold against a currency with legal tender
  | "CRYPTO" // swapped for another crypto-asset (or stablecoin)
  | "GOODS" // used to pay for a good or a service
  | "FEE" // consumed to pay a platform or network fee
  | "GIFT" // given away
  | "LOST"; // written off

export type IncomeKind = "STAKING" | "MINING" | "AIRDROP" | "LENDING" | "REFERRAL" | "SALARY" | "OTHER";

/** Economic events derived from the transaction stream, before any country rule applies. */
export type EconomicEvent =
  | { kind: "ACQUIRE"; txId: string; at: Date; asset: string; qty: Decimal; costBase: Decimal; counterAsset?: string; wallet: string; source: string; note?: string }
  | { kind: "DISPOSE"; txId: string; at: Date; asset: string; qty: Decimal; proceedsBase: Decimal; feesBase: Decimal; disposalKind: DisposalKind; counterAsset?: string; wallet: string; source: string; note?: string }
  | { kind: "INCOME"; txId: string; at: Date; asset: string; qty: Decimal; valueBase: Decimal; incomeKind: IncomeKind; wallet: string; source: string; note?: string }
  | { kind: "TRANSFER"; txId: string; at: Date; asset: string; qty: Decimal; from: string; to: string; feesBase: Decimal };

/** One taxable line, as it will appear on the declaration and in the audit pack. */
export interface TaxableEvent {
  id: string;
  txId: string;
  date: Date;
  asset: string;
  qty: Decimal;
  disposalKind: DisposalKind;
  counterAsset?: string;
  /** Gross amount received, before deducting fees. */
  proceeds: Decimal;
  fees: Decimal;
  /** Net amount retained by the local rule (often proceeds − fees). */
  netProceeds: Decimal;
  /** Cost allowed against the proceeds by the local rule. */
  costBasis: Decimal;
  gain: Decimal;
  /** True when the rule exempts this particular disposal (holding period, grandfathering…). */
  exempt: boolean;
  exemptReason?: string;
  holdingDays?: number;
  /** Extra columns a given country needs on its form (e.g. portfolio value for France). */
  extra: Record<string, string>;
  trace: TraceStep;
  warnings: string[];
}

export interface IncomeItem {
  id: string;
  txId: string;
  date: Date;
  asset: string;
  qty: Decimal;
  valueBase: Decimal;
  incomeKind: IncomeKind;
  /** Category under local law, in the local vocabulary (e.g. "sonstige Einkünfte § 22 Nr. 3 EStG"). */
  category: string;
  taxable: boolean;
  exemptReason?: string;
  trace: TraceStep;
}

/** A line to copy into an official form. */
export interface FormLine {
  form: string;
  box: string;
  label: string;
  value: string;
  raw?: string;
  note?: string;
  trace?: TraceStep;
}

export interface YearSummary {
  year: number;
  currency: string;
  disposalCount: number;
  grossProceeds: Decimal;
  gains: Decimal;
  losses: Decimal;
  netGain: Decimal;
  /** Amount actually subject to tax after thresholds, exemptions and loss offsets. */
  taxableBase: Decimal;
  /** Estimated tax, when the country has a flat or computable rate. */
  estimatedTax: Decimal | null;
  /** Breakdown of the estimate, e.g. income tax vs social contributions. */
  taxBreakdown: { label: string; amount: Decimal; rate?: string }[];
  incomeTotal: Decimal;
  incomeTaxable: Decimal;
  lossCarryForward: Decimal;
  notes: string[];
  formLines: FormLine[];
  trace: TraceStep;
}

export interface WealthSnapshot {
  year: number;
  at: Date;
  currency: string;
  holdings: { asset: string; qty: Decimal; unitValue: Decimal | null; value: Decimal; source: string }[];
  total: Decimal;
  missing: string[];
  notes: string[];
  formLines: FormLine[];
  trace: TraceStep;
}

export interface TaxComputationInput {
  country: CountryCode;
  currency: string;
  valued: ValuedTx[];
  prices: PriceTable;
  /** Quantities held outside the imported accounts, declared by the taxpayer. */
  externalHoldings?: Record<string, Decimal>;
  /** Overrides chosen by the user among the options the country allows. */
  options?: Record<string, string | number | boolean>;
  /** Restrict the computation to these years (default: all years with activity). */
  years?: number[];
  now?: Date;
}

export interface TaxComputationResult {
  country: CountryCode;
  currency: string;
  regime: string;
  regimeLabel: string;
  events: TaxableEvent[];
  income: IncomeItem[];
  years: YearSummary[];
  wealth: WealthSnapshot[];
  warnings: { level: "info" | "warning" | "error"; message: string; txId?: string }[];
  refs: LegalRef[];
  /** Everything the engine assumed, listed so a professional can check it. */
  assumptions: string[];
  computedAt: Date;
}

export interface TaxEngine {
  id: string;
  country: CountryCode;
  compute(input: TaxComputationInput): TaxComputationResult;
}
