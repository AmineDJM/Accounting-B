import type { Decimal } from "@/lib/engine/money";
import type { LegalRef, TraceStep } from "@/lib/engine/trace";

/**
 * Canonical model of a DAC8 / CARF annual statement.
 *
 * A Reporting Crypto-Asset Service Provider does not report individual trades:
 * for each reportable user and each Relevant Crypto-Asset, it reports the eight
 * aggregates below, with a number of transactions, a number of units and an
 * amount **net of transaction fees**. The names used here are the element names
 * of the OECD CARF XML schema v1.5, so a statement received from any provider
 * maps onto them without interpretation, and a divergence points at a real
 * difference rather than at a naming choice.
 *
 * Two traps this model deliberately encodes:
 *  - there is **no year-end holdings element** in CARF. A provider that sends
 *    one is answering a domestic obligation (Spain's Modelo 172, Italy's
 *    quadro RW support), never DAC8.
 *  - `TransferWallet` is not a ninth category of movement: it is the subset of
 *    outbound transfers going to an address the provider does not know to
 *    belong to a VASP or a financial institution, reported a second time.
 */
export type Dac8Bucket =
  | "CryptotoCryptoIn"
  | "CryptotoCryptoOut"
  | "CryptoFiatIn"
  | "CryptoFiatOut"
  | "CryptoTransferIn"
  | "CryptoTransferOut"
  | "TransferWallet"
  | "RRPT";

export const DAC8_BUCKETS: Dac8Bucket[] = [
  "CryptoFiatIn",
  "CryptoFiatOut",
  "CryptotoCryptoIn",
  "CryptotoCryptoOut",
  "CryptoTransferIn",
  "CryptoTransferOut",
  "TransferWallet",
  "RRPT",
];

/** Buckets that carry a NumberofTransactions element. TransferWallet does not. */
export const BUCKETS_WITH_COUNT: Dac8Bucket[] = DAC8_BUCKETS.filter((b) => b !== "TransferWallet");

/** Buckets that represent a disposal for tax purposes, used for the headline total. */
export const DISPOSAL_BUCKETS: Dac8Bucket[] = ["CryptoFiatOut", "CryptotoCryptoOut", "RRPT"];

export const BUCKET_LABELS: Record<Dac8Bucket, { fr: string; en: string; element: string }> = {
  CryptoFiatIn: { fr: "Acquisitions contre monnaie fiduciaire", en: "Acquisitions against fiat currency", element: "CryptoFiatIn" },
  CryptoFiatOut: { fr: "Cessions contre monnaie fiduciaire", en: "Disposals against fiat currency", element: "CryptoFiatOut" },
  CryptotoCryptoIn: { fr: "Acquisitions contre d'autres crypto-actifs", en: "Acquisitions against other crypto-assets", element: "CryptotoCryptoIn" },
  CryptotoCryptoOut: { fr: "Cessions contre d'autres crypto-actifs", en: "Disposals against other crypto-assets", element: "CryptotoCryptoOut" },
  CryptoTransferIn: { fr: "Transferts entrants", en: "Inbound transfers", element: "CryptoTransferIn" },
  CryptoTransferOut: { fr: "Transferts sortants", en: "Outbound transfers", element: "CryptoTransferOut" },
  TransferWallet: { fr: "Transferts vers une adresse non rattachée à un prestataire", en: "Transfers to addresses not known to belong to a VASP", element: "TransferWallet" },
  RRPT: { fr: "Paiements de détail déclarables (> 50 000 USD)", en: "Reportable retail payment transactions (> USD 50,000)", element: "RRPT" },
};

