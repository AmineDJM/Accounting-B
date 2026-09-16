import type { Decimal } from "./money";

/**
 * Canonical transaction model.
 *
 * Every source (Binance API, Binance CSV export, another exchange, a manual
 * entry) is normalised into this shape before the accounting engine sees it.
 * A transaction is a set of asset movements ("legs") that happened together:
 *
 *   - a spot trade BTC/EUR = OUT 1 000 EUR, IN 0.02 BTC, FEE 0.00002 BTC
 *   - a fiat deposit       = IN 1 000 EUR (from the bank), FEE 5 EUR
 *   - an on-chain payment  = OUT 0.5 ETH (to a supplier), FEE 0.001 ETH
 */

export type TxType =
  | "TRADE" // exchange of one asset for another (spot, convert, card purchase paid in fiat)
  | "FIAT_DEPOSIT" // bank -> exchange
  | "FIAT_WITHDRAWAL" // exchange -> bank
  | "CRYPTO_DEPOSIT" // on-chain / off-chain receipt of crypto
  | "CRYPTO_WITHDRAWAL" // on-chain / off-chain send of crypto
  | "REWARD" // staking, earn, launchpool, referral, cashback, airdrop
  | "ADJUSTMENT" // reconciliation delta (tokens appeared / disappeared)
  | "FEE"; // stand-alone fee (e.g. inactivity fee)

/** How the user (or a heuristic) classified the economic nature of a movement. */
export type Category =
  | "INTERNAL_TRANSFER" // between two wallets/accounts of the same entity
  | "BANK_TRANSFER" // fiat between bank and exchange
  | "PURCHASE_GOODS" // paid a supplier in crypto (expense)
  | "CUSTOMER_RECEIPT" // received crypto from a customer (revenue / receivable)
  | "OWNER_CONTRIBUTION" // apport / compte courant d'associé
  | "OWNER_WITHDRAWAL"
  | "STAKING_INCOME"
  | "AIRDROP"
  | "GIFT_RECEIVED"
  | "GIFT_GIVEN"
  | "LOST"
  | "FOUND"
  | "TRADE"
  | "UNKNOWN";

export type LegRole = "IN" | "OUT" | "FEE";

export interface Leg {
  asset: string; // ticker, upper-case (BTC, ETH, EUR, USDT...)
  amount: Decimal; // always positive
  role: LegRole;
}

export interface Counterparty {
  kind: "SELF" | "EXTERNAL" | "BANK" | "EXCHANGE" | "UNKNOWN";
  address?: string;
  network?: string;
  txHash?: string;
  label?: string;
}

export interface CanonicalTx {
  id: string;
  accountId: string; // exchange account (source of the data)
  source: "binance_api" | "binance_csv" | "manual" | "generic_csv";
  externalId: string; // stable id from the source, used for de-duplication
  timestamp: Date; // UTC instant of execution
  type: TxType;
  category: Category;
  legs: Leg[];
  counterparty?: Counterparty;
  ref?: string; // order id / trade id / bank reference -> FEC PieceRef
  note?: string;
  /** Optional: unit prices in EUR already known from the source (e.g. fiat purchases). */
  knownUnitPriceEur?: Record<string, Decimal>;
}

/** Price of one unit of `asset` in EUR at `at`. */
export interface PriceQuote {
  asset: string;
  at: Date;
  priceEur: Decimal;
  source: string; // "binance:BTCEUR", "binance:ETHUSDT*EURUSDT", "ecb", "manual", "implied"
}

/**
 * A valued leg: quantity plus the EUR unit price retained for accounting.
 */
export interface ValuedLeg extends Leg {
  unitPriceEur: Decimal;
  valueEur: Decimal; // amount * unitPriceEur (unrounded)
  priceSource: string;
}

export interface ValuedTx extends Omit<CanonicalTx, "legs"> {
  legs: ValuedLeg[];
  /** Gross EUR value of the operation (before fees), as retained for the books. */
  grossValueEur: Decimal;
  feeValueEur: Decimal;
  warnings: string[];
}

export const FIAT_CURRENCIES = new Set([
  "EUR", "USD", "GBP", "CHF", "JPY", "CAD", "AUD", "NZD", "SEK", "NOK", "DKK", "PLN", "CZK", "HUF", "RON",
  "BGN", "TRY", "ZAR", "BRL", "MXN", "ARS", "NGN", "UAH", "RUB", "KZT", "INR", "IDR", "KRW", "HKD", "SGD",
  "AED", "SAR", "VND", "PHP", "THB", "MYR", "COP", "PEN", "CLP", "ILS", "EGP", "MAD", "TWD", "CNY",
]);

/** Fiat-pegged tokens issued by exchanges (Binance IDR, Binance VND...). */
export const FIAT_WRAPPERS: Record<string, string> = { BIDR: "IDR", IDRT: "IDR", BVND: "VND", BKRW: "KRW", BUSD: "USD" };

export const STABLECOINS = new Set(["USDT", "USDC", "BUSD", "TUSD", "USDP", "DAI", "FDUSD", "USDS", "UST", "EURI", "EURC", "EURT", "AEUR", "PYUSD", "GUSD", "USDD"]);

export const isFiat = (asset: string): boolean => FIAT_CURRENCIES.has(asset.toUpperCase());
export const isStable = (asset: string): boolean => STABLECOINS.has(asset.toUpperCase());

/** For the individual regime (art. 150 VH bis CGI): only fiat with legal tender status is "monnaie". Stablecoins are still actifs numériques. */
export const isLegalTender = (asset: string): boolean => isFiat(asset);
