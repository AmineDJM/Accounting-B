import { describe, it, expect } from "vitest";
import { D, ZERO } from "@/lib/engine/money";
import type { JournalEntry } from "@/lib/engine/journal";
import { exportDatev, toWindows1252 } from "@/lib/exports/datev";
import { exportSaftPt } from "@/lib/exports/saft";
import { exportXafNl } from "@/lib/exports/xaf";
import { exportGenericCsv } from "@/lib/exports/csv";
import { zonedEndOfDay, zonedMidnight } from "@/lib/engine/tz";
import type { AuditFileInput } from "@/lib/exports/types";

const d = (iso: string) => new Date(iso);

const entry = (over: Partial<JournalEntry>): JournalEntry => ({
  journalCode: "BIN", journalLib: "Binance", seq: 1, num: "BIN000001",
  date: d("2026-03-15T10:00:00Z"), pieceRef: "T1", pieceDate: d("2026-03-15T10:00:00Z"),
  label: "Achat 0,1 BTC", lines: [], kind: "OPERATION", warnings: [], ...over,
});

const simple = entry({
  lines: [
    { account: "1300", accountLabel: "Jetons détenus", label: "Achat 0,1 BTC", debit: D("9000.00"), credit: ZERO },
    { account: "1800", accountLabel: "Banque", label: "Achat 0,1 BTC", debit: ZERO, credit: D("9000.00") },
  ],
});

const compound = entry({
  num: "BIN000002", seq: 2, date: d("2026-04-02T10:00:00Z"), label: "Vente 1 ETH",
  lines: [
    { account: "1800", accountLabel: "Banque", label: "Produit net", debit: D("2475.00"), credit: ZERO },
    { account: "6905", accountLabel: "Frais", label: "Commission", debit: D("25.00"), credit: ZERO },
    { account: "1300", accountLabel: "Jetons détenus", label: "Sortie 1 ETH", debit: ZERO, credit: D("2200.00") },
    { account: "4905", accountLabel: "Produits sur cessions", label: "Résultat de cession", debit: ZERO, credit: D("300.00") },
  ],
});

const input: AuditFileInput = {
  entity: {
    name: "Beispiel GmbH", legalId: "512345678", vatId: "DE123456789", country: "DE", currency: "EUR",
    consultantNumber: "1234567", clientNumber: "54321", accountLength: 4,
    address: { street: "Hauptstraße", number: "1", city: "Berlin", postalCode: "10115" },
  },
  timezone: "Europe/Berlin",
  fiscalYear: { start: zonedMidnight(2026, 1, 1, "Europe/Berlin"), end: zonedEndOfDay(2026, 12, 31, "Europe/Berlin"), label: "2026" },
  entries: [simple, compound],
  accounts: [
    { number: "1300", label: "Jetons détenus", openingDebit: ZERO, closingDebit: D("6800.00"), accountType: "B" },
    { number: "1800", label: "Banque", openingDebit: D("20000.00"), closingDebit: D("13475.00"), accountType: "B" },
  ],
  generatedAt: d("2026-09-16T08:00:00Z"),
  software: { name: "CryptoLedger", version: "1.0" },
};

