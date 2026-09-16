import { describe, it, expect } from "vitest";
import { BinanceClient } from "@/lib/connectors/binance/client";
import { syncBinanceAccount } from "@/lib/connectors/binance/sync";

function mockFetch(routes: Record<string, (url: URL) => unknown>) {
  const calls: string[] = [];
  const f = (async (input: string | URL | Request) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url);
    calls.push(url.pathname + url.search);
    const handler = routes[url.pathname];
    if (!handler) return new Response(JSON.stringify({ code: -1, msg: `no route ${url.pathname}` }), { status: 404 });
    const body = handler(url);
    return new Response(JSON.stringify(body), { status: 200, headers: { "x-mbx-used-weight-1m": "10" } });
  }) as unknown as typeof fetch;
  return { fetch: f, calls };
}

describe("BinanceClient", () => {
  it("signs requests with HMAC-SHA256 and sends the API key", async () => {
    const { fetch, calls } = mockFetch({
      "/api/v3/time": () => ({ serverTime: 1_700_000_000_000 }),
      "/api/v3/account": (url) => {
        expect(url.searchParams.get("timestamp")).toBe("1700000000000");
        const q = url.search.slice(1).replace(/&signature=.*$/, "");
        expect(url.searchParams.get("signature")).toBe(BinanceClient.sign("secret", q));
        return { balances: [] };
      },
    });
    const c = new BinanceClient({ apiKey: "key", apiSecret: "secret" }, { fetchImpl: fetch, now: () => 1_700_000_000_000, minIntervalMs: 0, sleep: async () => {} });
    await c.syncTime();
    await c.signed("/api/v3/account", { omitZeroBalances: true });
    expect(calls[1]).toContain("omitZeroBalances=true");
    expect(BinanceClient.sign("secret", "a=1")).toMatch(/^[a-f0-9]{64}$/);
  });

  it("retries on 429 with Retry-After and translates API errors", async () => {
    let n = 0;
    const f = (async () => {
      n++;
      if (n === 1) return new Response("", { status: 429, headers: { "retry-after": "1" } });
      return new Response(JSON.stringify({ code: -2015, msg: "Invalid API-key" }), { status: 401 });
    }) as unknown as typeof fetch;
    const c = new BinanceClient({ apiKey: "k", apiSecret: "s" }, { fetchImpl: f, minIntervalMs: 0, sleep: async () => {} });
    await expect(c.signed("/api/v3/account")).rejects.toThrow(/permissions insuffisantes/);
    expect(n).toBe(2);
  });
});

describe("syncBinanceAccount", () => {
  it("walks every endpoint with proper windows and discovers trading pairs from balances", async () => {
    const seen: string[] = [];
    const { fetch, calls } = mockFetch({
      "/api/v3/time": () => ({ serverTime: Date.now() }),
      "/api/v3/exchangeInfo": () => ({ symbols: [
        { symbol: "BTCEUR", baseAsset: "BTC", quoteAsset: "EUR", status: "TRADING" },
        { symbol: "ETHBTC", baseAsset: "ETH", quoteAsset: "BTC", status: "TRADING" },
        { symbol: "ETHEUR", baseAsset: "ETH", quoteAsset: "EUR", status: "TRADING" },
        { symbol: "XRPUSDT", baseAsset: "XRP", quoteAsset: "USDT", status: "TRADING" },
      ] }),
      "/api/v3/account": () => ({ balances: [{ asset: "BTC", free: "0.1", locked: "0" }] }),
      "/sapi/v1/capital/deposit/hisrec": () => [{ id: "d1", amount: "0.5", coin: "ETH", network: "ETH", status: 1, address: "0xabc", txId: "0xtx", insertTime: Date.UTC(2025, 1, 1), transferType: 0 }],
      "/sapi/v1/capital/withdraw/history": () => [],
      "/sapi/v1/fiat/orders": (u) => ({ data: u.searchParams.get("transactionType") === "0" ? [{ orderNo: "F1", fiatCurrency: "EUR", indicatedAmount: "1000", amount: "998", totalFee: "2", method: "BankTransfer", status: "Successful", createTime: Date.UTC(2025, 0, 5), updateTime: Date.UTC(2025, 0, 5) }] : [], total: 1 }),
      "/sapi/v1/fiat/payments": () => ({ data: [], total: 0 }),
      "/sapi/v1/convert/tradeFlow": () => ({ list: [{ quoteId: "q", orderId: 77, orderStatus: "SUCCESS", fromAsset: "BTC", fromAmount: "0.01", toAsset: "ETH", toAmount: "0.3", ratio: "30", inverseRatio: "0.033", createTime: Date.UTC(2025, 2, 1) }] }),
      "/sapi/v1/asset/dribblet": () => ({ total: 0, userAssetDribblets: [] }),
      "/sapi/v1/asset/assetDividend": () => ({ rows: [], total: 0 }),
      "/sapi/v1/simple-earn/flexible/history/rewardsRecord": () => ({ rows: [{ amount: "0.001", asset: "ETH", time: Date.UTC(2025, 3, 1), type: "REALTIME" }], total: 1 }),
      "/sapi/v1/simple-earn/locked/history/rewardsRecord": () => ({ rows: [], total: 0 }),
      "/api/v3/myTrades": (u) => {
        const sym = u.searchParams.get("symbol")!;
        seen.push(sym);
        if (sym === "BTCEUR" && u.searchParams.get("fromId") === "0") return [{ symbol: "BTCEUR", id: 5, orderId: 1, price: "50000", qty: "0.1", quoteQty: "5000", commission: "0.0001", commissionAsset: "BTC", time: Date.UTC(2025, 0, 10), isBuyer: true, isMaker: false }];
        if (sym === "ETHBTC" && u.searchParams.get("fromId") === "0") return [{ symbol: "ETHBTC", id: 9, orderId: 2, price: "0.03", qty: "1", quoteQty: "0.03", commission: "0.001", commissionAsset: "ETH", time: Date.UTC(2025, 0, 12), isBuyer: true, isMaker: false }];
        return [];
      },
    });
    const c = new BinanceClient({ apiKey: "k", apiSecret: "s" }, { fetchImpl: fetch, minIntervalMs: 0, sleep: async () => {} });
    const res = await syncBinanceAccount(c, { accountId: "acc", from: new Date(Date.UTC(2025, 0, 1)), to: new Date(Date.UTC(2025, 5, 30)) });
    expect(res.transactions.map((t) => t.type).sort()).toEqual(["CRYPTO_DEPOSIT", "FIAT_DEPOSIT", "REWARD", "TRADE", "TRADE", "TRADE"].sort());
    // BTC from balances -> BTCEUR scanned; ETH discovered from the deposit -> ETHBTC & ETHEUR scanned; XRP never touched -> not scanned
    expect(seen).toEqual(expect.arrayContaining(["BTCEUR", "ETHBTC", "ETHEUR"]));
    expect(seen).not.toContain("XRPUSDT");
    const depositCalls = calls.filter((c) => c.startsWith("/sapi/v1/capital/deposit/hisrec"));
    expect(depositCalls.length).toBe(3); // 181 days -> 3 windows of 90 days
    const convertCalls = calls.filter((c) => c.startsWith("/sapi/v1/convert/tradeFlow"));
    expect(convertCalls.length).toBe(7); // 30-day windows
    const fiat = res.transactions.find((t) => t.type === "FIAT_DEPOSIT")!;
    expect(fiat.legs.map((l) => `${l.role}:${l.amount}`)).toEqual(["IN:998", "FEE:2"]);
    expect(res.warnings).toEqual([]);
  });
});
