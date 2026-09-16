import { describe, it, expect } from "vitest";
import { createPriceTable, valueTransactions } from "@/lib/engine/valuation";
import { computeDac8Aggregates } from "@/lib/dac8/aggregate";
import { parseDac8Csv, parseDac8Xml, matchBucket } from "@/lib/dac8/parse";
import { reconcileDac8 } from "@/lib/dac8/reconcile";
import { D } from "@/lib/engine/money";
import type { CanonicalTx } from "@/lib/engine/model";

const t = (iso: string) => new Date(iso);
const base = { accountId: "binance-1", source: "manual" as const, category: "TRADE" as const };

const prices = createPriceTable([
  { asset: "BTC", at: t("2026-01-02T00:00:00Z"), priceEur: D(90000), source: "test" },
  { asset: "BTC", at: t("2026-06-01T00:00:00Z"), priceEur: D(100000), source: "test" },
  { asset: "ETH", at: t("2026-06-01T00:00:00Z"), priceEur: D(2500), source: "test" },
  { asset: "USD", at: t("2026-06-30T00:00:00Z"), priceEur: D("0.92"), source: "ecb" },
  { asset: "USD", at: t("2026-01-01T00:00:00Z"), priceEur: D("0.92"), source: "ecb" },
], { toleranceCrypto: 48 * 60 * 60 * 1000, toleranceFiat: 400 * 24 * 60 * 60 * 1000 });

const txs: CanonicalTx[] = [
  // buy 0,1 BTC for 9 000 € with a 10 € fee -> CryptoFiatIn 9 000 (the fee is on the fiat leg)
  { ...base, id: "buy", externalId: "buy", type: "TRADE", timestamp: t("2026-01-02T10:00:00Z"),
    legs: [{ asset: "EUR", amount: D(9000), role: "OUT" }, { asset: "BTC", amount: D("0.1"), role: "IN" }, { asset: "EUR", amount: D(10), role: "FEE" }] },
  // swap 0,05 BTC for 2 ETH -> CryptotoCryptoOut on BTC and CryptotoCryptoIn on ETH
  { ...base, id: "swap", externalId: "swap", type: "TRADE", timestamp: t("2026-06-01T12:00:00Z"),
    legs: [{ asset: "BTC", amount: D("0.05"), role: "OUT" }, { asset: "ETH", amount: D(2), role: "IN" }] },
  // sell 1 ETH for 2 500 € with a 25 € fee -> CryptoFiatOut of 2 475
  { ...base, id: "sell", externalId: "sell", type: "TRADE", timestamp: t("2026-06-01T13:00:00Z"),
    legs: [{ asset: "ETH", amount: D(1), role: "OUT" }, { asset: "EUR", amount: D(2500), role: "IN" }, { asset: "EUR", amount: D(25), role: "FEE" }] },
  // send 0,2 ETH to an address of one's own -> CryptoTransferOut and TransferWallet
  { ...base, id: "send", externalId: "send", type: "CRYPTO_WITHDRAWAL", category: "INTERNAL_TRANSFER", timestamp: t("2026-06-01T15:00:00Z"),
    legs: [{ asset: "ETH", amount: D("0.2"), role: "OUT" }], counterparty: { kind: "SELF", address: "0xmine", network: "ETH" } },
  // pay a supplier 30 ETH (75 000 €, above the USD 50 000 threshold) -> RRPT, not a transfer
  { ...base, id: "pay", externalId: "pay", type: "CRYPTO_WITHDRAWAL", category: "PURCHASE_GOODS", timestamp: t("2026-06-01T16:00:00Z"),
    legs: [{ asset: "ETH", amount: D(30), role: "OUT" }], counterparty: { kind: "EXTERNAL", address: "0xsupplier" } },
  // pay a supplier 0,4 ETH (1 000 €) -> stays an outbound transfer
  { ...base, id: "pay2", externalId: "pay2", type: "CRYPTO_WITHDRAWAL", category: "PURCHASE_GOODS", timestamp: t("2026-06-01T17:00:00Z"),
    legs: [{ asset: "ETH", amount: D("0.4"), role: "OUT" }], counterparty: { kind: "EXTERNAL", address: "0xsmall" } },
  // staking reward -> CryptoTransferIn
  { ...base, id: "rw", externalId: "rw", type: "REWARD", category: "STAKING_INCOME", timestamp: t("2026-06-01T18:00:00Z"),
    legs: [{ asset: "ETH", amount: D("0.01"), role: "IN" }] },
];

