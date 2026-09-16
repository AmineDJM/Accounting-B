import { describe, it, expect } from "vitest";
import { KrakenClient } from "@/lib/connectors/kraken/client";
import { fromLedgers, fromTrades, normaliseAsset, type KrakenContext } from "@/lib/connectors/kraken/normalize";
import type { KrakenLedger, KrakenTrade } from "@/lib/connectors/kraken/types";

const ctx: KrakenContext = {
  accountId: "acc-1",
  pairs: new Map([
    ["XXBTZEUR", { base: "XXBT", quote: "ZEUR" }],
    ["SOLEUR", { base: "SOL", quote: "ZEUR" }],
  ]),
};

const trade = (over: Partial<KrakenTrade>): KrakenTrade => ({
  ordertxid: "O1", pair: "XXBTZEUR", time: 1_700_000_000, type: "buy", ordertype: "limit",
  price: "30000", cost: "3000", fee: "7.5", vol: "0.1", margin: "0", misc: "", ...over,
});

const ledger = (over: Partial<KrakenLedger> & { type: string }): KrakenLedger => ({
  refid: "R1", time: 1_700_000_000, subtype: "", aclass: "currency", asset: "ZEUR",
  amount: "0", fee: "0", balance: "0", ...over,
});

describe("Kraken signature", () => {
  /**
   * Kraken publishes one worked example; matching it proves the whole chain —
   * the SHA-256 of nonce and body, the path prefix, and the base64-decoded
   * secret — rather than just that the code runs.
   */
  it("reproduces the documented example", () => {
    const sign = KrakenClient.sign(
      "kQH5HW/8p1uGOVjbgWA7FunAmGO8lsSUXNsu3eow76sz84Q18fWxnyRzBHCd3pd5nE9qa99HAZtuZuj6F1huXg==",
      "/0/private/AddOrder",
      "1616492376594",
      "nonce=1616492376594&ordertype=limit&pair=XBTUSD&price=37500&type=buy&volume=1.25",
    );
    expect(sign).toBe("4/dpxb3iT4tp/ZCVEwSnEsLxx0bqyhLpdfOpc6fn7OR8+UClSV5n9E6aSS8MPtnRfp32bAb0nmbRn6H8ndwLUQ==");
  });
});

describe("Kraken tickers", () => {
  it("drops the X and Z prefixes and the wallet suffixes", () => {
    expect(normaliseAsset("XXBT")).toBe("BTC");
    expect(normaliseAsset("ZEUR")).toBe("EUR");
    expect(normaliseAsset("XETH")).toBe("ETH");
    expect(normaliseAsset("XBT.S")).toBe("BTC");
    expect(normaliseAsset("DOT.S")).toBe("DOT");
    expect(normaliseAsset("SOL")).toBe("SOL");
    expect(normaliseAsset("XXDG")).toBe("DOGE");
  });

  it("keeps a three-letter ticker that happens to start with X or Z", () => {
    expect(normaliseAsset("XRP")).toBe("XRP");
    expect(normaliseAsset("ZEC")).toBe("ZEC");
  });

  it("brings the old ether receipt token back to ether", () => {
    expect(normaliseAsset("ETH2.S")).toBe("ETH");
  });
});

