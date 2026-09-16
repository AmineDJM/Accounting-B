/**
 * Accounting calendar helpers.
 *
 * Instants are stored in UTC, but a French entity books its operations and
 * closes its fiscal year on Paris calendar days: a trade executed at 23:30 UTC
 * on 31 December belongs to 1 January. Every accounting date (EcritureDate,
 * fiscal-year bounds, closing valuation) therefore goes through this module.
 */
export const ACCOUNTING_TZ = "Europe/Paris";

const formatters = new Map<string, Intl.DateTimeFormat>();
function dtf(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
    formatters.set(tz, f);
  }
  return f;
}

export interface ZonedParts { year: number; month: number; day: number; hour: number; minute: number; second: number }

export function zonedParts(d: Date, tz: string = ACCOUNTING_TZ): ZonedParts {
  const p: Record<string, string> = {};
  for (const part of dtf(tz).formatToParts(d)) if (part.type !== "literal") p[part.type] = part.value;
  return { year: Number(p.year), month: Number(p.month), day: Number(p.day), hour: Number(p.hour), minute: Number(p.minute), second: Number(p.second) };
}

/** Offset (ms) of `tz` relative to UTC at instant `at` (+3 600 000 for CET). */
export function tzOffsetMs(at: Date, tz: string = ACCOUNTING_TZ): number {
  const p = zonedParts(at, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/** Instant of local midnight for the given calendar day in `tz` (day may overflow, e.g. day 32). */
export function zonedMidnight(year: number, month: number, day: number, tz: string = ACCOUNTING_TZ): Date {
  const guess = Date.UTC(year, month - 1, day, 0, 0, 0, 0);
  const off = tzOffsetMs(new Date(guess), tz);
  const candidate = new Date(guess - off);
  const off2 = tzOffsetMs(candidate, tz);
  return off2 === off ? candidate : new Date(guess - off2);
}

/** Last millisecond of the given calendar day in `tz`. */
export function zonedEndOfDay(year: number, month: number, day: number, tz: string = ACCOUNTING_TZ): Date {
  return new Date(zonedMidnight(year, month, day + 1, tz).getTime() - 1);
}

const pad = (n: number) => String(n).padStart(2, "0");

/** AAAAMMJJ in the accounting time zone (FEC date format). */
export function zonedDateStamp(d: Date, tz: string = ACCOUNTING_TZ): string {
  const p = zonedParts(d, tz);
  return `${p.year}${pad(p.month)}${pad(p.day)}`;
}

/** JJ/MM/AAAA in the accounting time zone. */
export function formatZonedDate(d: Date, tz: string = ACCOUNTING_TZ): string {
  const p = zonedParts(d, tz);
  return `${pad(p.day)}/${pad(p.month)}/${p.year}`;
}

export const zonedYear = (d: Date, tz: string = ACCOUNTING_TZ): number => zonedParts(d, tz).year;

/** Fiscal year [start, end] (accounting time zone) containing `date`, for a closing on endMonth/endDay. */
export function fiscalYearBoundsZoned(endMonth: number, endDay: number, date: Date, tz: string = ACCOUNTING_TZ): { start: Date; end: Date; label: string } {
  let endYear = zonedYear(date, tz);
  let end = zonedEndOfDay(endYear, endMonth, endDay, tz);
  if (date > end) { endYear += 1; end = zonedEndOfDay(endYear, endMonth, endDay, tz); }
  const start = new Date(zonedEndOfDay(endYear - 1, endMonth, endDay, tz).getTime() + 1);
  const label = endMonth === 12 && endDay === 31 ? String(endYear) : `${formatZonedDate(start, tz)} → ${formatZonedDate(end, tz)}`;
  return { start, end, label };
}
