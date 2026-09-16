import type { Leg } from "@/lib/engine/model";
import { buildTx, col, countCols, emptyResult, finalise, findAddress, hasCols, mkId, norm, num, parseDate, type CsvFormat, type ParseContext } from "./shared";

/**
 * Ledger Live — operation history export.
 *
 * A hardware wallet export is not an exchange export: it carries on-chain
 * movements only, so almost every row is a transfer in or out. Two things make
 * it valuable and two make it dangerous.
 *
 * Valuable: it carries the counterparty address and the transaction hash, which
 * is what lets the app match a withdrawal from an exchange with the deposit
 * into the wallet and book an internal transfer rather than a disposal.
 *
 * Dangerous: a "OUT" row is a disposal unless the destination is one of the
 * taxpayer's own addresses, and Ledger Live does not know which those are. The
 * importer therefore marks every outbound movement as needing qualification
 * unless the address is in the set of declared self-addresses.
 */
export const LEDGER: CsvFormat = {
  id: "ledger-live",
  platform: "Ledger Live",
  label: "Ledger Live — operation history (CSV)",
  where: "Ledger Live → Comptes → ⋯ → Exporter l'historique des opérations",
  detect(header, _rows, fileName) {
    if (/ledger.?live|operations/i.test(fileName) && hasCols(header, "Operation Type")) return 1;
    if (hasCols(header, "Operation Type", "Currency Ticker", "Operation Hash")) return 0.95;
    return countCols(header, ["Operation Date", "Currency Ticker", "Operation Type", "Operation Amount", "Operation Fees", "Account Name"]) >= 4 ? 0.7 : 0;
  },
  parse(rows, ctx: ParseContext) {
    const res = emptyResult(LEDGER.id, LEDGER.platform);
    const dates: Date[] = [];
    let unqualifiedOut = 0;

    for (const row of rows) {
      res.rowCount += 1;
      const when = parseDate(col(row, "Operation Date", "Date"));
      if (!when) { res.ignoredRows += 1; continue; }
      const op = norm(col(row, "Operation Type", "Type"));
      const asset = col(row, "Currency Ticker", "Currency").toUpperCase();
      const amount = num(col(row, "Operation Amount", "Amount")).abs();
      const fee = num(col(row, "Operation Fees", "Fees")).abs();
      const hash = col(row, "Operation Hash", "Hash") || undefined;
      const accountName = col(row, "Account Name") || undefined;
      const address = findAddress(col(row, "Counterparty", "Recipient", "Address"), accountName);
      const id = mkId(LEDGER.platform, [ctx.accountId, hash, when.getTime(), op, asset, amount.toString()]);
      const network = col(row, "Account Name")?.split(" ")[0] || undefined;
      if (amount.lte(0) && fee.lte(0)) { res.ignoredRows += 1; continue; }

      const push = (type: Parameters<typeof buildTx>[0]["type"], category: Parameters<typeof buildTx>[0]["category"], role: "IN" | "OUT") => {
        const legs: Leg[] = [];
        if (amount.gt(0)) legs.push({ asset, amount, role });
        if (fee.gt(0)) legs.push({ asset, amount: fee, role: "FEE" });
        res.transactions.push(buildTx({ ctx, externalId: id, timestamp: when, type, category, legs, ref: hash, note: accountName, address, network, txHash: hash }));
        dates.push(when);
      };

      switch (op) {
        case "in":
        case "received":
          push("CRYPTO_DEPOSIT", "UNKNOWN", "IN");
          break;
        case "out":
        case "sent": {
          const known = address ? ctx.selfAddresses?.has(address.toLowerCase()) ?? false : false;
          if (!known) unqualifiedOut += 1;
          push("CRYPTO_WITHDRAWAL", known ? "INTERNAL_TRANSFER" : "UNKNOWN", "OUT");
          break;
        }
        case "reward":
        case "delegate reward":
        case "staking reward":
          push("REWARD", "STAKING_INCOME", "IN");
          break;
        case "fees":
        case "fee":
          push("FEE", "TRADE", "OUT");
          break;
        case "delegate":
        case "undelegate":
        case "redelegate":
        case "bond":
        case "unbond":
        case "freeze":
        case "unfreeze":
          // Locking your own tokens moves nothing between owners.
          push("ADJUSTMENT", "INTERNAL_TRANSFER", "OUT");
          break;
        case "nft in":
        case "nft out":
          res.unknownOperations[op] = (res.unknownOperations[op] ?? 0) + 1;
          push("ADJUSTMENT", "UNKNOWN", op === "nft in" ? "IN" : "OUT");
          break;
        default:
          res.unknownOperations[op || "(vide)"] = (res.unknownOperations[op || "(vide)"] ?? 0) + 1;
          push("ADJUSTMENT", "UNKNOWN", "IN");
      }
    }

    if (unqualifiedOut > 0) {
      res.warnings.push(
        `${unqualifiedOut} envoi${unqualifiedOut > 1 ? "s" : ""} vers une adresse non reconnue : chacun est traité comme une opération à qualifier, pas comme un transfert interne. Déclarez vos adresses dans la fiche du compte pour que les transferts entre vos propres portefeuilles cessent d'être lus comme des cessions.`,
      );
    }
    res.warnings.push(
      "Un export de portefeuille matériel ne contient aucun prix : les valorisations proviennent des sources de cours de l'application, et non de la plateforme.",
    );
    return finalise(res, dates);
  },
};
