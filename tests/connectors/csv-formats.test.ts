import { describe, it, expect } from "vitest";
import { detectFormat, importCsv, CSV_FORMATS } from "@/lib/connectors/csv";
import { splitAmount } from "@/lib/connectors/csv/bitstamp";
import { krakenAsset } from "@/lib/connectors/csv/kraken";

const ctx = { accountId: "acc-1", platform: "" };
const imp = (text: string, fileName = "") => importCsv(text, { ...ctx, formatId: detectFormat(text, fileName).format.id });

const COINBASE_CSV = [
  "Timestamp,Transaction Type,Asset,Quantity Transacted,Spot Price Currency,Spot Price at Transaction,Subtotal,Total (inclusive of fees and/or spread),Fees and/or Spread,Notes",
  "2026-01-15T10:30:00Z,Buy,BTC,0.10000000,EUR,90000.00,9000.00,9010.00,10.00,Bought 0.1 BTC for €9010.00 EUR",
  "2026-03-02T12:00:00Z,Convert,BTC,0.05000000,EUR,100000.00,5000.00,5000.00,0.00,Converted 0.05 BTC to 2.00 ETH",
].join("\n");

const KRAKEN_CSV = [
  '"txid","refid","time","type","subtype","aclass","asset","amount","fee","balance"',
  '"L1","REF1","2026-01-15 10:30:00","trade","","currency","ZEUR","-9000.0000","10.0000","1000.0000"',
  '"L2","REF1","2026-01-15 10:30:00","trade","","currency","XXBT","0.1000000000","0.0000000000","0.1000000000"',
  '"L3","REF2","2026-04-01 08:00:00","staking","","currency","XETH","0.0100000000","0.0000000000","0.0100000000"',
].join("\n");

const BITVAVO_CSV = [
  "Date,Time,Type,Currency,Amount,Quote Currency,Quote Price,Received / Paid Currency,Received / Paid Amount,Fee currency,Fee amount,Status,Transaction ID,Address",
  "2026-01-15,10:30:00,buy,BTC,0.10000000,EUR,90000.00,EUR,9000.00,EUR,10.00,Completed,abc123,",
  "2026-05-20,17:45:00,withdrawal,ETH,0.50000000,EUR,3000.00,EUR,1500.00,ETH,0.00100000,Completed,def456,0x1111111111111111111111111111111111111111",
].join("\n");

const BITPANDA_CSV = [
  "# Bitpanda transaction export",
  "# Generated 2026-09-16",
  "Transaction ID,Timestamp,Transaction Type,In/Out,Amount Fiat,Fiat,Amount Asset,Asset,Asset market price,Asset market price currency,Asset class,Product ID,Fee,Fee asset,Spread,Spread Currency",
  "T1,2026-01-15T10:30:00+01:00,buy,incoming,9000.00,EUR,0.10000000,BTC,90000.00,EUR,Cryptocurrency,1,10.00,EUR,,",
  "T2,2026-06-01T10:00:00+01:00,sell,outgoing,4500.00,EUR,0.05000000,BTC,90000.00,EUR,Cryptocurrency,1,5.00,EUR,,",
].join("\n");

const CRYPTOCOM_CSV = [
  "Timestamp (UTC),Transaction Description,Currency,Amount,To Currency,To Amount,Native Currency,Native Amount,Native Amount (in USD),Transaction Kind,Transaction Hash",
  "2026-01-15 10:30:00,Buy BTC,BTC,0.10000000,,,EUR,9000.00,9800.00,viban_purchase,",
  "2026-02-01 14:00:00,Coffee,EUR,-4.50,,,EUR,-4.50,-4.90,card_spend,",
  "2026-02-01 14:00:01,Card cashback,CRO,10.00000000,,,EUR,1.20,1.30,referral_card_cashback,",
].join("\n");

