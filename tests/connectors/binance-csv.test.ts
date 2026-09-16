import { describe, it, expect, beforeAll } from "vitest";
import { importBinanceCsv } from "@/lib/connectors/binance/csv";

beforeAll(() => { process.env.APP_ENCRYPTION_KEY = "test-key-test-key-test-key-test-key"; });

const csv = `"User_ID","UTC_Time","Account","Operation","Coin","Change","Remark"
"12345","2025-01-05 10:22:31","Spot","Fiat Deposit","EUR","1000.00000000",""
"12345","2025-01-05 10:30:00","Spot","Transaction Buy","BTC","0.01000000",""
"12345","2025-01-05 10:30:00","Spot","Transaction Spend","EUR","-900.00000000",""
"12345","2025-01-05 10:30:00","Spot","Transaction Fee","BNB","-0.00150000",""
"12345","2025-01-06 08:00:00","Spot","Binance Convert","BTC","-0.00500000",""
"12345","2025-01-06 08:00:00","Spot","Binance Convert","ETH","0.15000000",""
"12345","2025-01-07 00:00:00","Spot","Simple Earn Flexible Interest","ETH","0.00010000",""
"12345","2025-01-07 00:00:00","Spot","Simple Earn Flexible Subscription","ETH","-0.10000000",""
"12345","2025-01-08 12:00:00","Spot","Small Assets Exchange BNB","DOGE","-12.00000000",""
"12345","2025-01-08 12:00:00","Spot","Small Assets Exchange BNB","TRX","-30.00000000",""
"12345","2025-01-08 12:00:00","Spot","Small Assets Exchange BNB","BNB","0.00400000",""
"12345","2025-01-09 12:00:00","Spot","Withdraw","ETH","-0.05000000","Withdraw fee is included. 0x54f7cef15521c710ab47e8bc0a9014c9ac75a0c6"
"12345","2025-01-10 12:00:00","Spot","Buy Crypto","EUR","-100.00000000",""
"12345","2025-01-10 12:00:00","Spot","Buy Crypto","SOL","0.50000000",""
"12345","2025-01-11 12:00:00","Spot","Mystery Op","XYZ","3.00000000",""
`;

describe("Binance CSV import", () => {
  const res = importBinanceCsv(csv, "acc", new Set(["0x54f7cef15521c710ab47e8bc0a9014c9ac75a0c6"]));

  it("rebuilds trades from grouped rows", () => {
    const trade = res.transactions.find((t) => t.type === "TRADE" && t.legs.some((l) => l.asset === "BTC" && l.role === "IN"))!;
    expect(trade.legs).toEqual(expect.arrayContaining([
      expect.objectContaining({ asset: "EUR", role: "OUT" }), expect.objectContaining({ asset: "BTC", role: "IN" }), expect.objectContaining({ asset: "BNB", role: "FEE" }),
    ]));
    expect(trade.legs.find((l) => l.role === "FEE")!.amount.toString()).toBe("0.0015");
  });

  it("handles convert, rewards, internal moves, dust and card purchases", () => {
    expect(res.ignoredRows).toBe(1); // Simple Earn subscription
    const convert = res.transactions.find((t) => t.note === "Binance Convert")!;
    expect(convert.legs.map((l) => `${l.role}:${l.asset}`).sort()).toEqual(["IN:ETH", "OUT:BTC"]);
    const reward = res.transactions.find((t) => t.type === "REWARD")!;
    expect(reward.category).toBe("STAKING_INCOME");
    const dust = res.transactions.find((t) => t.note === "Small Assets Exchange BNB")!;
    expect(dust.legs.filter((l) => l.role === "OUT")).toHaveLength(2);
    const card = res.transactions.find((t) => t.counterparty?.kind === "BANK" && t.type === "TRADE")!;
    expect(card.legs.find((l) => l.role === "IN")!.asset).toBe("SOL");
  });

  it("detects own addresses in remarks and keeps unknown operations", () => {
    const wd = res.transactions.find((t) => t.type === "CRYPTO_WITHDRAWAL" && t.legs[0].asset === "ETH")!;
    expect(wd.category).toBe("INTERNAL_TRANSFER");
    expect(wd.counterparty?.address).toBe("0x54f7cef15521c710ab47e8bc0a9014c9ac75a0c6");
    expect(res.unknownOperations["Mystery Op"]).toBe(1);
    expect(res.warnings.some((w) => w.includes("Mystery Op"))).toBe(true);
    const fiat = res.transactions.find((t) => t.type === "FIAT_DEPOSIT")!;
    expect(fiat.legs[0].amount.toString()).toBe("1000");
  });

  it("produces stable external ids for de-duplication", () => {
    const again = importBinanceCsv(csv, "acc");
    expect(again.transactions.map((t) => t.externalId)).toEqual(res.transactions.map((t) => t.externalId));
  });
});
