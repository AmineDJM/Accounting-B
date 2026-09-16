import { D } from "@/lib/engine/money";
import { isFiat, type CanonicalTx, type Leg } from "@/lib/engine/model";
import type { AssetDividend, ConvertTrade, DepositRecord, DustLog, EarnReward, FiatOrder, FiatPayment, MyTrade, WithdrawRecord } from "./types";

type Base = { accountId: string; selfAddresses?: Set<string> };
const src = "binance_api" as const;

export function fromMyTrades(trades: MyTrade[], symbols: Map<string, { base: string; quote: string }>, ctx: Base): CanonicalTx[] {
  const out: CanonicalTx[] = [];
  for (const t of trades) {
    const s = symbols.get(t.symbol);
    if (!s) continue;
    const qty = D(t.qty), quote = D(t.quoteQty);
    const legs: Leg[] = t.isBuyer
      ? [{ asset: s.quote, amount: quote, role: "OUT" }, { asset: s.base, amount: qty, role: "IN" }]
      : [{ asset: s.base, amount: qty, role: "OUT" }, { asset: s.quote, amount: quote, role: "IN" }];
    const fee = D(t.commission);
    if (fee.gt(0)) legs.push({ asset: t.commissionAsset, amount: fee, role: "FEE" });
    out.push({ id: `bin:trade:${t.symbol}:${t.id}`, accountId: ctx.accountId, source: src, externalId: `trade:${t.symbol}:${t.id}`, timestamp: new Date(t.time), type: "TRADE", category: "TRADE", legs, ref: `Spot ${t.symbol} #${t.id} (ordre ${t.orderId})` });
  }
  return out;
}

export function fromDeposits(rows: DepositRecord[], ctx: Base): CanonicalTx[] {
  return rows.filter((r) => r.status === 1).map((r) => {
    const self = ctx.selfAddresses?.has(r.address?.toLowerCase()) ?? false;
    return {
      id: `bin:dep:${r.id ?? r.txId}`, accountId: ctx.accountId, source: src, externalId: `deposit:${r.id ?? r.txId}`, timestamp: new Date(r.insertTime),
      type: "CRYPTO_DEPOSIT", category: self ? "INTERNAL_TRANSFER" : "UNKNOWN",
      legs: [{ asset: r.coin, amount: D(r.amount), role: "IN" }],
      counterparty: { kind: self ? "SELF" : r.transferType === 1 ? "EXCHANGE" : "UNKNOWN", address: r.address, network: r.network, txHash: r.txId, label: r.transferType === 1 ? "Transfert interne Binance" : undefined },
      ref: `Dépôt ${r.coin} ${r.txId?.slice(0, 18) ?? r.id}`,
    } satisfies CanonicalTx;
  });
}

export function fromWithdrawals(rows: WithdrawRecord[], ctx: Base): CanonicalTx[] {
  return rows.filter((r) => r.status === 6).map((r) => {
    const self = ctx.selfAddresses?.has(r.address?.toLowerCase()) ?? false;
    const legs: Leg[] = [{ asset: r.coin, amount: D(r.amount), role: "OUT" }];
    const fee = D(r.transactionFee);
    if (fee.gt(0)) legs.push({ asset: r.coin, amount: fee, role: "FEE" });
    const when = r.completeTime ? new Date(r.completeTime.replace(" ", "T") + "Z") : new Date(r.applyTime.replace(" ", "T") + "Z");
    return {
      id: `bin:wd:${r.id}`, accountId: ctx.accountId, source: src, externalId: `withdraw:${r.id}`, timestamp: when,
      type: "CRYPTO_WITHDRAWAL", category: self ? "INTERNAL_TRANSFER" : "UNKNOWN", legs,
      counterparty: { kind: self ? "SELF" : r.transferType === 1 ? "EXCHANGE" : "UNKNOWN", address: r.address, network: r.network, txHash: r.txId, label: r.info },
      ref: `Retrait ${r.coin} ${r.txId?.slice(0, 18) ?? r.id}`,
    } satisfies CanonicalTx;
  });
}

export function fromFiatOrders(rows: FiatOrder[], kind: "DEPOSIT" | "WITHDRAW", ctx: Base): CanonicalTx[] {
  return rows.filter((r) => r.status === "Successful" || r.status === "Finished").map((r) => {
    const fee = D(r.totalFee);
    const isOffline = /offline/i.test(r.method ?? "");
    if (kind === "DEPOSIT" && isOffline) {
      // inactivity charge reported among deposits: a stand-alone fee
      return { id: `bin:fiatfee:${r.orderNo}`, accountId: ctx.accountId, source: src, externalId: `fiat:fee:${r.orderNo}`, timestamp: new Date(r.updateTime), type: "FEE", category: "TRADE", legs: [{ asset: r.fiatCurrency, amount: D(r.indicatedAmount), role: "FEE" }], ref: `Frais ${r.method} ${r.orderNo}`, note: r.method } satisfies CanonicalTx;
    }
    const legs: Leg[] = kind === "DEPOSIT" ? [{ asset: r.fiatCurrency, amount: D(r.amount), role: "IN" }] : [{ asset: r.fiatCurrency, amount: D(r.amount), role: "OUT" }];
    if (fee.gt(0)) legs.push({ asset: r.fiatCurrency, amount: fee, role: "FEE" });
    return {
      id: `bin:fiat:${r.orderNo}`, accountId: ctx.accountId, source: src, externalId: `fiat:${kind.toLowerCase()}:${r.orderNo}`, timestamp: new Date(r.updateTime),
      type: kind === "DEPOSIT" ? "FIAT_DEPOSIT" : "FIAT_WITHDRAWAL", category: "BANK_TRANSFER", legs,
      counterparty: { kind: "BANK", label: r.method }, ref: `${kind === "DEPOSIT" ? "Dépôt" : "Retrait"} ${r.fiatCurrency} ${r.orderNo}`,
    } satisfies CanonicalTx;
  });
}

