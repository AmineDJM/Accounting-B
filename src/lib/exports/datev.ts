import { cents, Decimal, ZERO } from "@/lib/engine/money";
import type { JournalEntry, JournalLine } from "@/lib/engine/journal";
import { zonedParts } from "@/lib/engine/tz";
import { checkPeriod } from "./period";
import type { AuditFileInput, AuditFileOutput } from "./types";

/**
 * DATEV-Format "Buchungsstapel", Formatversion 13, Versionsnummer 700.
 *
 * DATEV is not an audit file in the French sense: it is the interchange format
 * a German or Austrian practice uses to pull a client's bookings into DATEV
 * Rechnungswesen (or into BMD and RZL, which both read it). Two conventions
 * decide whether the file imports at all:
 *
 *  - a booking is a **single line** linking one account to one contra account,
 *    with an unsigned amount and a debit/credit marker on the first account,
 *    so a multi-line entry has to be decomposed;
 *  - the document date is `TTMM` — day and month only. The year comes from the
 *    financial year declared in the header, which is why an entry outside the
 *    declared year silently books into the wrong one. The exporter refuses to
 *    write such a line and says so.
 *
 * The file is written in Windows-1252, CRLF, semicolon-separated, text fields
 * in double quotes, decimal comma.
 */

const HEADER_FIELDS = [
  "Umsatz (ohne Soll/Haben-Kz)", "Soll/Haben-Kennzeichen", "WKZ Umsatz", "Kurs", "Basis-Umsatz", "WKZ Basis-Umsatz",
  "Konto", "Gegenkonto (ohne BU-Schlüssel)", "BU-Schlüssel", "Belegdatum", "Belegfeld 1", "Belegfeld 2", "Skonto",
  "Buchungstext", "Postensperre", "Diverse Adressnummer", "Geschäftspartnerbank", "Sachverhalt", "Zinssperre",
  "Beleglink", "Beleginfo - Art 1", "Beleginfo - Inhalt 1", "Beleginfo - Art 2", "Beleginfo - Inhalt 2",
  "Beleginfo - Art 3", "Beleginfo - Inhalt 3", "Beleginfo - Art 4", "Beleginfo - Inhalt 4",
  "Beleginfo - Art 5", "Beleginfo - Inhalt 5", "Beleginfo - Art 6", "Beleginfo - Inhalt 6",
  "Beleginfo - Art 7", "Beleginfo - Inhalt 7", "Beleginfo - Art 8", "Beleginfo - Inhalt 8",
  "KOST1 - Kostenstelle", "KOST2 - Kostenstelle", "KOST-Menge", "EU-Land u. UStID (Bestimmung)", "EU-Steuersatz (Bestimmung)",
] as const;

const COLUMNS = HEADER_FIELDS.length;

/** DATEV expects text in quotes, numbers bare; embedded quotes are doubled. */
const q = (s: string): string => `"${s.replace(/"/g, '""').replace(/[\r\n;]+/g, " ").trim()}"`;
const amount = (d: Decimal): string => cents(d).abs().toFixed(2).replace(".", ",");
const pad = (n: number, w: number) => String(n).padStart(w, "0");

const ttmm = (d: Date, tz: string): string => {
  const p = zonedParts(d, tz);
  return `${pad(p.day, 2)}${pad(p.month, 2)}`;
};

const yyyymmdd = (d: Date, tz: string): string => {
  const p = zonedParts(d, tz);
  return `${p.year}${pad(p.month, 2)}${pad(p.day, 2)}`;
};

const stamp = (d: Date): string =>
  `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1, 2)}${pad(d.getUTCDate(), 2)}${pad(d.getUTCHours(), 2)}${pad(d.getUTCMinutes(), 2)}${pad(d.getUTCSeconds(), 2)}${pad(d.getUTCMilliseconds(), 3)}`;

/** One DATEV booking: an amount, a marker, an account and a contra account. */
interface Booking {
  amount: Decimal;
  sign: "S" | "H";
  account: string;
  contra: string;
  date: Date;
  documentField1: string;
  text: string;
  currency: string;
  currencyAmount?: Decimal;
}

/**
 * Turns an n-line entry into DATEV bookings.
 *
 * DATEV has no concept of a compound entry: a booking is one amount, one
 * account, one contra account. A two-line entry maps straight across, and a
 * "one against many" entry pivots on the single line.
 *
 * An entry with several lines on both sides — which a swap booking tokens in,
 * tokens out, a fee and a result routinely is — has no single-line
 * representation. Rather than route every line through a clearing account,
 * which produces an import a practice has to unpick by hand, the two sides are
 * walked together and each step books the smaller of the two remaining
 * amounts. That splits at most one line in two and preserves every account's
 * net movement exactly, which is the property that matters: the trial balance
 * after import is identical to the one before.
 */
