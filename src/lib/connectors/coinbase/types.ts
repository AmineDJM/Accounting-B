/** The slices of Coinbase's answers this connector reads. */
export interface CoinbaseFill {
  entry_id: string;
  trade_id: string;
  order_id: string;
  trade_time: string;       // ISO 8601
  trade_type?: string;
  price: string;
  size: string;
  commission: string;       // in the quote currency
  product_id: string;       // "BTC-EUR"
  size_in_quote?: boolean;
  side: "BUY" | "SELL";
}

export interface CoinbaseFills { fills: CoinbaseFill[]; cursor?: string }

export interface CoinbaseV3Account {
  uuid: string;
  name?: string;
  currency: string;
  available_balance?: { value: string; currency: string };
  hold?: { value: string; currency: string };
  type?: string;
}
export interface CoinbaseV3Accounts { accounts: CoinbaseV3Account[]; has_next?: boolean; cursor?: string; size?: number }

export interface CoinbaseMoney { amount: string; currency: string }

export interface CoinbaseV2Account {
  id: string;
  name?: string;
  currency: string | { code: string };
  balance?: CoinbaseMoney;
  type?: string;
}

export interface CoinbaseV2Transaction {
  id: string;
  type: string;
  status: string;
  amount: CoinbaseMoney;          // signed, in the account's asset
  native_amount?: CoinbaseMoney;  // signed, in the user's reporting currency
  created_at: string;
  updated_at?: string;
  network?: { status?: string; hash?: string; name?: string; transaction_fee?: CoinbaseMoney };
  to?: { resource?: string; address?: string; email?: string; name?: string };
  from?: { resource?: string; address?: string; email?: string; name?: string };
  details?: { title?: string; subtitle?: string; header?: string };
  trade?: { id?: string };
  buy?: { id?: string };
  sell?: { id?: string };
}

export interface CoinbasePaged<T> { data: T[]; pagination?: { next_uri?: string | null; next_starting_after?: string | null } }
