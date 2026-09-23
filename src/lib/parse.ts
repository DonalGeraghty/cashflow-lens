import Papa from 'papaparse';
import type { RawTransaction } from '../types';
import { parseAmount } from './amount';
import { monthKey, parseDateCell, parseMonthCell } from './dates';
import { isEstimateDescription, normaliseMerchant } from './merchant';

export type ColumnRole =
  | 'account' | 'month' | 'date' | 'description' | 'category'
  | 'amount' | 'debit' | 'credit' | 'bucket' | 'currency';

/** Header names (lower-case) recognised for each role, in priority order. */
const ALIASES: Record<ColumnRole, string[]> = {
  account: ['bank', 'account', 'account name', 'source'],
  month: ['date (month)', 'month', 'period'],
  date: ['date', 'bookmark date', 'transaction date', 'booking date', 'posted date', 'completed date', 'started date', 'day'],
  description: ['description', 'payee', 'merchant', 'details', 'narrative', 'name', 'reference'],
  category: ['category', 'type'],
  amount: ['amount', 'value', 'amount (eur)'],
  debit: ['debit', 'money out', 'paid out', 'withdrawal', 'withdrawals'],
  credit: ['credit', 'money in', 'paid in', 'deposit', 'deposits'],
  bucket: ['spending bucket', 'bucket', 'group'],
  currency: ['currency', 'ccy'],
};

export const SKIP_REASONS = {
  blankTemplate: 'Blank placeholder row (no description or amount)',
  columns: 'Wrong number of columns',
  missingAmount: 'Missing amount',
  badAmount: 'Unparseable amount',
  badDate: 'Missing or unparseable date',
} as const;

export interface SkippedRow {
  line: number;
  reason: string;
  detail: string;
}

export type DataSourceKind = 'csv' | 'sheets' | 'demo';

export interface ParseReport {
  fileName: string;
  /** Where the rows came from (absent in reports saved before Sheets support). */
  source?: DataSourceKind;
  loadedAt: string;
  /** Non-blank data rows in the file. */
  totalRows: number;
  kept: number;
  skipped: SkippedRow[];
  /** Skipped count per reason. */
  reasons: Record<string, number>;
  /** Which header was used for each role (null = not found). */
  columns: Record<ColumnRole, string | null>;
  currencies: string[];
  warnings: string[];
}

export interface ParseOptions {
  fileName?: string;
  source?: DataSourceKind;
  defaultCurrency?: string;
  now?: Date;
}

export class CsvFormatError extends Error {}

export function detectColumns(headers: string[]): Record<ColumnRole, number> {
  const norm = headers.map((h) => h.trim().toLowerCase());
  const used = new Set<number>();
  const out = {} as Record<ColumnRole, number>;
  for (const role of Object.keys(ALIASES) as ColumnRole[]) {
    out[role] = -1;
    for (const alias of ALIASES[role]) {
      const i = norm.findIndex((h, idx) => h === alias && !used.has(idx));
      if (i >= 0) {
        out[role] = i;
        used.add(i);
        break;
      }
    }
  }
  return out;
}

export interface ParseResult {
  transactions: RawTransaction[];
  report: ParseReport;
}

/**
 * Parse CSV text into transactions plus a report of everything skipped.
 * Throws CsvFormatError only when the file as a whole is unusable
 * (e.g. no amount or date column); bad rows are skipped and reported.
 */
export function parseCsvText(text: string, opts: ParseOptions = {}): ParseResult {
  const parsed = Papa.parse<string[]>(text.replace(/^﻿/, ''), { skipEmptyLines: false });
  const quoteWarnings = parsed.errors
    .filter((e) => e.type === 'Quotes')
    .slice(0, 3)
    .map((e) => `CSV quoting problem near line ${(e.row ?? 0) + 1}: ${e.message}`);
  return parseRows(parsed.data, { fileName: 'data.csv', source: 'csv', ...opts }, quoteWarnings);
}

/**
 * Turn a grid of cells (CSV rows, or a Google Sheets tab) into transactions.
 * The first non-blank row is the header; row numbers in the report are 1-based
 * positions in the grid, which match spreadsheet row numbers.
 */