export function fromFiatPayments(rows: FiatPayment[], kind: "BUY" | "SELL", ctx: Base): CanonicalTx[] {
  return rows.filter((r) => r.status === "Completed" || r.status === "Successful").map((r) => {
    const fee = D(r.totalFee);
    const fiatNet = D(r.sourceAmount).minus(kind === "BUY" ? fee : 0);
    const card = /card|carte/i.test(r.paymentMethod ?? "");
    const legs: Leg[] = kind === "BUY"
      ? [{ asset: r.fiatCurrency, amount: fiatNet, role: "OUT" }, { asset: r.cryptoCurrency, amount: D(r.obtainAmount), role: "IN" }]
      : [{ asset: r.cryptoCurrency, amount: D(r.obtainAmount), role: "OUT" }, { asset: r.fiatCurrency, amount: D(r.sourceAmount), role: "IN" }];
    if (fee.gt(0)) legs.push({ asset: r.fiatCurrency, amount: fee, role: "FEE" });
    return {
      id: `bin:pay:${r.orderNo}`, accountId: ctx.accountId, source: src, externalId: `payment:${r.orderNo}`, timestamp: new Date(r.updateTime || r.createTime),
      type: "TRADE", category: "TRADE", legs, counterparty: card ? { kind: "BANK", label: r.paymentMethod } : undefined,
      ref: `${kind === "BUY" ? "Achat" : "Vente"} express ${r.orderNo}`, note: r.paymentMethod,
      knownUnitPriceEur: isFiat(r.fiatCurrency) && r.fiatCurrency === "EUR" ? { [r.cryptoCurrency]: D(r.price) } : undefined,
    } satisfies CanonicalTx;
  });
}

export function fromConvert(rows: ConvertTrade[], ctx: Base): CanonicalTx[] {
  return rows.filter((r) => r.orderStatus === "SUCCESS").map((r) => ({
    id: `bin:convert:${r.orderId}`, accountId: ctx.accountId, source: src, externalId: `convert:${r.orderId}`, timestamp: new Date(r.createTime), type: "TRADE", category: "TRADE",
    legs: [{ asset: r.fromAsset, amount: D(r.fromAmount), role: "OUT" }, { asset: r.toAsset, amount: D(r.toAmount), role: "IN" }],
    ref: `Convert ${r.orderId}`, note: "Binance Convert",
  } satisfies CanonicalTx));
}

export function fromDust(log: DustLog, ctx: Base): CanonicalTx[] {
  return (log.userAssetDribblets ?? []).map((d) => {
    const legs: Leg[] = d.userAssetDribbletDetails.map((x) => ({ asset: x.fromAsset, amount: D(x.amount), role: "OUT" as const }));
    legs.push({ asset: "BNB", amount: D(d.totalTransferedAmount), role: "IN" });
    const fee = D(d.totalServiceChargeAmount);
    if (fee.gt(0)) legs.push({ asset: "BNB", amount: fee, role: "FEE" });
    return { id: `bin:dust:${d.transId}`, accountId: ctx.accountId, source: src, externalId: `dust:${d.transId}`, timestamp: new Date(d.operateTime), type: "TRADE", category: "TRADE", legs, ref: `Conversion de poussières ${d.transId}`, note: "Small Assets Exchange BNB" } satisfies CanonicalTx;
  });
}

export function fromDividends(div: AssetDividend, ctx: Base): CanonicalTx[] {
  return (div.rows ?? []).map((r) => ({
    id: `bin:div:${r.tranId}`, accountId: ctx.accountId, source: src, externalId: `dividend:${r.tranId}`, timestamp: new Date(r.divTime), type: "REWARD",
    category: /airdrop|distribution/i.test(r.enInfo ?? "") ? "AIRDROP" : "STAKING_INCOME",
    legs: [{ asset: r.asset, amount: D(r.amount), role: "IN" }], ref: `Distribution ${r.tranId}`, note: r.enInfo,
  } satisfies CanonicalTx));
}

export function fromEarnRewards(rows: EarnReward[], product: "flexible" | "locked", ctx: Base): CanonicalTx[] {
  return rows.map((r, i) => ({
    id: `bin:earn:${product}:${r.time}:${r.asset}:${i}`, accountId: ctx.accountId, source: src, externalId: `earn:${product}:${r.time}:${r.asset}:${r.amount}`, timestamp: new Date(r.time), type: "REWARD", category: "STAKING_INCOME",
    legs: [{ asset: r.asset, amount: D(r.amount), role: "IN" }], ref: `Simple Earn ${product} ${new Date(r.time).toISOString().slice(0, 10)}`, note: `Simple Earn ${product}${r.type ? ` (${r.type})` : ""}`,
  } satisfies CanonicalTx));
}
