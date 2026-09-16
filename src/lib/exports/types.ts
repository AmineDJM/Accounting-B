import type { Decimal } from "@/lib/engine/money";
import type { JournalEntry } from "@/lib/engine/journal";
import type { ChartOfAccounts } from "@/lib/engine/chart";
import type { CountryCode } from "@/lib/engine/trace";
import type { AuditFileFormat } from "@/lib/countries/types";

export type { AuditFileFormat };

export interface AuditFileEntity {
  name: string;
  /** National registration number: SIREN, NIPC, KvK, UID, Steuernummer. */
  legalId?: string;
  /** VAT identification number, when the entity has one. */
  vatId?: string;
  country: CountryCode;
  currency: string;
  address?: {
    street?: string;
    number?: string;
    detail?: string;
    city?: string;
    postalCode?: string;
    region?: string;
    country?: string;
  };
  /** DATEV only: the practice's consultant number and the client number. */
  consultantNumber?: string;
  clientNumber?: string;
  /** Length of the general-ledger account numbers, as configured in the target system. */
  accountLength?: number;
}

export interface AccountBalance {
  number: string;
  label: string;
  openingDebit?: Decimal;
  openingCredit?: Decimal;
  closingDebit?: Decimal;
  closingCredit?: Decimal;
  /** SAF-T PT taxonomy category: GR (grouping) or GM (movement). */
  groupingCategory?: string;
  groupingCode?: string;
  /** XAF: B for a balance-sheet account, P for a profit-and-loss account. */
  accountType?: "B" | "P";
}

export interface AuditFileInput {
  entity: AuditFileEntity;
  fiscalYear: { start: Date; end: Date; label?: string };
  entries: JournalEntry[];
  chart?: ChartOfAccounts;
  /** Accounts with their balances, used by the formats that carry master files. */
  accounts?: AccountBalance[];
  generatedAt?: Date;
  software?: { name: string; version: string; producerVatId?: string; certificate?: string };
  timezone?: string;
  /** Free-text comment carried in the file header where the format allows one. */
  comment?: string;
}

export interface AuditFileOutput {
  format: AuditFileFormat;
  fileName: string;
  content: string;
  encoding: "utf-8" | "windows-1252";
  mimeType: string;
  /** Problems that make the file unfit for filing as it is. */
  warnings: string[];
  /** What a professional must check before filing, and why. */
  notes: string[];
  stats: { entries: number; lines: number; debit: Decimal; credit: Decimal };
}

export type AuditFileExporter = (input: AuditFileInput) => AuditFileOutput;
