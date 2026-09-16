import { ZERO, type Decimal } from "@/lib/engine/money";
import type { Category, Leg, TxType } from "@/lib/engine/model";
import { buildTx, col, countCols, emptyResult, finalise, hasCols, mkId, norm, num, parseDate, type CsvFormat, type ParseContext } from "./shared";

/**
 * Kraken — ledgers.csv (History → Export → Ledgers).
 *
 * Kraken writes one row per asset movement and ties the two sides of a trade
 * together through `refid`, so rows are grouped by reference before being
 * rebuilt into operations. Asset codes carry Kraken's legacy prefixes
 * (XXBT, XETH, ZEUR), normalised here to their usual tickers.
 */
const KRAKEN_ASSETS: Record<string, string> = { XXBT: "BTC", XBT: "BTC", XETH: "ETH", XXRP: "XRP", XLTC: "LTC", XXLM: "XLM", XXMR: "XMR", XZEC: "ZEC", XREP: "REP", XETC: "ETC", XMLN: "MLN", XXDG: "DOGE", XDG: "DOGE", ZEUR: "EUR", ZUSD: "USD", ZGBP: "GBP", ZCAD: "CAD", ZJPY: "JPY", ZAUD: "AUD", ZCHF: "CHF" };

export function krakenAsset(raw: string): string {
  const a = raw.trim().toUpperCase().replace(/\.(S|M|F|B|HOLD|P\d*)$/i, "");
  if (KRAKEN_ASSETS[a]) return KRAKEN_ASSETS[a];
  if (/^[XZ][A-Z]{3,}$/.test(a) && KRAKEN_ASSETS[a.slice(0, 4)]) return KRAKEN_ASSETS[a.slice(0, 4)];
  return a;
}

const SINGLE_TYPES: Record<string, { type: TxType; category: Category }> = {
  deposit: { type: "CRYPTO_DEPOSIT", category: "UNKNOWN" },
  withdrawal: { type: "CRYPTO_WITHDRAWAL", category: "UNKNOWN" },
  staking: { type: "REWARD", category: "STAKING_INCOME" },
  earn: { type: "REWARD", category: "STAKING_INCOME" },
  reward: { type: "REWARD", category: "STAKING_INCOME" },
  dividend: { type: "REWARD", category: "STAKING_INCOME" },
  airdrop: { type: "REWARD", category: "AIRDROP" },
  transfer: { type: "CRYPTO_DEPOSIT", category: "INTERNAL_TRANSFER" },
  adjustment: { type: "ADJUSTMENT", category: "UNKNOWN" },
  rollover: { type: "FEE", category: "TRADE" },
  settled: { type: "ADJUSTMENT", category: "UNKNOWN" },
};

export const KRAKEN: CsvFormat = {
  id: "kraken-ledgers",
  platform: "Kraken",
  label: "Kraken — ledgers.csv",
  where: "Kraken → History → Export → Ledgers (CSV)",
  detect(header) {
    if (!hasCols(header, "refid", "asset", "amount")) return 0;
    const score = countCols(header, ["txid", "refid", "time", "type", "subtype", "aclass", "asset", "amount", "fee", "balance"]);
    return score >= 7 ? 0.97 : score >= 5 ? 0.7 : 0;
  },
  parse(rows, ctx: ParseContext) {
    const res = emptyResult(this.id, this.platform);
    const dates: Date[] = [];
    const groups = new Map<string, { time: Date; type: string; subtype: string; legs: { asset: string; amount: Decimal; fee: Decimal }[]; txids: string[] }>();

    for (const row of rows) {
      res.rowCount++;
      const time = parseDate(col(row, "time", "date"));
      const asset = krakenAsset(col(row, "asset"));
      const amount = num(col(row, "amount"));
      const fee = num(col(row, "fee"));
      const type = norm(col(row, "type"));
      const subtype = norm(col(row, "subtype"));
      const refid = col(row, "refid") || col(row, "txid") || `${time?.getTime()}`;
      if (!time || !asset || (amount.isZero() && fee.isZero())) { res.ignoredRows++; continue; }
      dates.push(time);
      const g = groups.get(`${refid}|${type}`) ?? { time, type, subtype, legs: [], txids: [] };
      g.legs.push({ asset, amount, fee });
      const txid = col(row, "txid");
      if (txid) g.txids.push(txid);
      groups.set(`${refid}|${type}`, g);
    }

    for (const [key, g] of groups) {
      const refid = key.split("|")[0];
      const externalId = mkId(this.platform, [refid, g.type, g.time.getTime(), g.legs.map((l) => `${l.asset}${l.amount}`).join(",")]);
      const ref = `Kraken ${g.type} ${refid}`;
      const outs = g.legs.filter((l) => l.amount.lt(0));
      const ins = g.legs.filter((l) => l.amount.gt(0));
      const fees: Leg[] = g.legs.filter((l) => l.fee.gt(0)).map((l) => ({ asset: l.asset, amount: l.fee, role: "FEE" as const }));

      if (g.type === "trade" || g.type === "spend" || g.type === "receive") {
        const legs: Leg[] = [
          ...outs.map((l) => ({ asset: l.asset, amount: l.amount.abs(), role: "OUT" as const })),
          ...ins.map((l) => ({ asset: l.asset, amount: l.amount, role: "IN" as const })),
          ...fees,
        ];
        if (legs.some((l) => l.role === "IN") && legs.some((l) => l.role === "OUT")) {
          res.transactions.push(buildTx({ ctx, externalId, timestamp: g.time, type: "TRADE", category: "TRADE", legs, ref }));
          continue;
        }
      }

      const mapped = SINGLE_TYPES[g.type];
      for (const l of g.legs) {
        const isIn = l.amount.gt(0);
        const fiat = ["EUR", "USD", "GBP", "CHF", "CAD", "AUD", "JPY"].includes(l.asset);
        let type: TxType;
        let category: Category = mapped?.category ?? "UNKNOWN";
        if (g.type === "deposit") { type = fiat ? "FIAT_DEPOSIT" : "CRYPTO_DEPOSIT"; if (fiat) category = "BANK_TRANSFER"; }
        else if (g.type === "withdrawal") { type = fiat ? "FIAT_WITHDRAWAL" : "CRYPTO_WITHDRAWAL"; if (fiat) category = "BANK_TRANSFER"; }
        else if (mapped) type = mapped.type;
        else { res.unknownOperations[g.type] = (res.unknownOperations[g.type] ?? 0) + 1; type = isIn ? "CRYPTO_DEPOSIT" : "CRYPTO_WITHDRAWAL"; }
        const legs: Leg[] = [];
        if (!l.amount.isZero()) legs.push({ asset: l.asset, amount: l.amount.abs(), role: isIn ? "IN" : "OUT" });
        if (l.fee.gt(0)) legs.push({ asset: l.asset, amount: l.fee, role: "FEE" });
        if (!legs.length) continue;
        res.transactions.push(buildTx({
          ctx, externalId: mkId(this.platform, [refid, g.type, l.asset, l.amount.toString()]), timestamp: g.time, type, category, legs, ref,
          note: mapped ? undefined : `Opération Kraken non reconnue : ${g.type}${g.subtype ? ` / ${g.subtype}` : ""}`,
          bank: fiat && (g.type === "deposit" || g.type === "withdrawal"),
        }));
      }
    }
    return finalise(res, dates);
  },
};

void ZERO;