const valued = valueTransactions(txs, prices);
const agg = computeDac8Aggregates(valued, 2026, { prices, currency: "EUR" });
const find = (asset: string, bucket: string) => agg.buckets.find((b) => b.asset === asset && b.bucket === bucket);

describe("CARF aggregates", () => {
  it("books a purchase against fiat under CryptoFiatIn", () => {
    expect(find("BTC", "CryptoFiatIn")?.units.toString()).toBe("0.1");
    // Net of fees, the wording of the CARF XML schema: the 9 000 € paid for
    // the bitcoin. Gross, the wording of the directive: the 9 010 € debited.
    expect(find("BTC", "CryptoFiatIn")?.amount.toFixed(2)).toBe("9000.00");
    expect(find("BTC", "CryptoFiatIn")?.amountGross.toFixed(2)).toBe("9010.00");
  });

  it("keeps both readings of a disposal against fiat", () => {
    expect(find("ETH", "CryptoFiatOut")?.amountGross.toFixed(2)).toBe("2500.00");
    expect(find("ETH", "CryptoFiatOut")?.amountNet.toFixed(2)).toBe("2475.00");
  });

  it("nets the transaction fee off a disposal against fiat", () => {
    // 2 500 € received, 25 € of fees, so the CARF amount is 2 475 €.
    expect(find("ETH", "CryptoFiatOut")?.amount.toFixed(2)).toBe("2475.00");
  });

  it("splits a swap into a crypto-to-crypto disposal and acquisition", () => {
    expect(find("BTC", "CryptotoCryptoOut")?.units.toString()).toBe("0.05");
    expect(find("ETH", "CryptotoCryptoIn")?.units.toString()).toBe("2");
    expect(find("BTC", "CryptoFiatOut")).toBeUndefined();
  });

  it("reports a payment above USD 50 000 as an RRPT and not as a transfer", () => {
    expect(find("ETH", "RRPT")?.units.toString()).toBe("30");
    expect(find("ETH", "CryptoTransferOut")?.txIds).not.toContain("pay");
  });

  it("keeps a small payment in the outbound transfers", () => {
    expect(find("ETH", "CryptoTransferOut")?.txIds).toContain("pay2");
  });

  it("repeats an unhosted transfer under TransferWallet without a count of its own", () => {
    const wallet = find("ETH", "TransferWallet");
    expect(wallet?.txIds).toContain("send");
    expect(find("ETH", "CryptoTransferOut")?.txIds).toContain("send");
  });

  it("converts the RRPT threshold into the books' currency", () => {
    expect(agg.rrptThreshold?.amount.toFixed(0)).toBe("46000");
  });

  it("books a staking reward as an inbound transfer", () => {
    expect(find("ETH", "CryptoTransferIn")?.units.toString()).toBe("0.01");
  });
});

