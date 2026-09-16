import { D } from "@/lib/engine/money";
import { isFiat, type CanonicalTx, type Leg } from "@/lib/engine/model";
import type { KrakenLedger, KrakenTrade } from "./types";

const src = "kraken_api" as const;

/**
 * Kraken's tickers into the ones everyone else uses.
 *
 * Kraken still carries its ISO-4217-inspired prefixes — X for crypto, Z for
 * fiat — on its older assets, and suffixes for the wallet a balance sits in:
 * `.S` staked, `.M` opt-in rewards, `.F` earn, `.B` bonded, `.HOLD`. The suffix
 * says where a token is, not what it is, so it is dropped: a staked bitcoin is
 * a bitcoin, and keeping them apart would split one cost basis in two.
 */
export function normaliseAsset(raw: string): string {
  let a = raw.trim().toUpperCase();
  a = a.replace(/\.(S|M|F|B|P|HOLD|STAKED)\d*$/i, "");
  if (a.length === 4 && (a.startsWith("X") || a.startsWith("Z"))) a = a.slice(1);
  if (a === "XBT") return "BTC";
  if (a === "XDG") return "DOGE";
  // Kraken converted its ETH2 receipt token back into ether in 2023; the
  // history keeps the old ticker, the holding is ether.
  if (a === "ETH2") return "ETH";
  return a;
}

const ts = (seconds: number) => new Date(Math.round(seconds * 1000));

export interface KrakenContext {
  accountId: string;
  /** Pair code -> its two sides, from the public AssetPairs list. */
  pairs: Map<string, { base: string; quote: string }>;
}

/**
 * Spot trades.
 *
 * `cost` is the quote amount without the fee and `vol` the base amount, so a
 * purchase leaves `cost` of quote and brings in `vol` of base; the fee is
 * charged in the quote currency unless the order was set otherwise, which
 * Kraken reports in `misc`.
 */
export function fromTrades(trades: Record<string, KrakenTrade>, ctx: KrakenContext): { txs: CanonicalTx[]; warnings: string[] } {
  const txs: CanonicalTx[] = [];
  const warnings: string[] = [];
  const unknownPairs = new Set<string>();

  for (const [id, t] of Object.entries(trades)) {
    if (D(t.margin ?? "0").gt(0)) {
      warnings.push(`Trade ${id} sur marge : non pris en charge, à saisir à la main.`);
      continue;
    }
    const pair = ctx.pairs.get(t.pair);
    if (!pair) {
      unknownPairs.add(t.pair);
      continue;
    }
    const base = normaliseAsset(pair.base);
    const quote = normaliseAsset(pair.quote);
    const vol = D(t.vol);
    const cost = D(t.cost);
    const legs: Leg[] =
      t.type === "buy"
        ? [{ asset: quote, amount: cost, role: "OUT" }, { asset: base, amount: vol, role: "IN" }]
        : [{ asset: base, amount: vol, role: "OUT" }, { asset: quote, amount: cost, role: "IN" }];
    const fee = D(t.fee);
    // "fcib" in `misc` means the fee was taken in the base currency instead.
    if (fee.gt(0)) legs.push({ asset: /fcib/i.test(t.misc ?? "") ? base : quote, amount: fee, role: "FEE" });
    txs.push({
      id: `krk:trade:${id}`,
      accountId: ctx.accountId,
      source: src,
      externalId: `trade:${id}`,
      timestamp: ts(t.time),
      type: "TRADE",
      category: "TRADE",
      legs,
      ref: `Kraken ${t.type === "buy" ? "achat" : "vente"} ${base}/${quote} ${id}`,
    });
  }
  if (unknownPairs.size) warnings.push(`Paires inconnues ignorées : ${[...unknownPairs].join(", ")}.`);
  return { txs, warnings };
}

/** Ledger entry types that the trades endpoint already covers or that stay inside Kraken. */
const COVERED_BY_TRADES = new Set(["trade"]);
const INTERNAL = new Set(["transfer"]);
const REWARDS = new Set(["staking", "reward", "dividend", "earn"]);
const UNSUPPORTED = new Set(["margin", "rollover", "settled", "sale", "credit", "nfttrade", "nftcreatorfee"]);

/**
 * Everything that is not a spot trade: money in, money out, rewards, and the
 * instant buy/sell pairs Kraken records as a `spend` and a `receive` sharing
 * one reference.
 */