const BITSTAMP_CSV = [
  "Type,Datetime,Account,Amount,Value,Rate,Fee,Sub Type",
  'Market,"Jan. 15, 2026, 10:30 AM",Main Account,0.10000000 BTC,9000.00 EUR,90000.00 EUR,10.00 EUR,Buy',
  'Deposit,"Jan. 14, 2026, 09:00 AM",Main Account,10000.00 EUR,,,0.00 EUR,',
].join("\n");

const LEDGER_CSV = [
  "Operation Date,Status,Currency Ticker,Operation Type,Operation Amount,Operation Fees,Operation Hash,Account Name,Account xpub,Countervalue Ticker,Countervalue at Operation Date,Countervalue at CSV Export",
  "2026-05-20T17:50:00.000Z,Confirmed,ETH,IN,0.49900000,0.00100000,0xhash1,Ethereum 1,xpub,EUR,1497.00,1500.00",
  "2026-06-15T09:00:00.000Z,Confirmed,ETH,OUT,0.20000000,0.00050000,0xhash2,Ethereum 1,xpub,EUR,600.00,610.00",
].join("\n");

const GENERIC_CSV = [
  "date;type;actif cede;quantite cedee;actif recu;quantite recue;actif des frais;frais;reference;note",
  "2026-01-15T10:30:00Z;achat;EUR;9000,00;BTC;0,10000000;EUR;10,00;ORD-1;Achat au comptant",
  "2026-04-10T09:00:00Z;staking;;;ETH;0,01000000;;;R-1;Récompense",
].join("\n");

describe("format detection", () => {
  const cases: [string, string, string][] = [
    ["Coinbase", COINBASE_CSV, "coinbase-transactions"],
    ["Kraken", KRAKEN_CSV, "kraken-ledgers"],
    ["Bitvavo", BITVAVO_CSV, "bitvavo"],
    ["Bitpanda", BITPANDA_CSV, "bitpanda"],
    ["Crypto.com", CRYPTOCOM_CSV, "crypto-com-app"],
    ["Bitstamp", BITSTAMP_CSV, "bitstamp"],
    ["Ledger Live", LEDGER_CSV, "ledger-live"],
  ];
  for (const [name, csv, id] of cases) {
    it(`recognises a ${name} export from its columns alone`, () => {
      const d = detectFormat(csv);
      expect(d.format.id, `${name} -> ${d.format.id}`).toBe(id);
      expect(d.confidence).toBeGreaterThanOrEqual(0.6);
    });
  }

  it("falls back to the generic reader rather than refusing the file", () => {
    const d = detectFormat("col_a;col_b\n1;2");
    expect(d.format.id).toBe("generic");
  });

  it("gives every reader an id, a label and a place to find the export", () => {
    for (const f of CSV_FORMATS) {
      expect(f.id).toBeTruthy();
      expect(f.label).toBeTruthy();
      expect(f.where).toBeTruthy();
    }
    expect(new Set(CSV_FORMATS.map((f) => f.id)).size).toBe(CSV_FORMATS.length);
  });
});

