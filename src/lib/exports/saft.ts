import { cents, ZERO, type Decimal } from "@/lib/engine/money";
import { zonedParts } from "@/lib/engine/tz";
import { checkPeriod } from "./period";
import type { AuditFileInput, AuditFileOutput } from "./types";

/**
 * SAF-T (PT) 1.04_01 — Standard Audit File for Tax Purposes, Portuguese version.
 *
 * Portaria n.º 302/2016 sets the structure; the namespace is
 * `urn:OECD:StandardAuditFile-Tax:PT_1.04_01` and the file is Windows-1252.
 * Only the accounting part is produced here (`TaxAccountingBasis` = C):
 * header, chart of accounts with opening and closing balances, and the general
 * ledger entries. The invoicing part is out of scope — an entity that invoices
 * produces it from its billing software, certified under article 123 CIRC.
 *
 * One quirk of the published schema is worth knowing before filing. `Lines` is
 * declared as an `xs:all` containing exactly one `DebitLine` and one
 * `CreditLine`, so a compound entry does not validate against the XSD as
 * published, although the tax authority's own validator accepts repeated lines
 * and every real file contains them. The exporter writes the repeated lines and
 * reports the discrepancy rather than mutilating the entries.
 */

const esc = (s: string | undefined): string =>
  (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/[\r\n\t]+/g, " ").trim();

const money = (d: Decimal): string => cents(d).toFixed(2);

const pad2 = (n: number) => String(n).padStart(2, "0");

const isoDate = (d: Date, tz: string): string => {
  const p = zonedParts(d, tz);
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
};

const isoDateTime = (d: Date): string => d.toISOString().replace(/\.\d{3}Z$/, "");

/** SAF-T period: 1 to 12 for the months, 13 to 16 for the closing entries. */
const periodOf = (d: Date, tz: string): number => Number(isoDate(d, tz).slice(5, 7));

