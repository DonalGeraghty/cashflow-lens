const SYMBOLS: Record<string, string> = { '€': 'EUR', '£': 'GBP', $: 'USD' };
const CODE_RE = /\b(EUR|GBP|USD)\b/i;

export interface ParsedAmount {
  value: number;
  /** ISO code if the cell carried a symbol or code, else null. */
  currency: string | null;
}

/**
 * Parse a messy money cell: "-€1,307.63", "€400.00", "(12.50)", "12,50 EUR",
 * "1.234,56", "£ 3.20-". Returns null when the cell isn't a number.
 */
export function parseAmount(input: string | null | undefined): ParsedAmount | null {
  if (input == null) return null;
  let s = String(input).trim();
  if (!s) return null;

  let currency: string | null = null;
  for (const [symbol, code] of Object.entries(SYMBOLS)) {
    if (s.includes(symbol)) {
      currency = code;
      s = s.split(symbol).join('');
    }
  }
  const code = s.match(CODE_RE);
  if (code) {
    currency = code[1].toUpperCase();
    s = s.replace(code[0], '');
  }

  // Unicode minus / en dash, spaces, NBSPs and apostrophe thousands separators.
  s = s.replace(/[−–]/g, '-').replace(/[\s ']/g, '');

  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (s.endsWith('-')) {
    negative = !negative;
    s = s.slice(0, -1);
  }
  if (s.startsWith('-')) {
    negative = !negative;
    s = s.slice(1);
  } else if (s.startsWith('+')) {
    s = s.slice(1);
  }

  // Work out which separator is the decimal point.
  // Thousands separators must sit in proper groups of three ("1,234,567").
  const grouped = (intPart: string, sep: string) =>
    !intPart.includes(sep) || new RegExp(`^\\d{1,3}(\\${sep}\\d{3})+$`).test(intPart);
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    const [thousands, decimal] = lastComma > lastDot ? ['.', ','] : [',', '.'];
    const cut = Math.max(lastComma, lastDot);
    const intPart = s.slice(0, cut);
    if (!grouped(intPart, thousands) || intPart.includes(decimal)) return null;
    s = `${intPart.split(thousands).join('')}.${s.slice(cut + 1)}`;
  } else if (lastComma >= 0) {
    // "12,50" is a decimal comma; "1,234" and "1,234,567" are thousands.
    if (/^\d+,\d{1,2}$/.test(s)) s = s.replace(',', '.');
    else if (grouped(s, ',')) s = s.replace(/,/g, '');
    else return null;
  }

  if (!/^(\d+(\.\d+)?|\.\d+)$/.test(s)) return null;
  const value = Number(s);
  if (!Number.isFinite(value)) return null;
  return { value: negative && value !== 0 ? -value : value, currency };
}
