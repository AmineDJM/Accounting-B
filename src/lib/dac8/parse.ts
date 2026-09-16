import Papa from "papaparse";
import { XMLParser } from "fast-xml-parser";
import { D, ZERO, type Decimal } from "@/lib/engine/money";
import { ALT_VALUATIONS, DAC8_BUCKETS, EXCHANGE_TYPES, TRANSFER_IN_TYPES, TRANSFER_OUT_TYPES, type Dac8Bucket, type Dac8HoldingLine, type Dac8Line, type Dac8Statement } from "./types";

/**
 * Readers for the annual statements providers hand to their users.
 *
 * Two shapes exist. The OECD CARF XML schema is what a provider sends to its
 * tax administration: aggregates nest under one `RelevantTransactions` block
 * per crypto-asset, with one child element per category. What usually reaches
 * the user is a spreadsheet whose columns differ from one provider to the next.
 * The CSV reader therefore maps columns by meaning in several languages; the
 * XML reader reads the real schema first and falls back to walking the tree.
 * Anything not understood is kept in `unmapped` so it shows up in the interface
 * rather than being silently dropped.
 */

const SYNONYMS: Record<string, string[]> = {
  asset: ["asset", "cryptoasset", "crypto asset", "crypto_asset", "crypto", "coin", "symbol", "ticker", "token", "actif", "crypto-actif", "devise", "kryptowert", "activo", "attivita", "attività"],
  bucket: ["type", "bucket", "element", "transaction type", "transaction_type", "operation", "category", "categorie", "catégorie", "nature", "art", "typ", "tipo", "tipologia", "descripcion", "description"],
  count: ["count", "number of transactions", "numberoftransactions", "number_of_transactions", "transactions", "nb", "nombre", "nombre d'operations", "nombre d'opérations", "anzahl", "numero", "número", "numero operazioni", "operations", "opérations"],
  units: ["units", "unit", "numberofunits", "quantity", "qty", "number of units", "amount in units", "unites", "unités", "quantite", "quantité", "menge", "stueckzahl", "cantidad", "quantita", "quantità"],
  amount: ["amount", "net amount", "gross amount", "gross_amount", "aggregate amount", "total", "value", "fair market value", "fmv", "consideration", "montant", "montant net", "montant brut", "valeur", "contrepartie", "betrag", "wert", "importe", "valor", "importo", "valore"],
  currency: ["currency", "currcode", "fiat currency", "devise", "monnaie", "waehrung", "währung", "moneda", "valuta"],
  year: ["year", "reportingperiod", "annee", "année", "jahr", "ano", "año", "anno", "period", "periode", "période"],
  typeCode: ["exchangetype", "transfertype", "type code", "code", "carf code"],
  altValuation: ["altvaluation", "valuation", "valuation method", "methode de valorisation", "méthode de valorisation"],
};

const norm = (s: string) => s.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");

function mapColumns(header: string[]): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [field, names] of Object.entries(SYNONYMS)) {
    const hit = header.find((h) => names.includes(norm(h))) ?? header.find((h) => names.some((n) => norm(h).includes(n)));
    out[field] = hit;
  }
  return out;
}

/** Lower-cased CARF element names, so an exact schema label always wins. */
const EXACT: Record<string, Dac8Bucket> = Object.fromEntries(DAC8_BUCKETS.map((b) => [b.toLowerCase(), b])) as Record<string, Dac8Bucket>;

/**
 * Maps a provider's label to one of the eight CARF elements.
 *
 * `HOLDING` is returned for a year-end position line. CARF defines no such
 * element, so the caller records the statement as carrying a domestic extra
 * rather than treating the absence of a match as an error.
 */