export function parseRows(
  rows: string[][],
  { fileName = 'data', source, defaultCurrency = 'EUR', now = new Date() }: ParseOptions = {},
  extraWarnings: string[] = [],
): ParseResult {
  const isBlank = (r: string[]) => r.every((c) => !c || !c.trim());

  const headerIdx = rows.findIndex((r) => !isBlank(r));
  if (headerIdx < 0) throw new CsvFormatError('No data found: the file or sheet is empty.');
  const header = rows[headerIdx].map((h) => h.trim());
  const col = detectColumns(header);

  if (col.amount < 0 && col.debit < 0 && col.credit < 0) {
    throw new CsvFormatError(`No amount column found. Expected one of: Amount, Debit/Credit. Found: ${header.join(', ')}`);
  }
  if (col.month < 0 && col.date < 0) {
    throw new CsvFormatError(`No date column found. Expected Date or Month. Found: ${header.join(', ')}`);
  }

  const transactions: RawTransaction[] = [];
  const skipped: SkippedRow[] = [];
  const currencies = new Set<string>();
  let totalRows = 0;
  let dayMismatch = 0;

  const skip = (line: number, reason: string, detail: string) => skipped.push({ line, reason, detail });

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (isBlank(row)) continue;
    totalRows++;
    const line = i + 1;
    const cell = (idx: number) => (idx >= 0 && idx < row.length ? (row[idx] ?? '').trim() : '');

    const extras = row.slice(header.length);
    if (row.length < header.length || extras.some((c) => c.trim())) {
      skip(line, SKIP_REASONS.columns, `${row.length} columns, expected ${header.length}`);
      continue;
    }

    const description = cell(col.description);
    const amountCell = cell(col.amount);
    const debitCell = cell(col.debit);
    const creditCell = cell(col.credit);
    if (!description && !amountCell && !debitCell && !creditCell) {
      skip(line, SKIP_REASONS.blankTemplate, preview(row));
      continue;
    }

    // --- amount ---
    let amount: number;
    let symbolCurrency: string | null = null;
    if (col.amount >= 0 && amountCell) {
      const a = parseAmount(amountCell);
      if (!a) {
        skip(line, SKIP_REASONS.badAmount, `"${amountCell}"`);
        continue;
      }
      amount = a.value;
      symbolCurrency = a.currency;
    } else if (debitCell || creditCell) {
      const d = debitCell ? parseAmount(debitCell) : { value: 0, currency: null };
      const c = creditCell ? parseAmount(creditCell) : { value: 0, currency: null };
      if (!d || !c) {
        skip(line, SKIP_REASONS.badAmount, `debit "${debitCell}", credit "${creditCell}"`);
        continue;
      }
      amount = Math.abs(c.value) - Math.abs(d.value);
      symbolCurrency = d.currency ?? c.currency;
    } else {
      skip(line, SKIP_REASONS.missingAmount, description || preview(row));
      continue;
    }

    // --- date ---
    const monthCell = cell(col.month);
    const dateCell = cell(col.date);
    let year: number;
    let month: number;
    let day: number | null = null;
    const ym = monthCell ? parseMonthCell(monthCell) : null;
    if (col.month >= 0) {
      if (!ym) {
        skip(line, SKIP_REASONS.badDate, `"${monthCell}"`);
        continue;
      }
      ({ year, month } = ym);
      if (dateCell) {
        const d = parseDateCell(dateCell, year);
        // Only trust the day if it falls in the row's budget month.
        if (d && d.month === month) day = d.day;
        else dayMismatch++;
      }
    } else {
      const d = parseDateCell(dateCell);
      if (!d) {
        skip(line, SKIP_REASONS.badDate, `"${dateCell}"`);
        continue;
      }
      ({ year, month, day } = d);
    }

    const currency = (cell(col.currency) || symbolCurrency || defaultCurrency).toUpperCase();
    currencies.add(currency);

    transactions.push({
      id: `r${line}`,
      line,
      account: cell(col.account) || 'Default',
      month: monthKey(year, month),
      day,
      description,
      merchant: normaliseMerchant(description),
      csvCategory: cell(col.category),
      bucket: cell(col.bucket),
      amount: Math.round(amount * 100) / 100,
      currency,
      estimate: isEstimateDescription(description),
    });
  }

  const reasons: Record<string, number> = {};
  for (const s of skipped) reasons[s.reason] = (reasons[s.reason] ?? 0) + 1;

  const warnings: string[] = [];
  if (currencies.size > 1) {
    warnings.push(`Multiple currencies found (${[...currencies].join(', ')}). Totals add them together without FX conversion; use the Currency filter in the pivot to separate them.`);
  }
  if (dayMismatch > 0) {
    warnings.push(`${dayMismatch} row(s) had a day that didn't match their month column; the day was ignored.`);
  }
  warnings.push(...extraWarnings);

  const columns = {} as Record<ColumnRole, string | null>;
  for (const role of Object.keys(col) as ColumnRole[]) columns[role] = col[role] >= 0 ? header[col[role]] : null;

  return {
    transactions,
    report: {
      fileName,
      source,
      loadedAt: now.toISOString(),
      totalRows,
      kept: transactions.length,
      skipped,
      reasons,
      columns,
      currencies: [...currencies],
      warnings,
    },
  };
}

function preview(row: string[]): string {
  const s = row.join(',');
  return s.length > 120 ? `${s.slice(0, 117)}...` : s;
}
