import type { Category, Leg, TxType } from "@/lib/engine/model";
import { buildTx, col, emptyResult, finalise, findAddress, mkId, norm, num, parseDate, type CsvFormat, type CsvImportResult, type ParseContext } from "./shared";

/**
 * Generic importer, for the platform nobody has written a format for yet.
 *
 * It accepts two shapes. The first is the app's own template: one row per
 * operation, with the asset given up, the asset received and the fee each in
 * their own columns. The second is the shape most spreadsheets end up in after
 * a manual clean-up: a date, a type, an asset and an amount. Anything it cannot
 * place goes in as a movement to qualify, with the original label kept, because
 * a row silently dropped is a hole in the cost basis that nobody notices until
 * a control.
 */
const TYPE_WORDS: Record<string, { type: TxType; category: Category }> = {
  achat: { type: "TRADE", category: "TRADE" },
  buy: { type: "TRADE", category: "TRADE" },
  vente: { type: "TRADE", category: "TRADE" },
  sell: { type: "TRADE", category: "TRADE" },
  trade: { type: "TRADE", category: "TRADE" },
  echange: { type: "TRADE", category: "TRADE" },
  swap: { type: "TRADE", category: "TRADE" },
  convert: { type: "TRADE", category: "TRADE" },
  depot: { type: "CRYPTO_DEPOSIT", category: "UNKNOWN" },
  deposit: { type: "CRYPTO_DEPOSIT", category: "UNKNOWN" },
  reception: { type: "CRYPTO_DEPOSIT", category: "UNKNOWN" },
  retrait: { type: "CRYPTO_WITHDRAWAL", category: "UNKNOWN" },
  withdrawal: { type: "CRYPTO_WITHDRAWAL", category: "UNKNOWN" },
  envoi: { type: "CRYPTO_WITHDRAWAL", category: "UNKNOWN" },
  send: { type: "CRYPTO_WITHDRAWAL", category: "UNKNOWN" },
  virement: { type: "FIAT_DEPOSIT", category: "BANK_TRANSFER" },
  staking: { type: "REWARD", category: "STAKING_INCOME" },
  reward: { type: "REWARD", category: "STAKING_INCOME" },
  recompense: { type: "REWARD", category: "STAKING_INCOME" },
  interet: { type: "REWARD", category: "STAKING_INCOME" },
  interest: { type: "REWARD", category: "STAKING_INCOME" },
  airdrop: { type: "REWARD", category: "AIRDROP" },
  minage: { type: "REWARD", category: "STAKING_INCOME" },
  mining: { type: "REWARD", category: "STAKING_INCOME" },
  paiement: { type: "CRYPTO_WITHDRAWAL", category: "PURCHASE_GOODS" },
  payment: { type: "CRYPTO_WITHDRAWAL", category: "PURCHASE_GOODS" },
  achat_bien: { type: "CRYPTO_WITHDRAWAL", category: "PURCHASE_GOODS" },
  don: { type: "CRYPTO_WITHDRAWAL", category: "GIFT_GIVEN" },
  gift: { type: "CRYPTO_DEPOSIT", category: "GIFT_RECEIVED" },
  perte: { type: "ADJUSTMENT", category: "LOST" },
  lost: { type: "ADJUSTMENT", category: "LOST" },
  frais: { type: "FEE", category: "TRADE" },
  fee: { type: "FEE", category: "TRADE" },
};

function matchType(raw: string): { type: TxType; category: Category } | undefined {
  const s = norm(raw).replace(/\s+/g, "_");
  if (TYPE_WORDS[s]) return TYPE_WORDS[s];
  for (const [word, v] of Object.entries(TYPE_WORDS)) if (s.includes(word)) return v;
  return undefined;
}