describe("Kraken trades", () => {
  it("reads a purchase as fiat out, crypto in, fee in the quote currency", () => {
    const { txs } = fromTrades({ T1: trade({}) }, ctx);
    expect(txs).toHaveLength(1);
    expect(txs[0].type).toBe("TRADE");
    expect(txs[0].legs.map((l) => [l.role, l.asset, l.amount.toString()])).toEqual([
      ["OUT", "EUR", "3000"],
      ["IN", "BTC", "0.1"],
      ["FEE", "EUR", "7.5"],
    ]);
  });

  it("reverses the legs on a sale", () => {
    const { txs } = fromTrades({ T2: trade({ type: "sell", pair: "SOLEUR", vol: "20", cost: "2400", fee: "6" }) }, ctx);
    expect(txs[0].legs.map((l) => [l.role, l.asset])).toEqual([["OUT", "SOL"], ["IN", "EUR"], ["FEE", "EUR"]]);
  });

  it("charges the fee in the base currency when the order said so", () => {
    const { txs } = fromTrades({ T3: trade({ misc: "fcib" }) }, ctx);
    expect(txs[0].legs.find((l) => l.role === "FEE")?.asset).toBe("BTC");
  });

  it("refuses to guess at a margin trade", () => {
    const { txs, warnings } = fromTrades({ T4: trade({ margin: "1500" }) }, ctx);
    expect(txs).toHaveLength(0);
    expect(warnings[0]).toContain("marge");
  });

  it("reports an unknown pair rather than dropping it in silence", () => {
    const { txs, warnings } = fromTrades({ T5: trade({ pair: "MYSTERYEUR" }) }, ctx);
    expect(txs).toHaveLength(0);
    expect(warnings.join(" ")).toContain("MYSTERYEUR");
  });
});

describe("Kraken ledger", () => {
  it("reads a fiat deposit and a crypto withdrawal with its fee", () => {
    const { txs } = fromLedgers(
      {
        L1: ledger({ type: "deposit", asset: "ZEUR", amount: "1000.00", refid: "Q1" }),
        L2: ledger({ type: "withdrawal", asset: "XXBT", amount: "-0.5", fee: "0.00015", refid: "Q2" }),
      },
      ctx,
    );
    const deposit = txs.find((t) => t.type === "FIAT_DEPOSIT")!;
    expect(deposit.legs).toEqual([{ role: "IN", asset: "EUR", amount: expect.anything() }]);
    expect(deposit.legs[0].amount.toString()).toBe("1000");

    const withdrawal = txs.find((t) => t.type === "CRYPTO_WITHDRAWAL")!;
    expect(withdrawal.legs.map((l) => [l.role, l.amount.toString()])).toEqual([["OUT", "0.5"], ["FEE", "0.00015"]]);
  });

  it("treats a staking payout as income, not as a purchase", () => {
    const { txs } = fromLedgers({ L3: ledger({ type: "staking", asset: "DOT.S", amount: "1.2345", refid: "Q3" }) }, ctx);
    expect(txs[0].type).toBe("REWARD");
    expect(txs[0].category).toBe("STAKING_INCOME");
    expect(txs[0].legs[0].asset).toBe("DOT");
  });

  it("pairs a spend and a receive into one conversion", () => {
    const { txs } = fromLedgers(
      {
        L4: ledger({ type: "spend", asset: "ZEUR", amount: "-100", fee: "0.5", refid: "TR1" }),
        L5: ledger({ type: "receive", asset: "XXBT", amount: "0.0033", refid: "TR1" }),
      },
      ctx,
    );
    expect(txs).toHaveLength(1);
    expect(txs[0].type).toBe("TRADE");
    expect(txs[0].legs.map((l) => [l.role, l.asset, l.amount.toString()])).toEqual([
      ["OUT", "EUR", "100"],
      ["IN", "BTC", "0.0033"],
      ["FEE", "EUR", "0.5"],
    ]);
  });

  it("ignores what the trades endpoint already carries and what never left Kraken", () => {
    const { txs, skipped, warnings } = fromLedgers(
      {
        L6: ledger({ type: "trade", asset: "XXBT", amount: "0.1", refid: "T1" }),
        L7: ledger({ type: "transfer", subtype: "spottostaking", asset: "DOT", amount: "-10", refid: "TF1" }),
      },
      ctx,
    );
    expect(txs).toHaveLength(0);
    expect(skipped.trade).toBe(1);
    expect(skipped.transfer).toBe(1);
    expect(warnings.join(" ")).toContain("transfert");
  });

  it("says so when it meets a type it does not know", () => {
    const { warnings } = fromLedgers({ L8: ledger({ type: "quelque_chose", asset: "ZEUR", amount: "5" }) }, ctx);
    expect(warnings.join(" ")).toContain("quelque_chose");
  });
});
