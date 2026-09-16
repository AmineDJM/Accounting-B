import { D } from "@/lib/engine/money";
import type { CanonicalTx, Leg } from "@/lib/engine/model";
import type { CoinbaseFill, CoinbaseV2Transaction } from "./types";

const src = "coinbase_api" as const;

export interface CoinbaseContext {
  accountId: string;
  selfAddresses?: Set<string>;
}

/**
 * Advanced Trade fills.
 *
 * A fill states the product ("BTC-EUR"), a price, a size and a commission. The
 * size is normally the base quantity, but an order placed in quote terms
 * reports it the other way round — `size_in_quote` says which, and getting it
 * wrong would invert the whole trade.
 */
export function fromFills(fills: CoinbaseFill[], ctx: CoinbaseContext): { txs: CanonicalTx[]; warnings: string[] } {
  const txs: CanonicalTx[] = [];
  const warnings: string[] = [];
  for (const f of fills) {
    const [base, quote] = f.product_id.split("-");
    if (!base || !quote) {
      warnings.push(`Produit Coinbase non reconnu : ${f.product_id}.`);
      continue;
    }
    const price = D(f.price);
    const size = D(f.size);
    if (price.lte(0)) {
      warnings.push(`Exécution ${f.trade_id} sans prix : ignorée.`);
      continue;
    }
    const baseAmount = f.size_in_quote ? size.div(price) : size;
    const quoteAmount = f.size_in_quote ? size : size.times(price);
    const buy = f.side === "BUY";
    const legs: Leg[] = buy
      ? [{ asset: quote, amount: quoteAmount, role: "OUT" }, { asset: base, amount: baseAmount, role: "IN" }]
      : [{ asset: base, amount: baseAmount, role: "OUT" }, { asset: quote, amount: quoteAmount, role: "IN" }];
    const fee = D(f.commission || "0");
    if (fee.gt(0)) legs.push({ asset: quote, amount: fee, role: "FEE" });
    txs.push({
      id: `cb:fill:${f.entry_id || f.trade_id}`,
      accountId: ctx.accountId,
      source: src,
      externalId: `fill:${f.entry_id || f.trade_id}`,
      timestamp: new Date(f.trade_time),
      type: "TRADE",
      category: "TRADE",
      legs,
      ref: `Coinbase ${buy ? "achat" : "vente"} ${f.product_id} #${f.trade_id}`,
    });
  }
  return { txs, warnings };
}

/** Movements that stay inside Coinbase and change no position. */
const INTERNAL = new Set(["pro_deposit", "pro_withdrawal", "exchange_deposit", "exchange_withdrawal", "transfer", "vault_withdrawal", "vault_deposit"]);
/** Already read from the Advanced Trade fills. */
const COVERED_BY_FILLS = new Set(["advanced_trade_fill"]);
const REWARDS = new Set(["staking_reward", "inflation_reward", "interest", "earn_payout", "reward"]);

const assetOf = (m: { currency: string }) => m.currency.toUpperCase();

/**
 * The account ledger (v2), which carries what the trading endpoints do not:
 * money in and out, on-chain sends, rewards, simple buys made in the app, and
 * conversions — recorded as two transactions sharing one trade reference.
 */