export const GENERIC: CsvFormat = {
  id: "generic",
  platform: "Générique",
  label: "Modèle générique (CSV)",
  where: "Téléchargez le modèle, remplissez-le depuis l'export de votre plateforme",
  // Lowest possible score: the registry only falls back here when nothing else matched.
  detect: () => 0.05,
  parse(rows, ctx: ParseContext): CsvImportResult {
    const res = emptyResult(GENERIC.id, GENERIC.platform);
    const dates: Date[] = [];
    for (const row of rows) {
      res.rowCount += 1;
      const when = parseDate(col(row, "date", "timestamp", "datetime", "horodatage", "date utc"));
      if (!when) { res.ignoredRows += 1; continue; }
      const rawType = col(row, "type", "operation", "kind", "nature", "libelle", "description");
      const mapped = matchType(rawType);
      const ref = col(row, "reference", "ref", "id", "transaction id") || undefined;
      const note = col(row, "note", "libelle", "description", "memo") || undefined;
      const address = findAddress(col(row, "adresse", "address", "destinataire", "counterparty"));

      const outAsset = col(row, "actif cede", "asset out", "sent asset", "devise cedee", "sent currency").toUpperCase();
      const outAmount = num(col(row, "quantite cedee", "amount out", "sent amount", "montant cede")).abs();
      const inAsset = col(row, "actif recu", "asset in", "received asset", "devise recue", "received currency").toUpperCase();
      const inAmount = num(col(row, "quantite recue", "amount in", "received amount", "montant recu")).abs();
      const feeAsset = col(row, "actif des frais", "fee asset", "fee currency", "devise des frais").toUpperCase();
      const feeAmount = num(col(row, "frais", "fee", "fee amount", "montant des frais")).abs();
      const id = mkId("generic", [ctx.accountId, ref, when.getTime(), rawType, outAsset, inAsset, outAmount.toString(), inAmount.toString()]);

      // Shape one: both sides given explicitly.
      if (outAmount.gt(0) || inAmount.gt(0)) {
        const legs: Leg[] = [];
        if (outAsset && outAmount.gt(0)) legs.push({ asset: outAsset, amount: outAmount, role: "OUT" });
        if (inAsset && inAmount.gt(0)) legs.push({ asset: inAsset, amount: inAmount, role: "IN" });
        if (feeAmount.gt(0)) legs.push({ asset: (feeAsset || outAsset || inAsset), amount: feeAmount, role: "FEE" });
        const bothSides = legs.some((l) => l.role === "OUT") && legs.some((l) => l.role === "IN");
        const inferred: { type: TxType; category: Category } = bothSides
          ? { type: "TRADE", category: "TRADE" }
          : legs.some((l) => l.role === "IN")
            ? { type: "CRYPTO_DEPOSIT", category: "UNKNOWN" }
            : { type: "CRYPTO_WITHDRAWAL", category: "UNKNOWN" };
        const chosen = mapped ?? inferred;
        res.transactions.push(buildTx({ ctx, externalId: id, timestamp: when, type: chosen.type, category: chosen.category, legs, ref, note: note ?? rawType, address, bank: chosen.category === "BANK_TRANSFER" }));
        dates.push(when);
        continue;
      }

      // Shape two: a single asset and a signed amount.
      const asset = col(row, "actif", "asset", "devise", "currency", "coin", "symbol", "ticker").toUpperCase();
      const amount = num(col(row, "quantite", "amount", "montant", "qty", "quantity"));
      if (!asset || amount.isZero()) {
        res.ignoredRows += 1;
        if (rawType) res.unknownOperations[rawType] = (res.unknownOperations[rawType] ?? 0) + 1;
        continue;
      }
      const chosen = mapped ?? (amount.lt(0) ? { type: "CRYPTO_WITHDRAWAL" as TxType, category: "UNKNOWN" as Category } : { type: "CRYPTO_DEPOSIT" as TxType, category: "UNKNOWN" as Category });
      const outgoing = amount.lt(0) || chosen.type === "CRYPTO_WITHDRAWAL" || chosen.type === "FIAT_WITHDRAWAL" || chosen.type === "FEE";
      const legs: Leg[] = [{ asset, amount: amount.abs(), role: outgoing ? "OUT" : "IN" }];
      if (feeAmount.gt(0)) legs.push({ asset: feeAsset || asset, amount: feeAmount, role: "FEE" });
      if (!mapped && rawType) res.unknownOperations[rawType] = (res.unknownOperations[rawType] ?? 0) + 1;
      res.transactions.push(buildTx({ ctx, externalId: id, timestamp: when, type: chosen.type, category: chosen.category, legs, ref, note: note ?? rawType, address, bank: chosen.category === "BANK_TRANSFER" }));
      dates.push(when);
    }
    return finalise(res, dates);
  },
};

/** Template offered for download, in the shape the importer reads best. */
export const GENERIC_CSV_TEMPLATE = [
  "date;type;actif cede;quantite cedee;actif recu;quantite recue;actif des frais;frais;reference;note",
  "2026-01-15T10:30:00Z;achat;EUR;9000,00;BTC;0,10000000;EUR;10,00;ORD-1;Achat au comptant",
  "2026-03-02T12:00:00Z;echange;BTC;0,05000000;ETH;2,00000000;BTC;0,00001000;ORD-2;Conversion",
  "2026-04-10T09:00:00Z;staking;;;ETH;0,01000000;;;R-1;Récompense de staking",
  "2026-05-20T17:45:00Z;retrait;ETH;0,50000000;;;ETH;0,00100000;0xabc…;Envoi vers mon portefeuille",
].join("\r\n") + "\r\n";