function toBookings(entry: JournalEntry, clearing: string, warnings: string[]): Booking[] {
  const debits = entry.lines.filter((l) => l.debit.gt(0));
  const credits = entry.lines.filter((l) => l.credit.gt(0));
  const make = (line: JournalLine, contra: string, sign: "S" | "H", amount: Decimal): Booking => ({
    amount,
    sign,
    account: line.account,
    contra,
    date: entry.date,
    documentField1: entry.pieceRef || entry.num,
    text: line.label || entry.label,
    currency: line.currency ?? "EUR",
    currencyAmount: line.currencyAmount,
  });

  if (debits.length === 1 && credits.length === 1) return [make(debits[0], credits[0].account, "S", debits[0].debit)];
  if (debits.length === 1 && credits.length > 1) return credits.map((c) => make(c, debits[0].account, "H", c.credit));
  if (credits.length === 1 && debits.length > 1) return debits.map((d) => make(d, credits[0].account, "S", d.debit));

  if (!debits.length || !credits.length) {
    warnings.push(`Écriture ${entry.num} (${entry.label}) : aucun contre-compte exploitable, les lignes sont passées contre le compte d'attente ${clearing}.`);
    return [
      ...debits.map((d) => make(d, clearing, "S", d.debit)),
      ...credits.map((c) => make(c, clearing, "H", c.credit)),
    ];
  }

  // Walk both sides, booking the smaller remaining amount each time.
  const out: Booking[] = [];
  let i = 0;
  let j = 0;
  let left = debits[0].debit;
  let right = credits[0].credit;
  let guard = 0;
  while (i < debits.length && j < credits.length && guard++ < 1000) {
    const amount = Decimal.min(left, right);
    if (amount.gt(0)) out.push(make(debits[i], credits[j].account, "S", amount));
    left = left.minus(amount);
    right = right.minus(amount);
    if (left.lte(0) && ++i < debits.length) left = debits[i].debit;
    else if (left.lte(0)) break;
    if (right.lte(0) && ++j < credits.length) right = credits[j].credit;
    else if (right.lte(0)) break;
  }

  const booked = out.reduce((a, b) => a.plus(b.amount), ZERO);
  const total = debits.reduce((a, l) => a.plus(l.debit), ZERO);
  if (!booked.eq(total)) {
    warnings.push(`Écriture ${entry.num} (${entry.label}) : décomposition incomplète (${booked.toFixed(2)} sur ${total.toFixed(2)}). Vérifiez l'équilibre de l'écriture d'origine.`);
  }
  return out;
}