export function fromLedgers(ledgers: Record<string, KrakenLedger>, ctx: KrakenContext): { txs: CanonicalTx[]; warnings: string[]; skipped: Record<string, number> } {
  const txs: CanonicalTx[] = [];
  const warnings: string[] = [];
  const skipped: Record<string, number> = {};
  const note = (type: string) => { skipped[type] = (skipped[type] ?? 0) + 1; };

  // A spend and a receive with the same reference are the two sides of one
  // conversion; pairing them keeps it a trade instead of two mysteries.
  const byRef = new Map<string, { id: string; row: KrakenLedger }[]>();
  for (const [id, row] of Object.entries(ledgers)) {
    if (row.type === "spend" || row.type === "receive") {
      const list = byRef.get(row.refid) ?? [];
      list.push({ id, row });
      byRef.set(row.refid, list);
    }
  }
  const pairedIds = new Set<string>();
  for (const [refid, rows] of byRef) {
    const spend = rows.find((r) => r.row.type === "spend");
    const receive = rows.find((r) => r.row.type === "receive");
    if (!spend || !receive) continue;
    pairedIds.add(spend.id);
    pairedIds.add(receive.id);
    const out = normaliseAsset(spend.row.asset);
    const into = normaliseAsset(receive.row.asset);
    const legs: Leg[] = [
      { asset: out, amount: D(spend.row.amount).abs(), role: "OUT" },
      { asset: into, amount: D(receive.row.amount).abs(), role: "IN" },
    ];
    const fee = D(spend.row.fee).plus(D(receive.row.fee));
    if (fee.gt(0)) legs.push({ asset: out, amount: fee, role: "FEE" });
    txs.push({
      id: `krk:conv:${refid}`,
      accountId: ctx.accountId,
      source: src,
      externalId: `convert:${refid}`,
      timestamp: ts(Math.min(spend.row.time, receive.row.time)),
      type: "TRADE",
      category: "TRADE",
      legs,
      ref: `Kraken conversion ${out} → ${into} ${refid}`,
    });
  }

  for (const [id, row] of Object.entries(ledgers)) {
    if (pairedIds.has(id)) continue;
    const type = row.type.toLowerCase();
    if (COVERED_BY_TRADES.has(type)) { note(type); continue; }
    if (INTERNAL.has(type)) { note(type); continue; }
    if (UNSUPPORTED.has(type)) { note(type); continue; }

    const asset = normaliseAsset(row.asset);
    const amount = D(row.amount);
    const fee = D(row.fee);
    const fiat = isFiat(asset);

    if (type === "deposit" || (type === "adjustment" && amount.gt(0)) || REWARDS.has(type)) {
      const legs: Leg[] = [{ asset, amount: amount.abs(), role: "IN" }];
      if (fee.gt(0)) legs.push({ asset, amount: fee, role: "FEE" });
      txs.push({
        id: `krk:led:${id}`,
        accountId: ctx.accountId,
        source: src,
        externalId: `ledger:${id}`,
        timestamp: ts(row.time),
        type: REWARDS.has(type) ? "REWARD" : type === "adjustment" ? "ADJUSTMENT" : fiat ? "FIAT_DEPOSIT" : "CRYPTO_DEPOSIT",
        category: REWARDS.has(type) ? "STAKING_INCOME" : type === "adjustment" ? "FOUND" : fiat ? "BANK_TRANSFER" : "UNKNOWN",
        legs,
        counterparty: fiat ? { kind: "BANK" } : { kind: "UNKNOWN" },
        ref: `Kraken ${type} ${asset} ${row.refid}`,
        note: row.subtype || undefined,
      });
      continue;
    }

    if (type === "withdrawal" || type === "spend" || (type === "adjustment" && amount.lt(0))) {
      const legs: Leg[] = [{ asset, amount: amount.abs(), role: "OUT" }];
      if (fee.gt(0)) legs.push({ asset, amount: fee, role: "FEE" });
      txs.push({
        id: `krk:led:${id}`,
        accountId: ctx.accountId,
        source: src,
        externalId: `ledger:${id}`,
        timestamp: ts(row.time),
        type: type === "adjustment" ? "ADJUSTMENT" : fiat ? "FIAT_WITHDRAWAL" : "CRYPTO_WITHDRAWAL",
        category: type === "adjustment" ? "LOST" : fiat ? "BANK_TRANSFER" : "UNKNOWN",
        legs,
        counterparty: fiat ? { kind: "BANK" } : { kind: "UNKNOWN" },
        ref: `Kraken ${type} ${asset} ${row.refid}`,
        note: row.subtype || undefined,
      });
      continue;
    }

    // An unknown type is reported rather than dropped in silence.
    note(type);
    warnings.push(`Type de registre Kraken non reconnu : ${row.type}${row.subtype ? ` (${row.subtype})` : ""}.`);
  }

  const internal = skipped.transfer ?? 0;
  if (internal) warnings.push(`${internal} transfert(s) internes Kraken (spot ↔ staking) ignorés : la position ne change pas.`);
  for (const t of UNSUPPORTED) {
    if (skipped[t]) warnings.push(`${skipped[t]} opération(s) « ${t} » non prises en charge : à saisir à la main.`);
  }
  return { txs, warnings: [...new Set(warnings)], skipped };
}
