import { describe, it, expect } from "vitest";
import { createPublicKey, createVerify, generateKeyPairSync, verify as verifyOneShot } from "node:crypto";
import { buildJwt, parsePrivateKey } from "@/lib/connectors/coinbase/client";
import { fromFills, fromV2Transactions } from "@/lib/connectors/coinbase/normalize";
import type { CoinbaseFill, CoinbaseV2Transaction } from "@/lib/connectors/coinbase/types";

const ctx = { accountId: "acc-1", selfAddresses: new Set(["0xmoi"]) };

const decode = (token: string) => {
  const [h, p] = token.split(".");
  return {
    header: JSON.parse(Buffer.from(h, "base64url").toString()) as Record<string, string>,
    payload: JSON.parse(Buffer.from(p, "base64url").toString()) as Record<string, string | number>,
  };
};

describe("Coinbase token", () => {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const pem = privateKey.export({ type: "sec1", format: "pem" }).toString();
  const creds = { keyName: "organizations/org-1/apiKeys/key-1", privateKey: pem };

  it("names the exact request it may be used for", () => {
    const { header, payload } = decode(buildJwt(creds, "GET", "api.coinbase.com", "/api/v3/brokerage/accounts", 1_700_000_000));
    expect(header.alg).toBe("ES256");
    expect(header.kid).toBe(creds.keyName);
    expect(header.nonce).toMatch(/^[0-9a-f]{32}$/);
    expect(payload.iss).toBe("cdp");
    expect(payload.sub).toBe(creds.keyName);
    expect(payload.uri).toBe("GET api.coinbase.com/api/v3/brokerage/accounts");
  });

  it("expires two minutes after it is issued", () => {
    const { payload } = decode(buildJwt(creds, "GET", "api.coinbase.com", "/v2/accounts", 1_700_000_000));
    expect(payload.nbf).toBe(1_700_000_000);
    expect(payload.exp).toBe(1_700_000_120);
  });

  it("carries a signature the public key accepts, in the JOSE layout", () => {
    const token = buildJwt(creds, "GET", "api.coinbase.com", "/v2/accounts", 1_700_000_000);
    const [h, p, sig] = token.split(".");
    const signature = Buffer.from(sig, "base64url");
    // ES256 signatures are 64 bytes of r||s — a DER wrapper here would be
    // accepted by nothing at Coinbase.
    expect(signature.length).toBe(64);
    const ok = createVerify("SHA256").update(`${h}.${p}`).verify({ key: publicKey, dsaEncoding: "ieee-p1363" }, signature);
    expect(ok).toBe(true);
  });

  it("signs with an Ed25519 key when that is what Coinbase handed out", () => {
    const pair = generateKeyPairSync("ed25519");
    const jwk = pair.privateKey.export({ format: "jwk" }) as { d: string; x: string };
    const raw = Buffer.concat([Buffer.from(jwk.d, "base64url"), Buffer.from(jwk.x, "base64url")]).toString("base64");
    const edCreds = { keyName: "organizations/org-1/apiKeys/key-2", privateKey: raw };
    expect(parsePrivateKey(raw).alg).toBe("EdDSA");
    const token = buildJwt(edCreds, "GET", "api.coinbase.com", "/v2/accounts", 1_700_000_000);
    const [h, p, sig] = token.split(".");
    expect(decode(token).header.alg).toBe("EdDSA");
    const pub = createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x: jwk.x }, format: "jwk" });
    expect(verifyOneShot(null, Buffer.from(`${h}.${p}`), pub, Buffer.from(sig, "base64url"))).toBe(true);
  });

  it("refuses a key in a shape it does not understand", () => {
    expect(() => parsePrivateKey("ceci n'est pas une clé")).toThrow(/non reconnu/);
  });
});

const fill = (over: Partial<CoinbaseFill>): CoinbaseFill => ({
  entry_id: "E1", trade_id: "T1", order_id: "O1", trade_time: "2026-03-15T10:00:00Z",
  price: "30000", size: "0.1", commission: "1.5", product_id: "BTC-EUR", side: "BUY", ...over,
});