export function matchBucket(raw: string): Dac8Bucket | "HOLDING" | null {
  const s = norm(raw);
  if (!s) return null;
  const compact = s.replace(/\s/g, "");
  if (EXACT[compact]) return EXACT[compact];
  const has = (...words: string[]) => words.some((w) => s.includes(w));
  if (has("holding", "balance", "solde", "bestand", "saldo", "giacenza", "year end", "year-end", "cloture", "clôture", "closing")) return "HOLDING";
  if (has("rrpt", "retail payment", "paiement de detail", "paiement de détail")) return "RRPT";

  const isCrypto = has("crypto to crypto", "cryptotocrypto", "against crypto", "other crypto", "autre actif", "autres actifs", "contre crypto", "kryptowert", "cripto", "permuta", "swap", "echange", "échange");
  const isFiat = has("fiat", "monnaie", "currency", "monetaria", "devise", "euro", "cash", "legal tender");

  if (has("transferwallet", "transfer wallet", "unhosted", "non heberge", "non hébergé", "self custody", "self-custody", "private wallet", "portefeuille prive", "portefeuille privé")) return "TransferWallet";
  if (has("transfer", "transfert", "uebertragung", "übertragung", "transferencia", "trasferimento", "withdraw", "retrait", "deposit", "depot", "dépôt")) {
    if (has("out", "sortant", "sent", "envoye", "envoyé", "withdraw", "retrait", "ausgehend", "saliente", "uscita")) return "CryptoTransferOut";
    return "CryptoTransferIn";
  }
  if (has("payment", "paiement", "zahlung", "pago", "pagamento")) return "RRPT";

  const isAcq = has("acquisition", "acquis", "in", "achat", "buy", "bought", "purchase", "erwerb", "kauf", "compra", "acquisto");
  const isDisp = has("disposal", "out", "cession", "vente", "sell", "sold", "sale", "veraeusserung", "veräußerung", "verkauf", "venta", "vendita", "cessione");
  if (isDisp && !isAcq) return isCrypto && !isFiat ? "CryptotoCryptoOut" : "CryptoFiatOut";
  if (isAcq) return isCrypto && !isFiat ? "CryptotoCryptoIn" : "CryptoFiatIn";
  return null;
}

/** Recognises a CARF enumeration value and returns it normalised, or undefined. */
export function matchCode(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const s = raw.trim().toUpperCase();
  const known = { ...EXCHANGE_TYPES, ...TRANSFER_IN_TYPES, ...TRANSFER_OUT_TYPES, ...ALT_VALUATIONS };
  return s in known ? s : undefined;
}

const num = (v: string | undefined): Decimal | null => {
  if (v === undefined || v === null) return null;
  const s = String(v).trim().replace(/\s| /g, "");
  if (!s) return null;
  // "1.234,56" (continental) vs "1,234.56" (anglo)
  const normalised = s.includes(",") && s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  const n = Number(normalised);
  return isFinite(n) ? D(normalised) : null;
};

export interface ParseOptions {
  caspName?: string;
  year?: number;
  currency?: string;
}

export function parseDac8Csv(text: string, opts: ParseOptions = {}): Dac8Statement {
  const parsed = Papa.parse<Record<string, string>>(text.replace(/^﻿/, ""), { header: true, skipEmptyLines: true, transformHeader: (h) => h.trim(), delimiter: "" });
  const header = parsed.meta.fields ?? [];
  const cols = mapColumns(header);
  const unmapped: string[] = [];
  if (!cols.asset) unmapped.push("Colonne « actif » introuvable : renommez-la en « asset » ou saisissez le relevé manuellement.");
  if (!cols.bucket) unmapped.push("Colonne « type d'opération » introuvable : renommez-la en « type ».");

  const lines: Dac8Line[] = [];
  const holdings: Dac8HoldingLine[] = [];
  let currency = opts.currency ?? "EUR";
  let year = opts.year ?? 0;

  for (const row of parsed.data) {
    const asset = (cols.asset ? row[cols.asset] : "")?.trim().toUpperCase();
    if (!asset) continue;
    const bucketRaw = cols.bucket ? row[cols.bucket] : "";
    const bucket = matchBucket(bucketRaw ?? "");
    const cur = cols.currency ? row[cols.currency]?.trim().toUpperCase() : undefined;
    if (cur && cur.length === 3) currency = cur;
    const y = cols.year ? Number(String(row[cols.year]).slice(0, 4)) : undefined;
    if (y && y > 2000 && y < 2100) year = y;
    const units = num(cols.units ? row[cols.units] : undefined);
    const amount = num(cols.amount ? row[cols.amount] : undefined);
    const countRaw = num(cols.count ? row[cols.count] : undefined);
    if (bucket === "HOLDING") {
      holdings.push({ asset, units: units ?? ZERO, fairMarketValue: amount });
      continue;
    }
    if (!bucket) {
      unmapped.push(`Ligne non reconnue : « ${bucketRaw ?? ""} » pour ${asset}`);
      continue;
    }
    lines.push({
      asset,
      bucket,
      count: bucket === "TransferWallet" ? null : countRaw ? Number(countRaw.toString()) : 0,
      units,
      amount,
      typeCode: matchCode(cols.typeCode ? row[cols.typeCode] : undefined),
      altValuation: matchCode(cols.altValuation ? row[cols.altValuation] : undefined),
    });
  }

  return {
    caspName: opts.caspName ?? "Prestataire",
    year: year || opts.year || new Date().getUTCFullYear() - 1,
    currency,
    lines: mergeLines(lines),
    holdings,
    holdingsOutsideCarf: holdings.length > 0,
    unmapped: [...new Set(unmapped)].slice(0, 30),
    source: "CSV",
  };
}

