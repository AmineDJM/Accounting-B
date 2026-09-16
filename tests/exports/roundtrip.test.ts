import { describe, it, expect } from "vitest";
import { XMLParser } from "fast-xml-parser";
import { D, ZERO } from "@/lib/engine/money";
import { zonedEndOfDay, zonedMidnight } from "@/lib/engine/tz";
import { exportSaftPt } from "@/lib/exports/saft";
import { exportXafNl } from "@/lib/exports/xaf";
import { exportDatev, toWindows1252 } from "@/lib/exports/datev";
import { exportGenericCsv } from "@/lib/exports/csv";
import type { AuditFileInput } from "@/lib/exports/types";
import type { JournalEntry } from "@/lib/engine/journal";

/**
 * A written file is only useful if it can be read back. These tests parse each
 * XML file and re-total the CSV ones, so a format change that produces a
 * well-formed but wrong file fails here rather than at the tax office.
 */
const d = (iso: string) => new Date(iso);
const entry = (num: string, date: string, lines: JournalEntry["lines"]): JournalEntry => ({
  journalCode: "CR1", journalLib: "Plateforme", seq: Number(num.slice(-1)), num,
  date: d(date), pieceRef: `P-${num}`, pieceDate: d(date), label: `Écriture ${num}`,
  lines, kind: "OPERATION", warnings: [],
});

const entries: JournalEntry[] = [
  entry("E1", "2026-03-15T10:00:00Z", [
    { account: "1300", accountLabel: "Jetons détenus", label: "Achat", debit: D("9000.00"), credit: ZERO },
    { account: "1800", accountLabel: "Banque", label: "Achat", debit: ZERO, credit: D("9000.00") },
  ]),
  entry("E2", "2026-07-02T10:00:00Z", [
    { account: "1800", accountLabel: "Banque", label: "Produit net", debit: D("2475.00"), credit: ZERO },
    { account: "6905", accountLabel: "Frais", label: "Commission", debit: D("25.00"), credit: ZERO },
    { account: "1300", accountLabel: "Jetons détenus", label: "Sortie", debit: ZERO, credit: D("2200.00") },
    { account: "4905", accountLabel: "Produits", label: "Résultat", debit: ZERO, credit: D("300.00") },
  ]),
];

const input: AuditFileInput = {
  entity: {
    name: "Société d'Exemple & Cie", legalId: "501234567", country: "PT", currency: "EUR",
    consultantNumber: "1234567", clientNumber: "54321", accountLength: 4,
    address: { street: "Rua da Prata", number: "10", city: "Lisboa", postalCode: "1100-052" },
  },
  timezone: "Europe/Lisbon",
  fiscalYear: { start: zonedMidnight(2026, 1, 1, "Europe/Lisbon"), end: zonedEndOfDay(2026, 12, 31, "Europe/Lisbon"), label: "2026" },
  entries,
  accounts: [
    { number: "1300", label: "Jetons détenus", closingDebit: D("6800.00") },
    { number: "1800", label: "Banque", closingDebit: D("13475.00") },
  ],
  generatedAt: d("2026-09-16T08:00:00Z"),
  software: { name: "Chainbook", version: "1.0" },
};

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@", parseTagValue: false });

describe("SAF-T (PT) reads back", () => {
  const out = exportSaftPt(input);
  const doc = parser.parse(out.content) as Record<string, Record<string, unknown>>;
  const file = doc.AuditFile;

  it("parses as XML with the header the schema requires", () => {
    const header = file.Header as Record<string, string>;
    expect(header.AuditFileVersion).toBe("1.04_01");
    expect(header.TaxRegistrationNumber).toBe("501234567");
    expect(header.StartDate).toBe("2026-01-01");
    expect(header.EndDate).toBe("2026-12-31");
  });

  it("escapes a company name containing an ampersand", () => {
    expect(out.content).toContain("Société d&apos;Exemple &amp; Cie".replace("&apos;", "'"));
    expect((file.Header as Record<string, string>).CompanyName).toBe("Société d'Exemple & Cie");
  });

  it("totals what it actually wrote", () => {
    const gl = file.GeneralLedgerEntries as Record<string, unknown>;
    const journals = Array.isArray(gl.Journal) ? gl.Journal : [gl.Journal];
    const transactions = journals.flatMap((j) => {
      const tx = (j as Record<string, unknown>).Transaction;
      return Array.isArray(tx) ? tx : [tx];
    });
    expect(Number(gl.NumberOfEntries)).toBe(transactions.length);
    const sum = (side: "Debit" | "Credit") =>
      transactions.reduce((acc, tx) => {
        const lines = (tx as Record<string, Record<string, unknown>>).Lines[`${side}Line`];
        const arr = Array.isArray(lines) ? lines : lines ? [lines] : [];
        return acc + arr.reduce((a, l) => a + Number((l as Record<string, string>)[`${side}Amount`]), 0);
      }, 0);
    expect(sum("Debit").toFixed(2)).toBe(Number(gl.TotalDebit).toFixed(2));
    expect(sum("Credit").toFixed(2)).toBe(Number(gl.TotalCredit).toFixed(2));
    expect(sum("Debit")).toBe(sum("Credit"));
  });

  it("puts the fiscal year's last day in the header, not the next year's first", () => {
    // An end-of-day instant rendered in the wrong zone lands on 1 January.
    expect((file.Header as Record<string, string>).EndDate.startsWith("2026")).toBe(true);
  });
});