export function fromV2Transactions(rows: CoinbaseV2Transaction[], ctx: CoinbaseContext): { txs: CanonicalTx[]; warnings: string[]; skipped: Record<string, number> } {
  const txs: CanonicalTx[] = [];
  const warnings: string[] = [];
  const skipped: Record<string, number> = {};
  const note = (t: string) => { skipped[t] = (skipped[t] ?? 0) + 1; };

  const completed = rows.filter((r) => (r.status ?? "completed").toLowerCase() === "completed");

  // Both sides of a conversion carry the same trade id.
  const conversions = new Map<string, CoinbaseV2Transaction[]>();
  for (const r of completed) {
    if (r.type === "trade" && r.trade?.id) {
      const list = conversions.get(r.trade.id) ?? [];
      list.push(r);
      conversions.set(r.trade.id, list);
    }
  }
  const paired = new Set<string>();
  for (const [tradeId, rows2] of conversions) {
    const out = rows2.find((r) => D(r.amount.amount).lt(0));
    const into = rows2.find((r) => D(r.amount.amount).gt(0));
    if (!out || !into) continue;
    paired.add(out.id);
    paired.add(into.id);
    txs.push({
      id: `cb:conv:${tradeId}`,
      accountId: ctx.accountId,
      source: src,
      externalId: `convert:${tradeId}`,
      timestamp: new Date(out.created_at),
      type: "TRADE",
      category: "TRADE",
      legs: [
        { asset: assetOf(out.amount), amount: D(out.amount.amount).abs(), role: "OUT" },
        { asset: assetOf(into.amount), amount: D(into.amount.amount).abs(), role: "IN" },
      ],
      ref: `Coinbase conversion ${assetOf(out.amount)} → ${assetOf(into.amount)} ${tradeId}`,
      note: out.details?.title,
    });
  }
  if (conversions.size && [...conversions.values()].some((r) => r.length < 2)) {
    warnings.push("Une conversion Coinbase n'a qu'une jambe visible : le second compte n'est peut-être pas lisible par cette clé.");
  }

  let simpleBuys = 0;
  for (const r of completed) {
    if (paired.has(r.id)) continue;
    const type = r.type.toLowerCase();
    if (COVERED_BY_FILLS.has(type) || INTERNAL.has(type) || type === "trade") { note(type); continue; }

    const asset = assetOf(r.amount);
    const amount = D(r.amount.amount);
    const incoming = amount.gt(0);
    const address = (r.to?.address ?? r.from?.address ?? "").toLowerCase();
    const self = address ? ctx.selfAddresses?.has(address) ?? false : false;
    const base = {
      id: `cb:tx:${r.id}`,
      accountId: ctx.accountId,
      source: src,
      externalId: `tx:${r.id}`,
      timestamp: new Date(r.created_at),
      ref: `Coinbase ${type} ${asset} ${r.id.slice(0, 12)}`,
      note: r.details?.title ?? r.details?.subtitle,
    } as const;

    if (type === "buy" || type === "sell") {
      // A simple in-app purchase: the crypto side is exact, the fiat side is
      // the amount charged, fee included — Coinbase does not break it out here.
      const native = r.native_amount;
      if (!native) { note(type); continue; }
      simpleBuys++;
      const fiatAsset = assetOf(native);
      const fiatAmount = D(native.amount).abs();
      const legs: Leg[] =
        type === "buy"
          ? [{ asset: fiatAsset, amount: fiatAmount, role: "OUT" }, { asset, amount: amount.abs(), role: "IN" }]
          : [{ asset, amount: amount.abs(), role: "OUT" }, { asset: fiatAsset, amount: fiatAmount, role: "IN" }];
      txs.push({ ...base, type: "TRADE", category: "TRADE", legs });
      continue;
    }

    if (REWARDS.has(type)) {
      txs.push({ ...base, type: "REWARD", category: "STAKING_INCOME", legs: [{ asset, amount: amount.abs(), role: "IN" }] });
      continue;
    }

    if (type === "fiat_deposit" || type === "fiat_withdrawal") {
      txs.push({
        ...base,
        type: incoming ? "FIAT_DEPOSIT" : "FIAT_WITHDRAWAL",
        category: "BANK_TRANSFER",
        legs: [{ asset, amount: amount.abs(), role: incoming ? "IN" : "OUT" }],
        counterparty: { kind: "BANK", label: r.details?.title },
      });
      continue;
    }

    if (type === "send" || type === "receive" || type === "pro_transfer") {
      const legs: Leg[] = [{ asset, amount: amount.abs(), role: incoming ? "IN" : "OUT" }];
      const netFee = r.network?.transaction_fee;
      if (netFee && D(netFee.amount).gt(0)) legs.push({ asset: assetOf(netFee), amount: D(netFee.amount), role: "FEE" });
      txs.push({
        ...base,
        type: incoming ? "CRYPTO_DEPOSIT" : "CRYPTO_WITHDRAWAL",
        category: self ? "INTERNAL_TRANSFER" : "UNKNOWN",
        legs,
        counterparty: { kind: self ? "SELF" : "UNKNOWN", address: address || undefined, network: r.network?.name, txHash: r.network?.hash, label: r.to?.name ?? r.from?.name },
      });
      continue;
    }

    note(type);
    warnings.push(`Type d'opération Coinbase non reconnu : ${r.type}.`);
  }

  if (simpleBuys) {
    warnings.push(`${simpleBuys} achat(s)/vente(s) simples Coinbase : les frais sont compris dans le montant en devise, Coinbase ne les détaille pas sur ce point d'accès.`);
  }
  const internal = Object.entries(skipped).filter(([t]) => INTERNAL.has(t)).reduce((a, [, n]) => a + n, 0);
  if (internal) warnings.push(`${internal} mouvement(s) internes Coinbase ignorés : la position ne change pas.`);

  return { txs, warnings: [...new Set(warnings)], skipped };
}