function mergeLines(lines: Dac8Line[]): Dac8Line[] {
  const m = new Map<string, Dac8Line>();
  for (const l of lines) {
    const k = `${l.asset}|${l.bucket}`;
    const cur = m.get(k);
    if (!cur) { m.set(k, { ...l }); continue; }
    if (cur.count !== null && l.count !== null) cur.count += l.count;
    else if (l.count !== null) cur.count = l.count;
    cur.units = cur.units && l.units ? cur.units.plus(l.units) : (cur.units ?? l.units);
    cur.amount = cur.amount && l.amount ? cur.amount.plus(l.amount) : (cur.amount ?? l.amount);
    cur.typeCode = cur.typeCode ?? l.typeCode;
    cur.altValuation = cur.altValuation ?? l.altValuation;
  }
  return [...m.values()].sort((a, b) => a.asset.localeCompare(b.asset) || a.bucket.localeCompare(b.bucket));
}

/* ------------------------------------------------------------------- XML */

type XmlNode = Record<string, unknown>;

const localName = (tag: string) => tag.replace(/^[^:]*:/, "");

/** Walks the tree and returns every node whose local name matches one of `names`. */
function findNodes(node: unknown, names: string[], acc: XmlNode[] = []): XmlNode[] {
  if (Array.isArray(node)) { for (const n of node) findNodes(n, names, acc); return acc; }
  if (!node || typeof node !== "object") return acc;
  for (const [k, v] of Object.entries(node as XmlNode)) {
    if (names.includes(localName(k).toLowerCase())) {
      if (Array.isArray(v)) acc.push(...(v as XmlNode[]).filter((x) => x && typeof x === "object"));
      else if (v && typeof v === "object") acc.push(v as XmlNode);
    }
    findNodes(v, names, acc);
  }
  return acc;
}

/** Reads the first descendant value whose local name matches one of `names`. */
function readValue(node: unknown, names: string[]): string | undefined {
  if (!node || typeof node !== "object") return undefined;
  for (const [k, v] of Object.entries(node as XmlNode)) {
    const ln = localName(k).toLowerCase();
    if (names.includes(ln)) {
      if (typeof v === "string" || typeof v === "number") return String(v);
      if (v && typeof v === "object") {
        const inner = (v as XmlNode)["#text"];
        if (inner !== undefined) return String(inner);
      }
    }
  }
  for (const v of Object.values(node as XmlNode)) {
    const found = readValue(v, names);
    if (found !== undefined) return found;
  }
  return undefined;
}

/** Returns the direct children of `node` whose local name is `name`. */
function childrenNamed(node: XmlNode, name: string): XmlNode[] {
  const out: XmlNode[] = [];
  for (const [k, v] of Object.entries(node)) {
    if (localName(k).toLowerCase() !== name.toLowerCase()) continue;
    if (Array.isArray(v)) out.push(...(v as XmlNode[]).filter((x) => x && typeof x === "object"));
    else if (v && typeof v === "object") out.push(v as XmlNode);
  }
  return out;
}

/** Reads a scalar direct child, taking `#text` into account. */
function scalar(node: XmlNode, name: string): string | undefined {
  for (const [k, v] of Object.entries(node)) {
    if (localName(k).toLowerCase() !== name.toLowerCase()) continue;
    if (typeof v === "string" || typeof v === "number") return String(v);
    if (v && typeof v === "object") {
      const inner = (v as XmlNode)["#text"];
      if (inner !== undefined) return String(inner);
    }
  }
  return undefined;
}

/**
 * Reads a CARF-shaped XML file.
 *
 * First pass follows the real schema: each `RelevantTransactions` block carries
 * a `CryptoAsset` name and up to eight category elements. Second pass, used when
 * the file is a provider's own dialect, walks the tree looking for nodes with an
 * asset name and numeric children.
 */