describe("each reader rebuilds the operations", () => {
  it("Coinbase: a buy carries both legs and the fee", () => {
    const r = imp(COINBASE_CSV);
    const buy = r.transactions.find((t) => t.type === "TRADE");
    expect(buy).toBeDefined();
    expect(buy!.legs.find((l) => l.role === "IN")?.asset).toBe("BTC");
    expect(buy!.legs.find((l) => l.role === "OUT")?.asset).toBe("EUR");
  });

  it("Kraken: rows sharing a refid become one trade, with legacy tickers normalised", () => {
    expect(krakenAsset("XXBT")).toBe("BTC");
    expect(krakenAsset("ZEUR")).toBe("EUR");
    const r = imp(KRAKEN_CSV);
    const trade = r.transactions.find((t) => t.type === "TRADE");
    expect(trade?.legs.map((l) => l.asset).sort()).toEqual(["BTC", "EUR", "EUR"]);
    expect(r.transactions.find((t) => t.type === "REWARD")?.legs[0].asset).toBe("ETH");
  });

  it("Bitvavo: a withdrawal keeps its destination address", () => {
    const r = imp(BITVAVO_CSV);
    const wd = r.transactions.find((t) => t.type === "CRYPTO_WITHDRAWAL");
    expect(wd?.counterparty?.address).toBe("0x1111111111111111111111111111111111111111");
    expect(r.transactions.find((t) => t.type === "TRADE")?.legs.length).toBe(3);
  });

  it("Bitpanda: the comment preamble is stripped and both sides are read", () => {
    const r = imp(BITPANDA_CSV);
    expect(r.rowCount).toBe(2);
    const sell = r.transactions.find((t) => t.legs.some((l) => l.role === "OUT" && l.asset === "BTC"));
    expect(sell?.legs.find((l) => l.role === "IN")?.asset).toBe("EUR");
  });

  it("Crypto.com: card spending is a disposal and cashback is income", () => {
    const r = imp(CRYPTOCOM_CSV);
    const spend = r.transactions.find((t) => t.category === "PURCHASE_GOODS");
    expect(spend?.legs[0].asset).toBe("EUR");
    const cashback = r.transactions.find((t) => t.type === "REWARD");
    expect(cashback?.legs[0].asset).toBe("CRO");
    expect(cashback?.legs[0].role).toBe("IN");
  });

  it("Bitstamp: amounts that carry their ticker are split", () => {
    expect(splitAmount("0.10000000 BTC")?.asset).toBe("BTC");
    expect(splitAmount("9000.00 EUR")?.amount.toFixed(2)).toBe("9000.00");
    const r = imp(BITSTAMP_CSV);
    const trade = r.transactions.find((t) => t.type === "TRADE");
    expect(trade?.legs.find((l) => l.role === "IN")?.asset).toBe("BTC");
    expect(r.transactions.find((t) => t.type === "FIAT_DEPOSIT")).toBeDefined();
  });

  it("Ledger Live: a send to an unknown address is flagged rather than assumed internal", () => {
    const r = imp(LEDGER_CSV);
    const out = r.transactions.find((t) => t.type === "CRYPTO_WITHDRAWAL");
    expect(out?.category).toBe("UNKNOWN");
    expect(r.warnings.join(" ")).toContain("adresse non reconnue");
  });

  it("Ledger Live: a send to a declared address of one's own is an internal transfer", () => {
    const r = importCsv(LEDGER_CSV.replace("0xhash2,Ethereum 1", "0xhash2,0x2222222222222222222222222222222222222222"), {
      accountId: "acc-1", platform: "", selfAddresses: new Set(["0x2222222222222222222222222222222222222222"]),
    });
    expect(r.transactions.find((t) => t.type === "CRYPTO_WITHDRAWAL")?.category).toBe("INTERNAL_TRANSFER");
  });

  it("generic: reads the template with continental decimals", () => {
    const r = imp(GENERIC_CSV);
    const buy = r.transactions.find((t) => t.type === "TRADE");
    expect(buy?.legs.find((l) => l.role === "IN")?.amount.toString()).toBe("0.1");
    expect(buy?.legs.find((l) => l.role === "OUT")?.amount.toFixed(2)).toBe("9000.00");
    expect(r.transactions.find((t) => t.type === "REWARD")?.legs[0].asset).toBe("ETH");
  });

  it("never drops a row it cannot interpret", () => {
    const weird = ["date;type;actif;quantite", "2026-01-15T10:30:00Z;opération exotique;BTC;0,5"].join("\n");
    const r = imp(weird);
    expect(r.transactions.length).toBe(1);
    expect(r.transactions[0].category).toBe("UNKNOWN");
    expect(Object.keys(r.unknownOperations).length).toBe(1);
    expect(r.warnings.join(" ")).toContain("non reconnue");
  });

  it("gives every transaction a stable id that survives a re-import", () => {
    const first = imp(COINBASE_CSV).transactions.map((t) => t.id);
    const second = imp(COINBASE_CSV).transactions.map((t) => t.id);
    expect(first).toEqual(second);
    expect(new Set(first).size).toBe(first.length);
  });
});