describe("XAF reads back", () => {
  const out = exportXafNl({ ...input, entity: { ...input.entity, country: "NL", legalId: "12345678" }, timezone: "Europe/Amsterdam" });
  const doc = parser.parse(out.content) as Record<string, Record<string, unknown>>;
  const file = doc.auditfile;

  it("declares the namespace and the period", () => {
    expect(out.content).toContain('xmlns="http://www.auditfiles.nl/XAF/3.2"');
    const header = file.header as Record<string, string>;
    expect(header.fiscalYear).toBe("2026");
    expect(header.startDate).toBe("2026-01-01");
  });

  it("counts every line it wrote and balances", () => {
    const tr = (file.company as Record<string, Record<string, unknown>>).transactions;
    expect(Number(tr.linesCount)).toBe(entries.reduce((a, e) => a + e.lines.length, 0));
    expect(Number(tr.totalDebit)).toBe(Number(tr.totalCredit));
    expect(out.stats.debit.toFixed(2)).toBe(Number(tr.totalDebit).toFixed(2));
  });
});

describe("DATEV reads back", () => {
  // A German file, with its period built on the German calendar.
  const germanInput: AuditFileInput = {
    ...input,
    entity: { ...input.entity, country: "DE" },
    timezone: "Europe/Berlin",
    fiscalYear: { start: zonedMidnight(2026, 1, 1, "Europe/Berlin"), end: zonedEndOfDay(2026, 12, 31, "Europe/Berlin"), label: "2026" },
  };
  const out = exportDatev(germanInput);
  const rows = out.content.trimEnd().split("\r\n");

  it("writes a header, a column row, and one booking line per pairing", () => {
    expect(rows[0].startsWith('"EXTF"')).toBe(true);
    const columns = rows[1].split(";").length;
    for (const r of rows.slice(2)) expect(r.split(";").length, r.slice(0, 40)).toBe(columns);
  });

  /**
   * A DATEV booking carries both sides on one row: the amount, a marker saying
   * which side `Konto` is on, and the contra account. Totalling the two markers
   * across the file therefore proves nothing — a two-line entry contributes a
   * single row. What must balance is each entry's own rows.
   */
  const bookings = rows.slice(2).map((r) => {
    const cells = r.split(";");
    return {
      amount: Number(cells[0].replace(",", ".")),
      sign: cells[1].replace(/"/g, ""),
      account: cells[6].replace(/"/g, ""),
      contra: cells[7].replace(/"/g, ""),
      piece: cells[10].replace(/"/g, ""),
    };
  });

  it("maps a two-line entry to a single booking against its contra account", () => {
    const simple = bookings.filter((b) => b.piece === "P-E1");
    expect(simple.length).toBe(1);
    expect(simple[0]).toMatchObject({ amount: 9000, sign: "S", account: "1300", contra: "1800" });
  });

  it("balances a compound entry across the clearing account it had to use", () => {
    const compound = bookings.filter((b) => b.piece === "P-E2");
    expect(compound.length).toBe(4);
    expect(compound.every((b) => b.contra === "1590")).toBe(true);
    const debit = compound.filter((b) => b.sign === "S").reduce((a, b) => a + b.amount, 0);
    const credit = compound.filter((b) => b.sign === "H").reduce((a, b) => a + b.amount, 0);
    expect(debit.toFixed(2)).toBe(credit.toFixed(2));
    expect(out.warnings.some((w) => w.includes("E2"))).toBe(true);
  });

  it("declares the period on the calendar that built it", () => {
    expect(rows[0]).toContain(";20260101;20261231;");
    expect(out.warnings.some((w) => w.includes("fuseau"))).toBe(false);
  });

  it("warns when the period was built on another calendar", () => {
    // The Lisbon year-end read on the German calendar falls on 1 January, and
    // the whole file would declare the following year.
    const mismatched = exportDatev({ ...input, entity: { ...input.entity, country: "DE" }, timezone: "Europe/Berlin" });
    expect(mismatched.warnings.some((w) => w.includes("fuseau"))).toBe(true);
  });

  it("round-trips an accented label through Windows-1252", () => {
    const accented = exportDatev({
      ...germanInput,
      entries: [
        entry("E3", "2026-05-04T10:00:00Z", [
          { account: "1300", accountLabel: "Jetons", label: "Veräußerung — écart", debit: D("100.00"), credit: ZERO },
          { account: "1800", accountLabel: "Banque", label: "Veräußerung — écart", debit: ZERO, credit: D("100.00") },
        ]),
      ],
    });
    const back = Buffer.from(toWindows1252(accented.content)).toString("latin1");
    expect(back).toContain("Veräußerung");
    // The em dash sits at 0x97 in Windows-1252 and nowhere in Latin-1, which
    // is the whole reason the encoder exists.
    expect(toWindows1252("—")[0]).toBe(0x97);
  });
});

describe("generic ledger reads back", () => {
  const out = exportGenericCsv(input);
  it("totals to the same figures as the entries", () => {
    const rows = out.content.replace("﻿", "").trimEnd().split("\r\n").slice(1);
    const debit = rows.reduce((a, r) => a + Number(r.split(";")[12]), 0);
    const credit = rows.reduce((a, r) => a + Number(r.split(";")[13]), 0);
    expect(debit.toFixed(2)).toBe(out.stats.debit.toFixed(2));
    expect(debit.toFixed(2)).toBe(credit.toFixed(2));
  });
});