export function parseDac8Xml(xml: string, opts: ParseOptions = {}): Dac8Statement {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@", parseTagValue: false, trimValues: true });
  const doc = parser.parse(xml) as XmlNode;
  const unmapped: string[] = [];
  const lines: Dac8Line[] = [];
  const holdings: Dac8HoldingLine[] = [];

  const caspName = readValue(doc, ["name", "organisationname", "entityname", "reportingentityname"]) ?? opts.caspName ?? "Prestataire";
  const caspCountry = readValue(doc, ["rescountrycode", "countrycode", "transmittingcountry"]);
  const caspIdentifier = readValue(doc, ["tin", "in", "lei", "identifier"]);
  const yearRaw = readValue(doc, ["reportingperiod", "period", "taxyear", "year"]);
  const year = yearRaw ? Number(String(yearRaw).slice(0, 4)) : opts.year ?? new Date().getUTCFullYear() - 1;
  let currency = readValue(doc, ["currcode", "currency", "fiatcurrency"]) ?? opts.currency ?? "EUR";

  // --- schema pass ---------------------------------------------------------
  const blocks = findNodes(doc, ["relevanttransactions"]);
  for (const block of blocks) {
    const asset = (scalar(block, "CryptoAsset") ?? readValue(block, ["cryptoasset"]) ?? "").trim().toUpperCase();
    if (!asset) continue;
    for (const bucket of DAC8_BUCKETS) {
      for (const el of childrenNamed(block, bucket)) {
        const amountNode = Object.entries(el).find(([k]) => localName(k).toLowerCase() === "amount")?.[1];
        const cur = amountNode && typeof amountNode === "object" ? (amountNode as XmlNode)["@currCode"] : undefined;
        if (typeof cur === "string" && cur.length === 3) currency = cur.toUpperCase();
        const countRaw = scalar(el, "NumberofTransactions");
        lines.push({
          asset,
          bucket,
          count: bucket === "TransferWallet" ? null : countRaw !== undefined ? Number(countRaw) : 0,
          units: num(scalar(el, "NumberofUnits")),
          amount: num(scalar(el, "Amount")),
          typeCode: matchCode(scalar(el, "ExchangeType") ?? scalar(el, "TransferType")),
          altValuation: matchCode(scalar(el, "AltValuation")),
        });
      }
    }
  }

  // --- tolerant pass, for a provider's own dialect --------------------------
  if (lines.length === 0) {
    const assetNodes = findNodes(doc, ["cryptoasset", "reportabletransaction", "assetdetail", "cryptoassettransaction", "transaction"]);
    for (const node of assetNodes) {
      const asset = readValue(node, ["cryptoassettype", "assettype", "cryptoasset", "assetname", "name", "symbol"]);
      if (!asset) continue;
      const typeRaw = readValue(node, ["transactiontype", "type", "category", "transactioncategory"]) ?? "";
      const bucket = matchBucket(typeRaw);
      const units = num(readValue(node, ["numberofunits", "units", "quantity", "unitcount"]));
      const amount = num(readValue(node, ["amount", "aggregategrossamount", "grossamount", "fairmarketvalue", "value"]));
      const cnt = num(readValue(node, ["numberoftransactions", "transactioncount", "count"]));
      if (bucket === "HOLDING" || (!bucket && /holding|balance/i.test(typeRaw))) {
        holdings.push({ asset: asset.toUpperCase(), units: units ?? ZERO, fairMarketValue: amount });
        continue;
      }
      if (!bucket) { unmapped.push(`Type non reconnu : « ${typeRaw} » pour ${asset}`); continue; }
      lines.push({ asset: asset.toUpperCase(), bucket, count: bucket === "TransferWallet" ? null : cnt ? Number(cnt.toString()) : 0, units, amount });
    }
  }
  if (lines.length === 0 && holdings.length === 0) unmapped.push("Aucun bloc d'agrégats reconnu dans ce fichier XML : utilisez l'import CSV ou la saisie manuelle.");
  if (holdings.length) unmapped.push("Ce fichier comporte des positions de fin d'année. Le CARF ne prévoit aucun élément de stock : cette information relève d'une obligation nationale distincte (Modelo 172 espagnol, quadro RW italien) et n'entre pas dans le rapprochement DAC8.");

  return {
    caspName, caspCountry, caspIdentifier, year, currency,
    lines: mergeLines(lines), holdings, holdingsOutsideCarf: holdings.length > 0,
    unmapped: [...new Set(unmapped)].slice(0, 30), source: "XML",
  };
}

export function parseDac8(fileName: string, content: string, opts: ParseOptions = {}): Dac8Statement {
  return /\.xml$/i.test(fileName) || content.trimStart().startsWith("<") ? parseDac8Xml(content, opts) : parseDac8Csv(content, opts);
}

/** Template offered for download so a user can transcribe any statement. */
export const DAC8_CSV_TEMPLATE = [
  "asset;type;count;units;amount;currency;year",
  "BTC;CryptoFiatIn;12;0,450000;28500,00;EUR;2026",
  "BTC;CryptoFiatOut;3;0,120000;9100,00;EUR;2026",
  "BTC;CryptotoCryptoOut;5;0,080000;6200,00;EUR;2026",
  "BTC;CryptoTransferIn;1;0,010000;750,00;EUR;2026",
  "BTC;CryptoTransferOut;2;0,050000;3800,00;EUR;2026",
  "BTC;TransferWallet;;0,050000;3800,00;EUR;2026",
  "BTC;RRPT;0;0,000000;0,00;EUR;2026",
].join("\r\n") + "\r\n";
