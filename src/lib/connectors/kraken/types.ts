/** The slices of Kraken's REST answers this connector reads. */
export interface KrakenEnvelope<T> { error: string[]; result: T }

export interface KrakenAssetPair { altname: string; wsname?: string; base: string; quote: string; status?: string }

export interface KrakenTrade {
  ordertxid: string;
  pair: string;
  time: number;          // unix seconds, fractional
  type: "buy" | "sell";
  ordertype: string;
  price: string;
  cost: string;          // quote amount, fee excluded
  fee: string;           // in the quote currency
  vol: string;           // base amount
  margin: string;
  misc: string;
  postxid?: string;
}

export interface KrakenLedger {
  refid: string;
  time: number;          // unix seconds, fractional
  type: string;          // deposit, withdrawal, trade, staking, transfer, spend, receive…
  subtype: string;
  aclass: string;
  asset: string;
  amount: string;        // signed
  fee: string;
  balance: string;
}

export interface KrakenTradesHistory { trades: Record<string, KrakenTrade>; count: number }
export interface KrakenLedgers { ledger: Record<string, KrakenLedger>; count: number }
export type KrakenBalance = Record<string, string>;