describe("DATEV EXTF Buchungsstapel", () => {
  const out = exportDatev(input);
  const rows = out.content.split("\r\n");

  it("writes the EXTF header for format 700 / Buchungsstapel 13", () => {
    expect(rows[0].startsWith('"EXTF";700;21;"Buchungsstapel";13;')).toBe(true);
    expect(rows[0]).toContain(";1234567;54321;20260101;4;20260101;20261231;");
  });

  it("names the columns in the order DATEV expects", () => {
    expect(rows[1].startsWith('"Umsatz (ohne Soll/Haben-Kz)";"Soll/Haben-Kennzeichen";"WKZ Umsatz"')).toBe(true);
  });

  it("writes an unsigned amount with a debit marker and a TTMM document date", () => {
    const line = rows.find((r) => r.startsWith("9000,00"));
    expect(line).toBeDefined();
    expect(line!).toContain('"S";"EUR"');
    expect(line!).toContain('"1300";"1800"');
    expect(line!).toContain(";1503;"); // 15 March
  });

  it("decomposes a compound entry without inventing a clearing account", () => {
    // The file ends with a line break, so the split leaves a trailing blank.
    const cells = rows.slice(2).filter((r) => r.trim() !== "").map((r) => r.split(";"));
    expect(cells.length).toBeGreaterThan(1);
    expect(cells.every((c) => c[7].replace(/"/g, "") !== "1590")).toBe(true);
    expect(out.warnings.some((w) => w.includes("BIN000002"))).toBe(false);

    // Every account ends with the movement the original entries gave it.
    const net = new Map<string, number>();
    for (const c of cells) {
      const amount = Number(c[0].replace(",", "."));
      const signed = c[1].replace(/"/g, "") === "S" ? amount : -amount;
      const account = c[6].replace(/"/g, "");
      const contra = c[7].replace(/"/g, "");
      net.set(account, (net.get(account) ?? 0) + signed);
      net.set(contra, (net.get(contra) ?? 0) - signed);
    }
    expect(net.get("1300")).toBeCloseTo(9000 - 2200, 2);
    expect(net.get("1800")).toBeCloseTo(-9000 + 2475, 2);
    expect(net.get("6905")).toBeCloseTo(25, 2);
    expect(net.get("4905")).toBeCloseTo(-300, 2);
    expect([...net.values()].reduce((a, b) => a + b, 0)).toBeCloseTo(0, 2);
  });

  it("encodes the euro sign as Windows-1252 and not as Latin-1", () => {
    expect(toWindows1252("€")[0]).toBe(0x80);
    expect(toWindows1252("ä")[0]).toBe(0xe4);
  });
});

describe("SAF-T (PT)", () => {
  const out = exportSaftPt({ ...input, entity: { ...input.entity, country: "PT", legalId: "501234567" } });

  it("declares the 1.04_01 namespace and the accounting basis", () => {
    expect(out.content).toContain('xmlns="urn:OECD:StandardAuditFile-Tax:PT_1.04_01"');
    expect(out.content).toContain("<AuditFileVersion>1.04_01</AuditFileVersion>");
    expect(out.content).toContain("<TaxAccountingBasis>C</TaxAccountingBasis>");
  });

  it("balances and totals the ledger", () => {
    expect(out.content).toContain("<NumberOfEntries>2</NumberOfEntries>");
    expect(out.content).toContain("<TotalDebit>11500.00</TotalDebit>");
    expect(out.content).toContain("<TotalCredit>11500.00</TotalCredit>");
    expect(out.warnings).toEqual([]);
  });

  it("writes every line of a compound entry", () => {
    expect((out.content.match(/<DebitLine>/g) ?? []).length).toBe(3);
    expect((out.content.match(/<CreditLine>/g) ?? []).length).toBe(3);
  });

  it("refuses a NIF that is not nine digits", () => {
    const bad = exportSaftPt({ ...input, entity: { ...input.entity, country: "PT", legalId: "123" } });
    expect(bad.warnings.some((w) => w.includes("neuf chiffres"))).toBe(true);
  });
});

describe("XAF 3.2", () => {
  const out = exportXafNl({ ...input, entity: { ...input.entity, country: "NL", legalId: "12345678" } });

  it("declares the 3.2 namespace and the fiscal year", () => {
    expect(out.content).toContain('xmlns="http://www.auditfiles.nl/XAF/3.2"');
    expect(out.content).toContain("<fiscalYear>2026</fiscalYear>");
  });

  it("marks each line with a debit or credit indicator", () => {
    expect(out.content).toContain("<amntTp>D</amntTp>");
    expect(out.content).toContain("<amntTp>C</amntTp>");
    expect(out.content).toContain("<linesCount>6</linesCount>");
  });

  it("balances", () => {
    expect(out.stats.debit.toFixed(2)).toBe(out.stats.credit.toFixed(2));
    expect(out.warnings).toEqual([]);
  });
});

describe("generic ledger", () => {
  const out = exportGenericCsv(input);
  it("writes one row per line with a byte-order mark", () => {
    expect(out.content.startsWith("﻿")).toBe(true);
    expect(out.content.trimEnd().split("\r\n").length).toBe(7);
  });
});
