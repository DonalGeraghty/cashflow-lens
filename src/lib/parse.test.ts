import { describe, expect, it } from 'vitest';
import { CsvFormatError, SKIP_REASONS, detectColumns, parseCsvText } from './parse';
import { generateDemoCsv } from './demo';

// Same structure as the real spreadsheet, invented rows.
const SAMPLE = `Bank,Date (month),Bookmark Date,Description,Type,Amount,Spending Bucket
BOI,May 2025,,Paycheck,Income,"€3,936.14",Income
BOI,May 2025,,mortgage,Mortgage,"-€1,307.63",Fixed Essential
REVOLUT,July 2026,"Thursday, 9 July ",tesco,Supermarket,-€39.93,Variable Essential
REVOLUT,July 2026,"Friday, 3 August ",spar,Supermarket,-€5.00,Variable Essential
REVOLUT,June 2026,,pharmacy refund,Healthcare,€9.97,Variable Essential
REVOLUT,October 2026,,? booking com hotel (est),Holiday,-€69.00,Discretionary
MONZO,September 2026,,,,,Other
MONZO,September 2026,,coffee,Social,,Discretionary
MONZO,September 2026,,coffee,Social,lots,Discretionary
MONZO,Smarch 2026,,coffee,Social,-€3.00,Discretionary
MONZO,September 2026,,coffee,Social,-€3.00

BOI,May 2025,,data,Income,€400.00,Income
`;

describe('parseCsvText', () => {
  const { transactions, report } = parseCsvText(SAMPLE, { fileName: 'sample.csv', now: new Date('2026-09-23') });

  it('keeps good rows and parses fields', () => {
    expect(transactions).toHaveLength(7);
    const [pay, mortgage, tesco] = transactions;
    expect(pay).toMatchObject({ account: 'BOI', month: '2025-05', day: null, amount: 3936.14, currency: 'EUR', csvCategory: 'Income', bucket: 'Income' });
    expect(mortgage.amount).toBe(-1307.63);
    expect(tesco).toMatchObject({ month: '2026-07', day: 9, merchant: 'Tesco', line: 4 });
  });

  it('ignores a day that belongs to a different month and warns', () => {
    expect(transactions[3]).toMatchObject({ merchant: 'Spar', month: '2026-07', day: null });
    expect(report.warnings.some((w) => w.includes('1 row(s) had a day'))).toBe(true);
  });

  it('flags estimates', () => {
    expect(transactions.find((t) => t.description.startsWith('?'))!.estimate).toBe(true);
    expect(transactions.filter((t) => t.estimate)).toHaveLength(1);
  });

  it('reports every skipped row with a reason and line number', () => {
    expect(report.totalRows).toBe(12);
    expect(report.kept).toBe(7);
    expect(report.reasons).toEqual({
      [SKIP_REASONS.blankTemplate]: 1,
      [SKIP_REASONS.missingAmount]: 1,
      [SKIP_REASONS.badAmount]: 1,
      [SKIP_REASONS.badDate]: 1,
      [SKIP_REASONS.columns]: 1,
    });
    expect(report.skipped.find((s) => s.reason === SKIP_REASONS.badAmount)).toMatchObject({ line: 10, detail: '"lots"' });
    expect(report.skipped.find((s) => s.reason === SKIP_REASONS.badDate)!.line).toBe(11);
  });

  it('records which header fed each role', () => {
    expect(report.columns).toMatchObject({ account: 'Bank', month: 'Date (month)', date: 'Bookmark Date', category: 'Type', bucket: 'Spending Bucket' });
    expect(report.currencies).toEqual(['EUR']);
  });

  it('handles a BOM, CRLF line endings and debit/credit columns', () => {
    const csv = '﻿Date,Payee,Debit,Credit,Currency\r\n03/04/2026,Tesco,12.50,,EUR\r\n04/04/2026,Employer,,"2,000.00",GBP\r\n';
    const { transactions: t, report: r } = parseCsvText(csv);
    expect(t.map((x) => [x.month, x.day, x.amount, x.currency])).toEqual([
      ['2026-04', 3, -12.5, 'EUR'],
      ['2026-04', 4, 2000, 'GBP'],
    ]);
    expect(r.warnings[0]).toMatch(/Multiple currencies/);
  });

  it('throws a helpful error when required columns are missing', () => {
    expect(() => parseCsvText('Foo,Bar\n1,2')).toThrow(CsvFormatError);
    expect(() => parseCsvText('Description,Amount\nx,1')).toThrow(/No date column/);
    expect(() => parseCsvText('')).toThrow(/empty/);
  });

  it('parses the generated demo data cleanly', () => {
    const demo = parseCsvText(generateDemoCsv(new Date('2026-09-23')));
    expect(demo.report.kept).toBeGreaterThan(200);
    expect(demo.report.reasons).toEqual({ [SKIP_REASONS.blankTemplate]: 1 });
  });
});

describe('detectColumns', () => {
  it('matches exact aliases only and never assigns a header twice', () => {
    const c = detectColumns(['Date', 'Date (month)', 'Description', 'Amount']);
    expect(c.date).toBe(0);
    expect(c.month).toBe(1);
    expect(c.description).toBe(2);
    expect(c.amount).toBe(3);
    expect(c.account).toBe(-1);
  });
});