export function exportDatev(input: AuditFileInput): AuditFileOutput {
  const tz = input.timezone ?? "Europe/Berlin";
  const now = input.generatedAt ?? new Date();
  const e = input.entity;
  const warnings: string[] = [];
  const notes: string[] = [];
  const clearing = input.chart?.suspense.number ?? "1590";
  const accountLength = e.accountLength ?? 4;
  const currency = e.currency || "EUR";

  const fyStart = input.fiscalYear.start;
  const fyYear = Number(yyyymmdd(fyStart, tz).slice(0, 4));

  const rows: string[] = [];
  let lines = 0;
  let debit = ZERO;
  let credit = ZERO;

  for (const entry of input.entries) {
    const entryYear = Number(yyyymmdd(entry.date, tz).slice(0, 4));
    const bookings = toBookings(entry, clearing, warnings);
    if (entryYear !== fyYear) {
      warnings.push(`Écriture ${entry.num} datée du ${yyyymmdd(entry.date, tz)} hors de l'exercice déclaré (${fyYear}). Le format DATEV ne transporte que le jour et le mois : cette écriture s'imputerait sur ${fyYear}. Elle est exclue du fichier.`);
      continue;
    }
    for (const b of bookings) {
      const cells: string[] = new Array(COLUMNS).fill("");
      cells[0] = amount(b.amount);
      cells[1] = q(b.sign);
      cells[2] = q(currency);
      // Columns 4-6 carry an exchange rate and a base amount; they are only
      // filled when the booking is denominated in another currency.
      if (b.currency && b.currency !== currency && b.currencyAmount) {
        cells[3] = b.currencyAmount.isZero() ? "" : cents(b.amount).div(b.currencyAmount).toFixed(6).replace(".", ",");
        cells[4] = amount(b.currencyAmount);
        cells[5] = q(b.currency);
      }
      cells[6] = q(b.account);
      cells[7] = q(b.contra);
      cells[9] = ttmm(b.date, tz);
      cells[10] = q(b.documentField1.slice(0, 36));
      cells[13] = q(b.text.slice(0, 60));
      rows.push(cells.join(";"));
      lines += 1;
      if (b.sign === "S") debit = debit.plus(cents(b.amount));
      else credit = credit.plus(cents(b.amount));
    }
  }

  const header = [
    q("EXTF"), "700", "21", q("Buchungsstapel"), "13", stamp(now), "", q(""), q(input.software?.name ?? "CryptoLedger"), q(""),
    e.consultantNumber ?? "", e.clientNumber ?? "", yyyymmdd(fyStart, tz), String(accountLength),
    yyyymmdd(input.fiscalYear.start, tz), yyyymmdd(input.fiscalYear.end, tz),
    q(`${e.name} — crypto ${fyYear}`.slice(0, 30)), q(""), "1", "0", "0", q(currency),
    "", "", "", "", "0", "", q(""), "", "", q(input.comment ?? ""),
  ].join(";");

  warnings.push(...checkPeriod(input.fiscalYear.start, input.fiscalYear.end, tz));
  if (!e.consultantNumber || !e.clientNumber) {
    warnings.push("Numéro de conseil (Berater) ou de dossier (Mandant) DATEV absent : le cabinet destinataire ne pourra pas rattacher le lot. Renseignez-les dans les paramètres du dossier avant l'export.");
  }

  notes.push("Le format DATEV véhicule le jour et le mois de la pièce (TTMM) ; l'année provient de l'exercice déclaré en en-tête. Un lot ne peut donc couvrir qu'un seul exercice.");
  notes.push("Les montants sont exportés sans signe, le sens étant porté par l'indicateur S (débit) ou H (crédit) sur le compte de la colonne « Konto ».");
  notes.push("Aucun code de TVA (BU-Schlüssel) n'est renseigné : les opérations sur crypto-actifs sont hors champ ou exonérées dans les cas couverts ici. Vérifiez les opérations de vente de biens et services réglées en jetons.");
  notes.push("Le fichier reprend les 41 premières colonnes du Buchungsstapel v13. Faites-le valider par un import à blanc dans la version DATEV du cabinet destinataire avant le premier envoi réel.");
  notes.push("Festschreibung est à 0 : le lot est importé non figé et reste modifiable dans DATEV. Le cabinet fige lui-même après contrôle.");

  const fileName = `EXTF_Buchungsstapel_${e.clientNumber ?? "mandant"}_${fyYear}.csv`;
  return {
    format: "DATEV",
    fileName,
    content: [header, HEADER_FIELDS.map((h) => q(h)).join(";"), ...rows].join("\r\n") + "\r\n",
    encoding: "windows-1252",
    mimeType: "text/csv",
    warnings,
    notes,
    stats: { entries: input.entries.length, lines, debit, credit },
  };
}

/**
 * Windows-1252 encoder.
 *
 * Node's "latin1" is ISO-8859-1, which differs from Windows-1252 exactly on the
 * 0x80-0x9F range — where the euro sign and typographic quotes live. Those do
 * appear in account labels, so the difference is not theoretical.
 */
const CP1252_HIGH: Record<string, number> = {
  "€": 0x80, "‚": 0x82, "ƒ": 0x83, "„": 0x84, "…": 0x85, "†": 0x86, "‡": 0x87,
  "ˆ": 0x88, "‰": 0x89, "Š": 0x8a, "‹": 0x8b, "Œ": 0x8c, "Ž": 0x8e, "‘": 0x91,
  "’": 0x92, "“": 0x93, "”": 0x94, "•": 0x95, "–": 0x96, "—": 0x97, "˜": 0x98,
  "™": 0x99, "š": 0x9a, "›": 0x9b, "œ": 0x9c, "ž": 0x9e, "Ÿ": 0x9f,
};

export function toWindows1252(text: string): Uint8Array {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const code = ch.charCodeAt(0);
    if (code <= 0xff && !(code >= 0x80 && code <= 0x9f)) out[i] = code;
    else if (CP1252_HIGH[ch] !== undefined) out[i] = CP1252_HIGH[ch];
    else out[i] = 0x3f; // "?"
  }
  return out;
}