export const BUCKET_DESCRIPTIONS: Record<Dac8Bucket, { fr: string; en: string }> = {
  CryptoFiatIn: {
    fr: "Montant payé pour acquérir le crypto-actif contre une monnaie ayant cours légal, net des frais de transaction.",
    en: "Amount paid to acquire the crypto-asset against a fiat currency, net of transaction fees.",
  },
  CryptoFiatOut: {
    fr: "Montant reçu en cédant le crypto-actif contre une monnaie ayant cours légal, net des frais de transaction.",
    en: "Amount received on disposing of the crypto-asset against a fiat currency, net of transaction fees.",
  },
  CryptotoCryptoIn: {
    fr: "Valeur vénale du crypto-actif acquis en échange d'autres crypto-actifs, nette des frais.",
    en: "Fair market value of the crypto-asset acquired against other crypto-assets, net of fees.",
  },
  CryptotoCryptoOut: {
    fr: "Valeur vénale du crypto-actif cédé en échange d'autres crypto-actifs, nette des frais.",
    en: "Fair market value of the crypto-asset disposed of against other crypto-assets, net of fees.",
  },
  CryptoTransferIn: {
    fr: "Valeur vénale des crypto-actifs reçus : airdrop, revenus de staking, minage, prêt, transfert depuis un autre prestataire, vente de biens ou services, garantie.",
    en: "Fair market value of crypto-assets received: airdrop, staking income, mining, loan, transfer from another provider, sale of goods or services, collateral.",
  },
  CryptoTransferOut: {
    fr: "Valeur vénale des crypto-actifs envoyés hors du prestataire, hors paiements déjà déclarés en RRPT.",
    en: "Fair market value of crypto-assets sent out, excluding payments already reported as RRPT.",
  },
  TransferWallet: {
    fr: "Sous-ensemble des transferts sortants vers des adresses que le prestataire ne rattache ni à un prestataire de services sur actifs virtuels ni à une institution financière. Aucun nombre de transactions n'est déclaré pour cet élément.",
    en: "Subset of outbound transfers to addresses the provider does not associate with a VASP or a financial institution. No transaction count is reported for this element.",
  },
  RRPT: {
    fr: "Transferts de crypto-actifs en contrepartie de biens ou de services d'une valeur supérieure à 50 000 USD, quel que soit l'arrondi.",
    en: "Transfers of crypto-assets in consideration for goods or services exceeding USD 50,000, irrespective of rounding.",
  },
};

/** CARF ExchangeType_EnumType — qualifies an exchange transaction. */
export const EXCHANGE_TYPES: Record<string, { fr: string; en: string }> = {
  CARF401: { fr: "Staking", en: "Staking" },
  CARF402: { fr: "Prêt de crypto-actifs", en: "Crypto loan" },
  CARF403: { fr: "Wrapping", en: "Wrapping" },
  CARF404: { fr: "Garantie", en: "Collateral" },
};

/** CARF TransferType_EnumType — inbound transfers. */
export const TRANSFER_IN_TYPES: Record<string, { fr: string; en: string }> = {
  CARF501: { fr: "Airdrop", en: "Airdrop" },
  CARF502: { fr: "Revenus de staking", en: "Staking income" },
  CARF503: { fr: "Revenus de minage", en: "Mining income" },
  CARF504: { fr: "Prêt de crypto-actifs", en: "Crypto loan" },
  CARF505: { fr: "Transfert depuis un autre prestataire déclarant", en: "Transfer from another RCASP" },
  CARF506: { fr: "Vente de biens ou de services", en: "Sale of goods or services" },
  CARF507: { fr: "Garantie", en: "Collateral" },
  CARF508: { fr: "Autre", en: "Other" },
  CARF509: { fr: "Inconnu", en: "Unknown" },
};

/** CARF TransferOutType_EnumType — outbound transfers. */
export const TRANSFER_OUT_TYPES: Record<string, { fr: string; en: string }> = {
  CARF601: { fr: "Transfert vers un autre prestataire déclarant", en: "Transfer to another RCASP" },
  CARF602: { fr: "Prêt de crypto-actifs", en: "Crypto loan" },
  CARF603: { fr: "Achat de biens ou de services", en: "Purchase of goods or services" },
  CARF604: { fr: "Garantie", en: "Collateral" },
  CARF605: { fr: "Autre", en: "Other" },
  CARF606: { fr: "Inconnu", en: "Unknown" },
};

/** CARF AltValuation_EnumType — valuation fallback used by the provider. */
export const ALT_VALUATIONS: Record<string, { fr: string; en: string }> = {
  CARF1001: { fr: "Valeur comptable", en: "Book value" },
  CARF1002: { fr: "Valeur d'un tiers", en: "Third-party value" },
  CARF1003: { fr: "Valorisation récente du prestataire", en: "Recent RCASP valuation" },
  CARF1004: { fr: "Estimation raisonnable du prestataire", en: "Reasonable estimate by RCASP" },
};