describe("statement parsing", () => {
  it("recognises the CARF element names", () => {
    expect(matchBucket("CryptoFiatOut")).toBe("CryptoFiatOut");
    expect(matchBucket("CryptotoCryptoIn")).toBe("CryptotoCryptoIn");
    expect(matchBucket("Cessions contre monnaie fiduciaire")).toBe("CryptoFiatOut");
    expect(matchBucket("Veräußerung gegen Fiat")).toBe("CryptoFiatOut");
    expect(matchBucket("Transfers to unhosted wallets")).toBe("TransferWallet");
    expect(matchBucket("Reportable retail payment transactions")).toBe("RRPT");
    expect(matchBucket("Year-end holding")).toBe("HOLDING");
  });

  it("reads a CSV statement with continental numbers", () => {
    const csv = ["asset;type;count;units;amount;currency;year",
      "ETH;CryptoFiatOut;1;1,000000;2475,00;EUR;2026",
      "ETH;CryptoTransferOut;2;0,600000;1500,00;EUR;2026"].join("\n");
    const st = parseDac8Csv(csv);
    expect(st.year).toBe(2026);
    expect(st.currency).toBe("EUR");
    expect(st.lines.find((l) => l.bucket === "CryptoFiatOut")?.amount?.toFixed(2)).toBe("2475.00");
  });

  it("reads the real CARF XML shape", () => {
    const xml = `<?xml version="1.0"?>
    <carf:CARF xmlns:carf="urn:oecd:ties:carf:v1">
      <carf:CryptoUsers>
        <carf:RelevantTransactions>
          <carf:CryptoAsset>ETH</carf:CryptoAsset>
          <carf:CryptoFiatOut>
            <carf:NumberofTransactions>1</carf:NumberofTransactions>
            <carf:Amount currCode="EUR">2475.00</carf:Amount>
            <carf:NumberofUnits>1.000000</carf:NumberofUnits>
          </carf:CryptoFiatOut>
          <carf:TransferWallet>
            <carf:Amount currCode="EUR">500.00</carf:Amount>
            <carf:NumberofUnits>0.200000</carf:NumberofUnits>
            <carf:AltValuation>CARF1002</carf:AltValuation>
          </carf:TransferWallet>
        </carf:RelevantTransactions>
      </carf:CryptoUsers>
    </carf:CARF>`;
    const st = parseDac8Xml(xml, { year: 2026 });
    const out = st.lines.find((l) => l.bucket === "CryptoFiatOut");
    expect(out?.amount?.toFixed(2)).toBe("2475.00");
    expect(out?.count).toBe(1);
    const wallet = st.lines.find((l) => l.bucket === "TransferWallet");
    expect(wallet?.count).toBeNull();
    expect(wallet?.altValuation).toBe("CARF1002");
    expect(st.currency).toBe("EUR");
  });
});

describe("reconciliation", () => {
  it("matches a statement that agrees with the books", () => {
    const csv = ["asset;type;count;units;amount;currency;year",
      "ETH;CryptoFiatOut;1;1,000000;2475,00;EUR;2026"].join("\n");
    const st = parseDac8Csv(csv, { caspName: "Binance" });
    const r = reconcileDac8(st, agg);
    const line = r.lines.find((l) => l.asset === "ETH" && l.bucket === "CryptoFiatOut");
    expect(line?.status).toBe("MATCH");
  });

  it("flags a quantity the app does not know about", () => {
    const csv = ["asset;type;count;units;amount;currency;year",
      "SOL;CryptoFiatOut;4;100,000000;12000,00;EUR;2026"].join("\n");
    const st = parseDac8Csv(csv, { caspName: "Binance" });
    const r = reconcileDac8(st, agg);
    expect(r.status).toBe("DIFFERENCES");
    expect(r.lines.find((l) => l.asset === "SOL")?.status).toBe("MISSING_IN_APP");
    expect(r.advice.join(" ")).toContain("Complétez l'historique");
  });

  it("names a gross statement as the other fee treatment rather than an error", () => {
    const csv = ["asset;type;count;units;amount;currency;year",
      "ETH;CryptoFiatOut;1;1,000000;2500,00;EUR;2026"].join("\n");
    const st = parseDac8Csv(csv, { caspName: "Binance" });
    const r = reconcileDac8(st, agg);
    const line = r.lines.find((l) => l.asset === "ETH" && l.bucket === "CryptoFiatOut");
    expect(line?.status).toBe("MINOR");
    expect(line?.explanation).toContain("brut");
    expect(line?.explanation).toContain("annexe VI");
  });

  it("does not read a missing transaction count on TransferWallet as a difference", () => {
    const csv = ["asset;type;count;units;amount;currency;year",
      "ETH;TransferWallet;;0,200000;500,00;EUR;2026"].join("\n");
    const st = parseDac8Csv(csv, { caspName: "Binance" });
    const r = reconcileDac8(st, agg);
    const line = r.lines.find((l) => l.bucket === "TransferWallet");
    expect(line?.deltaCount).toBeNull();
  });
});