describe("Coinbase fills", () => {
  it("reads a purchase as quote out, base in, commission in the quote", () => {
    const { txs } = fromFills([fill({})], ctx);
    expect(txs[0].legs.map((l) => [l.role, l.asset, l.amount.toString()])).toEqual([
      ["OUT", "EUR", "3000"],
      ["IN", "BTC", "0.1"],
      ["FEE", "EUR", "1.5"],
    ]);
  });

  it("reads a size expressed in the quote currency the other way round", () => {
    const { txs } = fromFills([fill({ size: "3000", size_in_quote: true })], ctx);
    const legs = Object.fromEntries(txs[0].legs.map((l) => [l.role, `${l.amount.toString()} ${l.asset}`]));
    expect(legs.OUT).toBe("3000 EUR");
    expect(legs.IN).toBe("0.1 BTC");
  });

  it("reverses the legs on a sale", () => {
    const { txs } = fromFills([fill({ side: "SELL" })], ctx);
    expect(txs[0].legs.map((l) => l.role)).toEqual(["OUT", "IN", "FEE"]);
    expect(txs[0].legs[0].asset).toBe("BTC");
  });
});

const tx = (over: Partial<CoinbaseV2Transaction> & { type: string }): CoinbaseV2Transaction => ({
  id: "X1", status: "completed", amount: { amount: "1", currency: "BTC" },
  created_at: "2026-04-01T08:00:00Z", ...over,
});

describe("Coinbase ledger", () => {
  it("reads a bank deposit and an on-chain send", () => {
    const { txs } = fromV2Transactions(
      [
        tx({ id: "D1", type: "fiat_deposit", amount: { amount: "500.00", currency: "EUR" } }),
        tx({ id: "S1", type: "send", amount: { amount: "-0.25", currency: "ETH" }, network: { hash: "0xabc", name: "ethereum" }, to: { address: "0xAUTRE" } }),
      ],
      ctx,
    );
    expect(txs.find((t) => t.id.endsWith("D1"))!.type).toBe("FIAT_DEPOSIT");
    const send = txs.find((t) => t.id.endsWith("S1"))!;
    expect(send.type).toBe("CRYPTO_WITHDRAWAL");
    expect(send.category).toBe("UNKNOWN");
    expect(send.counterparty?.txHash).toBe("0xabc");
  });

  it("recognises a send to one of our own addresses as an internal transfer", () => {
    const { txs } = fromV2Transactions([tx({ id: "S2", type: "send", amount: { amount: "-1", currency: "ETH" }, to: { address: "0xMoi" } })], ctx);
    expect(txs[0].category).toBe("INTERNAL_TRANSFER");
    expect(txs[0].counterparty?.kind).toBe("SELF");
  });

  it("pairs the two sides of a conversion", () => {
    const { txs } = fromV2Transactions(
      [
        tx({ id: "C1", type: "trade", amount: { amount: "-500", currency: "USDC" }, trade: { id: "TR9" } }),
        tx({ id: "C2", type: "trade", amount: { amount: "0.0166", currency: "BTC" }, trade: { id: "TR9" } }),
      ],
      ctx,
    );
    expect(txs).toHaveLength(1);
    expect(txs[0].legs.map((l) => [l.role, l.asset])).toEqual([["OUT", "USDC"], ["IN", "BTC"]]);
  });

  it("keeps an in-app purchase and says the fee is inside the fiat amount", () => {
    const { txs, warnings } = fromV2Transactions(
      [tx({ id: "B1", type: "buy", amount: { amount: "0.01", currency: "BTC" }, native_amount: { amount: "312.50", currency: "EUR" } })],
      ctx,
    );
    expect(txs[0].type).toBe("TRADE");
    expect(txs[0].legs.map((l) => [l.role, l.asset, l.amount.toString()])).toEqual([["OUT", "EUR", "312.5"], ["IN", "BTC", "0.01"]]);
    expect(warnings.join(" ")).toContain("frais");
  });

  it("drops what the fills already carry and what never left Coinbase", () => {
    const { txs, skipped } = fromV2Transactions(
      [
        tx({ id: "A1", type: "advanced_trade_fill", amount: { amount: "0.1", currency: "BTC" } }),
        tx({ id: "P1", type: "pro_withdrawal", amount: { amount: "-1", currency: "ETH" } }),
      ],
      ctx,
    );
    expect(txs).toHaveLength(0);
    expect(skipped.advanced_trade_fill).toBe(1);
    expect(skipped.pro_withdrawal).toBe(1);
  });

  it("ignores anything that did not complete", () => {
    const { txs } = fromV2Transactions([tx({ id: "N1", type: "send", status: "pending", amount: { amount: "-1", currency: "ETH" } })], ctx);
    expect(txs).toHaveLength(0);
  });

  it("treats a staking payout as income", () => {
    const { txs } = fromV2Transactions([tx({ id: "R1", type: "staking_reward", amount: { amount: "0.004", currency: "ETH" } })], ctx);
    expect(txs[0].type).toBe("REWARD");
    expect(txs[0].category).toBe("STAKING_INCOME");
  });
});
