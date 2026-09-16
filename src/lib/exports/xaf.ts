import { cents, ZERO, type Decimal } from "@/lib/engine/money";
import { zonedParts } from "@/lib/engine/tz";
import type { AuditFileInput, AuditFileOutput } from "./types";

/**
 * XML Auditfile Financieel (XAF) 3.2.
 *
 * The Dutch audit file is not filed with a return: the Belastingdienst asks for
 * it during an audit, and every Dutch bookkeeping package can read and write
 * it. It is also the format a Dutch accountant will ask for when taking over a
 * file, which is the reason it is offered here.
 *
 * Structure: one `header`, one `company` carrying the chart of accounts, then
 * the transactions grouped by journal. Amounts are unsigned with a `D` or `C`
 * marker, in the same way as DATEV, but each transaction keeps all its lines.
 */

const esc = (s: string | undefined): string =>
  (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/[\r\n\t]+/g, " ").trim();

const money = (d: Decimal): string => cents(d).abs().toFixed(2);

const pad2 = (n: number) => String(n).padStart(2, "0");

const isoDate = (d: Date, tz: string): string => {
  const p = zonedParts(d, tz);
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
};

/**
 * XAF journal types: M memoriaal, B bank, K kas, I inkoop, Z verkoop,
 * P inkoopboek, O opening, Y overige. Crypto entries are memorial entries
 * unless the journal is plainly a bank or a sales journal.
 */
function journalType(code: string, lib: string): string {
  const s = `${code} ${lib}`.toLowerCase();
  if (/banq|bank|bnk|512/.test(s)) return "B";
  if (/caisse|kas|cash/.test(s)) return "K";
  if (/vente|verkoop|sales|client/.test(s)) return "Z";
  if (/achat|inkoop|purchase|fourniss/.test(s)) return "I";
  if (/nouveau|opening|a-nouveau|à-nouveau/.test(s)) return "O";
  return "M";
}

