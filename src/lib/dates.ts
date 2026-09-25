export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
export const MONTH_SHORT = MONTH_NAMES.map((m) => m.slice(0, 3));
export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const NO_DAY = '(no day)';

/** 1-12 for a full or 3+ letter month name ("sep", "Sept", "September"), else -1. */
export function monthFromName(name: string): number {
  const n = name.trim().toLowerCase().replace(/\.$/, '');
  if (n.length < 3) return -1;
  const i = MONTH_NAMES.findIndex((m) => m.toLowerCase().startsWith(n.slice(0, 3)) && m.toLowerCase().startsWith(n));
  return i >= 0 ? i + 1 : -1;
}

export const monthKey = (year: number, month: number): string =>
  `${year}-${String(month).padStart(2, '0')}`;

export function parseMonthKey(key: string): { year: number; month: number } {
  const [y, m] = key.split('-').map(Number);
  return { year: y, month: m };
}

export function addMonths(key: string, n: number): string {
  const { year, month } = parseMonthKey(key);
  const idx = year * 12 + (month - 1) + n;
  return monthKey(Math.floor(idx / 12), (idx % 12) + 1);
}

/** Inclusive list of month keys from `from` to `to`. */
export function monthRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let k = from; k <= to; k = addMonths(k, 1)) out.push(k);
  return out;
}

export function monthLabel(key: string, style: 'short' | 'long' | 'name' = 'short'): string {
  const { year, month } = parseMonthKey(key);
  if (style === 'name') return MONTH_NAMES[month - 1];
  const name = style === 'long' ? MONTH_NAMES[month - 1] : MONTH_SHORT[month - 1];
  return `${name} ${year}`;
}

export const quarterOf = (month: number): number => Math.ceil(month / 3);

export function weekdayOf(year: number, month: number, day: number): string {
  const js = new Date(Date.UTC(year, month - 1, day)).getUTCDay(); // 0 = Sunday
  return WEEKDAYS[(js + 6) % 7];
}

export const daysInMonth = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();

const validYear = (y: number) => y >= 1970 && y <= 2100;

/** "May 2025", "Sep-25", "2025-05", "05/2025" -> { year, month } */
export function parseMonthCell(input: string): { year: number; month: number } | null {
  const s = input.trim();
  if (!s) return null;
  let m = s.match(/^([A-Za-z]+)\.?[\s\-/]+(\d{2}|\d{4})$/);
  if (m) {
    const month = monthFromName(m[1]);
    const year = m[2].length === 2 ? 2000 + Number(m[2]) : Number(m[2]);
    return month > 0 && validYear(year) ? { year, month } : null;
  }
  m = s.match(/^(\d{4})[-/.](\d{1,2})$/);
  if (m) return mk(Number(m[1]), Number(m[2]));
  m = s.match(/^(\d{1,2})[-/.](\d{4})$/);
  if (m) return mk(Number(m[2]), Number(m[1]));
  // A full date in the month column is fine too.
  const d = parseDateCell(s);
  return d ? { year: d.year, month: d.month } : null;

  function mk(year: number, month: number) {
    return month >= 1 && month <= 12 && validYear(year) ? { year, month } : null;
  }
}

export interface ParsedDate {
  year: number;
  month: number;
  day: number;
}

/**
 * Parse a day-level date. Numeric dates are read as DD/MM/YYYY (Irish/UK order);
 * ISO YYYY-MM-DD is also accepted. Text dates may omit the year
 * ("Thursday, 9 July") when `fallbackYear` is given.
 */
export function parseDateCell(input: string, fallbackYear?: number): ParsedDate | null {
  const s = input.trim().replace(/\s+/g, ' ');
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/);
  if (m) return mk(Number(m[1]), Number(m[2]), Number(m[3]));
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})(?: .*)?$/);
  if (m) {
    const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return mk(year, Number(m[2]), Number(m[1]));
  }
  // Optional weekday, then "9 July [2026]" or "July 9[, 2026]".
  const text = s.replace(/^[A-Za-z]+,\s*/, '').replace(/(\d)(st|nd|rd|th)\b/i, '$1');
  m = text.match(/^(\d{1,2}) ([A-Za-z]+)\.?,?(?: (\d{4}))?$/);
  if (m) return mkText(Number(m[1]), m[2], m[3]);
  m = text.match(/^([A-Za-z]+)\.? (\d{1,2}),?(?: (\d{4}))?$/);
  if (m) return mkText(Number(m[2]), m[1], m[3]);
  return null;

  function mkText(day: number, monthName: string, year?: string) {
    const month = monthFromName(monthName);
    const y = year ? Number(year) : fallbackYear;
    if (month < 0 || y === undefined) return null;
    return mk(y, month, day);
  }
  function mk(year: number, month: number, day: number): ParsedDate | null {
    if (!validYear(year) || month < 1 || month > 12) return null;
    if (day < 1 || day > daysInMonth(year, month)) return null;
    return { year, month, day };
  }
}