/** Threshold above which a payment in crypto for goods or services becomes an RRPT. */
export const RRPT_THRESHOLD_USD = "50000";

export interface Dac8Line {
  asset: string;
  bucket: Dac8Bucket;
  /** NumberofTransactions. Absent for TransferWallet, which does not carry one. */
  count: number | null;
  /** NumberofUnits, reported to six decimal places. */
  units: Decimal | null;
  /** Amount, net of transaction fees, in the statement currency. */
  amount: Decimal | null;
  /** ExchangeType / TransferType code when the provider qualified the line. */
  typeCode?: string;
  /** AltValuation code when the provider could not use a market price. */
  altValuation?: string;
}

/**
 * A holdings line is **not** part of CARF. It is kept because several domestic
 * regimes require one and providers ship it in the same file.
 */
export interface Dac8HoldingLine {
  asset: string;
  units: Decimal;
  fairMarketValue: Decimal | null;
  at?: Date;
}

export interface Dac8Statement {
  caspName: string;
  caspCountry?: string;
  /** CASP identifier: TIN, LEI or the national registration number. */
  caspIdentifier?: string;
  year: number;
  currency: string;
  lines: Dac8Line[];
  /** Domestic extra, outside CARF. */
  holdings: Dac8HoldingLine[];
  /** Anything the parser could not interpret, kept for the audit trail. */
  unmapped: string[];
  source: "CSV" | "XML" | "MANUAL";
  /** Set when the file carried a year-end holdings block, which CARF does not define. */
  holdingsOutsideCarf?: boolean;
}

export interface ReconciliationLine {
  asset: string;
  bucket: Dac8Bucket;
  statement: { count: number | null; units: Decimal | null; amount: Decimal | null } | null;
  computed: { count: number; units: Decimal; amount: Decimal };
  deltaCount: number | null;
  deltaUnits: Decimal | null;
  deltaAmount: Decimal | null;
  status: "MATCH" | "MINOR" | "DIFFERENCE" | "MISSING_IN_APP" | "MISSING_IN_STATEMENT";
  /** Transactions the app counted in this bucket, for drill-down. */
  txIds: string[];
  explanation: string;
  trace: TraceStep;
}

export interface ReconciliationResult {
  year: number;
  currency: string;
  caspName: string;
  status: "MATCH" | "DIFFERENCES" | "FAILED";
  lines: ReconciliationLine[];
  holdings: {
    asset: string;
    statementUnits: Decimal | null;
    computedUnits: Decimal;
    deltaUnits: Decimal | null;
    statementValue: Decimal | null;
    computedValue: Decimal | null;
    status: ReconciliationLine["status"];
    explanation: string;
  }[];
  totals: { statementDisposals: Decimal; computedDisposals: Decimal; delta: Decimal };
  advice: string[];
  refs: LegalRef[];
  trace: TraceStep;
}

export const DAC8_REFS: LegalRef[] = [
  { jurisdiction: "EU", code: "Directive (UE) 2023/2226 (DAC8)", title: "Coopération administrative dans le domaine fiscal — déclaration des crypto-actifs", url: "https://eur-lex.europa.eu/legal-content/FR/TXT/?uri=CELEX%3A32023L2226", asOf: "2023-10-17" },
  { jurisdiction: "EU", code: "Directive 2011/16/UE, annexe VI, section II, partie B", title: "Informations à déclarer : opérations d'échange, transferts et paiements de détail déclarables", asOf: "2026-01-01" },
  { jurisdiction: "OECD", code: "Crypto-Asset Reporting Framework (CARF), section II.B", title: "Cadre de déclaration des crypto-actifs et amendements à la NCD", url: "https://www.oecd.org/tax/exchange-of-tax-information/crypto-asset-reporting-framework-and-amendments-to-the-common-reporting-standard.htm", asOf: "2023-06-08" },
  { jurisdiction: "OECD", code: "CARF XML Schema v1.5, RelevantTransactions_Type", title: "Éléments CryptoFiatIn/Out, CryptotoCryptoIn/Out, CryptoTransferIn/Out, TransferWallet, RRPT — montants nets de frais", asOf: "2025-10-01" },
];