export function exportXafNl(input: AuditFileInput): AuditFileOutput {
  const tz = input.timezone ?? "Europe/Amsterdam";
  const now = input.generatedAt ?? new Date();
  const e = input.entity;
  const warnings: string[] = [];
  const notes: string[] = [];
  const fyLabel = input.fiscalYear.label ?? isoDate(input.fiscalYear.start, tz).slice(0, 4);

  if (!e.legalId) warnings.push("Numéro d'identification de l'entité absent : renseignez le numéro KvK ou le numéro fiscal (fiscaalnummer) avant de transmettre le fichier.");

  const accounts = input.accounts ?? [];
  const accountXml = accounts.map((a) => [
    "                <ledgerAccount>",
    `                    <accID>${esc(a.number)}</accID>`,
    `                    <accDesc>${esc(a.label)}</accDesc>`,
    `                    <accTp>${a.accountType ?? (/^[1-5]/.test(a.number) ? "B" : "P")}</accTp>`,
    "                </ledgerAccount>",
  ].join("\n")).join("\n");

  const byJournal = new Map<string, { lib: string; entries: typeof input.entries }>();
  for (const entry of input.entries) {
    const j = byJournal.get(entry.journalCode) ?? { lib: entry.journalLib, entries: [] };
    j.entries.push(entry);
    byJournal.set(entry.journalCode, j);
  }

  let totalDebit = ZERO;
  let totalCredit = ZERO;
  let lineCount = 0;
  let entryCount = 0;
  const journalXml: string[] = [];

  for (const [code, j] of [...byJournal.entries()].sort()) {
    const transactions: string[] = [];
    for (const entry of j.entries) {
      entryCount += 1;
      const debitTotal = entry.lines.reduce((a, l) => a.plus(cents(l.debit)), ZERO);
      let nr = 0;
      const lineXml = entry.lines.map((l) => {
        nr += 1;
        lineCount += 1;
        const isDebit = l.debit.gt(0);
        const amount = isDebit ? l.debit : l.credit;
        if (isDebit) totalDebit = totalDebit.plus(cents(amount));
        else totalCredit = totalCredit.plus(cents(amount));
        return [
          "                        <trLine>",
          `                            <nr>${nr}</nr>`,
          `                            <accID>${esc(l.account)}</accID>`,
          `                            <docRef>${esc(entry.pieceRef || entry.num)}</docRef>`,
          `                            <effDate>${isoDate(entry.date, tz)}</effDate>`,
          `                            <desc>${esc(l.label).slice(0, 200)}</desc>`,
          `                            <amnt>${money(amount)}</amnt>`,
          `                            <amntTp>${isDebit ? "D" : "C"}</amntTp>`,
          "                        </trLine>",
        ].join("\n");
      });
      transactions.push([
        "                    <transaction>",
        `                        <nr>${esc(entry.num)}</nr>`,
        `                        <desc>${esc(entry.label).slice(0, 200)}</desc>`,
        `                        <periodNumber>${Number(isoDate(entry.date, tz).slice(5, 7))}</periodNumber>`,
        `                        <trDt>${isoDate(entry.date, tz)}</trDt>`,
        `                        <amnt>${money(debitTotal)}</amnt>`,
        "                        <amntTp>D</amntTp>",
        ...lineXml,
        "                    </transaction>",
      ].join("\n"));
    }
    journalXml.push([
      "                <journal>",
      `                    <jrnID>${esc(code)}</jrnID>`,
      `                    <desc>${esc(j.lib)}</desc>`,
      `                    <jrnTp>${journalType(code, j.lib)}</jrnTp>`,
      ...transactions,
      "                </journal>",
    ].join("\n"));
  }

  const addr = e.address ?? {};
  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<auditfile xmlns="http://www.auditfiles.nl/XAF/3.2">',
    "    <header>",
    `        <fiscalYear>${esc(fyLabel)}</fiscalYear>`,
    `        <startDate>${isoDate(input.fiscalYear.start, tz)}</startDate>`,
    `        <endDate>${isoDate(input.fiscalYear.end, tz)}</endDate>`,
    `        <curCode>${esc(e.currency || "EUR")}</curCode>`,
    `        <dateCreated>${isoDate(now, tz)}</dateCreated>`,
    `        <softwareDesc>${esc(input.software?.name ?? "CryptoLedger")}</softwareDesc>`,
    `        <softwareVersion>${esc(input.software?.version ?? "1.0")}</softwareVersion>`,
    "    </header>",
    "    <company>",
    `        <companyIdent>${esc(e.legalId ?? e.name.slice(0, 20))}</companyIdent>`,
    `        <companyName>${esc(e.name)}</companyName>`,
    "        <taxRegistrationCountry>NL</taxRegistrationCountry>",
    `        <taxRegIdent>${esc(e.vatId ?? e.legalId ?? "")}</taxRegIdent>`,
    "        <streetAddress>",
    `            <streetname>${esc(addr.street ?? "Onbekend")}</streetname>`,
    ...(addr.number ? [`            <number>${esc(addr.number)}</number>`] : []),
    `            <city>${esc(addr.city ?? "Onbekend")}</city>`,
    `            <postalCode>${esc(addr.postalCode ?? "")}</postalCode>`,
    "            <country>NL</country>",
    "        </streetAddress>",
    "        <generalLedger>",
    accountXml,
    "        </generalLedger>",
    "        <transactions>",
    `            <linesCount>${lineCount}</linesCount>`,
    `            <totalDebit>${money(totalDebit)}</totalDebit>`,
    `            <totalCredit>${money(totalCredit)}</totalCredit>`,
    ...journalXml,
    "        </transactions>",
    "    </company>",
    "</auditfile>",
  ].filter((l) => l !== "").join("\n") + "\n";

  if (!totalDebit.eq(totalCredit)) {
    warnings.push(`Le fichier n'est pas équilibré : ${money(totalDebit)} au débit contre ${money(totalCredit)} au crédit.`);
  }
  if (!accounts.length) warnings.push("Aucun compte fourni : la section generalLedger serait vide et le fichier serait rejeté à la validation.");

  notes.push("Le XAF n'est pas déposé avec une déclaration : il est produit sur demande lors d'un contrôle, et c'est aussi le format qu'un confrère néerlandais demandera lors d'une reprise de dossier.");
  notes.push("Les crypto-actifs d'un particulier relèvent de la case 3 et ne passent pas par ce fichier : le XAF ne concerne que la comptabilité d'une entreprise.");
  notes.push("Validez le fichier contre le schéma officiel publié sur auditfiles.nl avant de le remettre : la version attendue par le contrôleur peut être la 3.2.");

  return {
    format: "XAF_NL",
    fileName: `XAF_${(e.legalId ?? "entity").replace(/\W/g, "")}_${fyLabel}.xml`,
    content: xml,
    encoding: "utf-8",
    mimeType: "application/xml",
    warnings,
    notes,
    stats: { entries: entryCount, lines: lineCount, debit: totalDebit, credit: totalCredit },
  };
}