export function exportSaftPt(input: AuditFileInput): AuditFileOutput {
  const tz = input.timezone ?? "Europe/Lisbon";
  const now = input.generatedAt ?? new Date();
  const e = input.entity;
  const warnings: string[] = [];
  const notes: string[] = [];
  const fyLabel = input.fiscalYear.label ?? isoDate(input.fiscalYear.start, tz).slice(0, 4);

  const nif = (e.legalId ?? "").replace(/\D/g, "");
  if (nif.length !== 9) warnings.push("Le NIF portugais (TaxRegistrationNumber) doit comporter neuf chiffres. Renseignez-le dans la fiche du dossier : le fichier sera rejeté sans lui.");
  if (!e.address?.postalCode) warnings.push("Adresse incomplète : le code postal portugais (formato 0000-000) est obligatoire dans CompanyAddress.");

  // --- master files ------------------------------------------------------
  const accounts = input.accounts ?? [];
  if (!accounts.length) warnings.push("Aucun plan de comptes fourni : la section GeneralLedgerAccounts serait vide, ce que le schéma interdit. Ajoutez les comptes et leurs soldes d'ouverture et de clôture.");

  const accountXml = accounts.map((a) => [
    "                <Account>",
    `                    <AccountID>${esc(a.number)}</AccountID>`,
    `                    <AccountDescription>${esc(a.label)}</AccountDescription>`,
    `                    <OpeningDebitBalance>${money(a.openingDebit ?? ZERO)}</OpeningDebitBalance>`,
    `                    <OpeningCreditBalance>${money(a.openingCredit ?? ZERO)}</OpeningCreditBalance>`,
    `                    <ClosingDebitBalance>${money(a.closingDebit ?? ZERO)}</ClosingDebitBalance>`,
    `                    <ClosingCreditBalance>${money(a.closingCredit ?? ZERO)}</ClosingCreditBalance>`,
    `                    <GroupingCategory>${esc(a.groupingCategory ?? "GM")}</GroupingCategory>`,
    ...(a.groupingCode ? [`                    <GroupingCode>${esc(a.groupingCode)}</GroupingCode>`] : []),
    "                </Account>",
  ].join("\n")).join("\n");

  // --- general ledger ----------------------------------------------------
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
      const debits = entry.lines.filter((l) => l.debit.gt(0));
      const credits = entry.lines.filter((l) => l.credit.gt(0));
      let record = 0;
      const lineXml = (side: "Debit" | "Credit", account: string, label: string, amount: Decimal) => {
        record += 1;
        lineCount += 1;
        if (side === "Debit") totalDebit = totalDebit.plus(cents(amount));
        else totalCredit = totalCredit.plus(cents(amount));
        return [
          `                            <${side}Line>`,
          `                                <RecordID>${entry.num}-${record}</RecordID>`,
          `                                <AccountID>${esc(account)}</AccountID>`,
          `                                <SystemEntryDate>${isoDateTime(entry.date)}</SystemEntryDate>`,
          `                                <Description>${esc(label).slice(0, 200)}</Description>`,
          `                                <${side}Amount>${money(amount)}</${side}Amount>`,
          `                            </${side}Line>`,
        ].join("\n");
      };
      transactions.push([
        "                    <Transaction>",
        `                        <TransactionID>${isoDate(entry.date, tz)} ${esc(code)} ${esc(entry.num)}</TransactionID>`,
        `                        <Period>${periodOf(entry.date, tz)}</Period>`,
        `                        <TransactionDate>${isoDate(entry.date, tz)}</TransactionDate>`,
        `                        <SourceID>${esc(input.software?.name ?? "CryptoLedger")}</SourceID>`,
        `                        <Description>${esc(entry.label).slice(0, 200)}</Description>`,
        `                        <DocArchivalNumber>${esc(entry.pieceRef || entry.num)}</DocArchivalNumber>`,
        // N for a normal entry, A for the profit-and-loss closing entries.
        `                        <TransactionType>${entry.kind === "INVENTORY" || entry.kind === "REVERSAL" ? "A" : entry.kind === "ADJUSTMENT" ? "J" : "N"}</TransactionType>`,
        `                        <GLPostingDate>${isoDate(entry.date, tz)}</GLPostingDate>`,
        "                        <Lines>",
        ...debits.map((l) => lineXml("Debit", l.account, l.label, l.debit)),
        ...credits.map((l) => lineXml("Credit", l.account, l.label, l.credit)),
        "                        </Lines>",
        "                    </Transaction>",
      ].join("\n"));
    }
    journalXml.push([
      "                <Journal>",
      `                    <JournalID>${esc(code)}</JournalID>`,
      `                    <Description>${esc(j.lib)}</Description>`,
      ...transactions,
      "                </Journal>",
    ].join("\n"));
  }

  const addr = e.address ?? {};
  const xml = [
    '<?xml version="1.0" encoding="windows-1252"?>',
    '<AuditFile xmlns="urn:OECD:StandardAuditFile-Tax:PT_1.04_01" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">',
    "    <Header>",
    "        <AuditFileVersion>1.04_01</AuditFileVersion>",
    `        <CompanyID>${esc(nif)}</CompanyID>`,
    `        <TaxRegistrationNumber>${esc(nif)}</TaxRegistrationNumber>`,
    "        <TaxAccountingBasis>C</TaxAccountingBasis>",
    `        <CompanyName>${esc(e.name)}</CompanyName>`,
    "        <CompanyAddress>",
    ...(addr.number ? [`            <BuildingNumber>${esc(addr.number)}</BuildingNumber>`] : []),
    ...(addr.street ? [`            <StreetName>${esc(addr.street)}</StreetName>`] : []),
    `            <AddressDetail>${esc(addr.detail ?? ([addr.street, addr.number].filter(Boolean).join(" ") || "Desconhecido"))}</AddressDetail>`,
    `            <City>${esc(addr.city ?? "Desconhecido")}</City>`,
    `            <PostalCode>${esc(addr.postalCode ?? "0000-000")}</PostalCode>`,
    "            <Country>PT</Country>",
    "        </CompanyAddress>",
    `        <FiscalYear>${esc(fyLabel)}</FiscalYear>`,
    `        <StartDate>${isoDate(input.fiscalYear.start, tz)}</StartDate>`,
    `        <EndDate>${isoDate(input.fiscalYear.end, tz)}</EndDate>`,
    "        <CurrencyCode>EUR</CurrencyCode>",
    `        <DateCreated>${isoDate(now, tz)}</DateCreated>`,
    "        <TaxEntity>Global</TaxEntity>",
    `        <ProductCompanyTaxID>${esc(input.software?.producerVatId ?? "999999990")}</ProductCompanyTaxID>`,
    `        <SoftwareCertificateNumber>${esc(input.software?.certificate ?? "0")}</SoftwareCertificateNumber>`,
    `        <ProductID>${esc(input.software?.name ?? "CryptoLedger")}/${esc(input.software?.name ?? "CryptoLedger")}</ProductID>`,
    `        <ProductVersion>${esc(input.software?.version ?? "1.0")}</ProductVersion>`,
    ...(input.comment ? [`        <HeaderComment>${esc(input.comment).slice(0, 255)}</HeaderComment>`] : []),
    "    </Header>",
    "    <MasterFiles>",
    "        <GeneralLedgerAccounts>",
    "            <TaxonomyReference>S</TaxonomyReference>",
    accountXml,
    "        </GeneralLedgerAccounts>",
    "    </MasterFiles>",
    "    <GeneralLedgerEntries>",
    `        <NumberOfEntries>${entryCount}</NumberOfEntries>`,
    `        <TotalDebit>${money(totalDebit)}</TotalDebit>`,
    `        <TotalCredit>${money(totalCredit)}</TotalCredit>`,
    ...journalXml,
    "    </GeneralLedgerEntries>",
    "</AuditFile>",
  ].filter((l) => l !== "").join("\n") + "\n";

  warnings.push(...checkPeriod(input.fiscalYear.start, input.fiscalYear.end, tz));
  if (!totalDebit.eq(totalCredit)) {
    warnings.push(`Le fichier n'est pas équilibré : ${money(totalDebit)} au débit contre ${money(totalCredit)} au crédit. Corrigez les écritures avant transmission.`);
  }

  notes.push("Seule la partie comptable est produite (TaxAccountingBasis = C). Une entité qui facture produit la partie facturation depuis son logiciel certifié au sens de l'article 123.º du CIRC.");
  notes.push("Le certificat logiciel et le NIF du producteur sont des valeurs de remplacement tant que l'application n'est pas certifiée par l'Autoridade Tributária. Un fichier destiné à un dépôt officiel doit porter un numéro de certificat réel.");
  notes.push("Le schéma publié en 1.04_01 déclare Lines comme un xs:all d'un seul DebitLine et d'un seul CreditLine. Les écritures composées sont écrites avec des lignes répétées, comme dans tout fichier réel, mais une validation stricte contre ce XSD les signalera.");
  notes.push("La taxonomie retenue est S (SNC de base). Une micro-entité doit basculer sur M et une entité aux normes internationales sur N, ce qui change aussi les codes de regroupement des comptes.");

  return {
    format: "SAFT_PT",
    fileName: `SAFT_${nif || "NIF"}_${fyLabel}.xml`,
    content: xml,
    encoding: "windows-1252",
    mimeType: "application/xml",
    warnings,
    notes,
    stats: { entries: entryCount, lines: lineCount, debit: totalDebit, credit: totalCredit },
  };
}
