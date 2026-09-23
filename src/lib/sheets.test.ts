import Papa from 'papaparse';
import { describe, expect, it, vi } from 'vitest';
import { parseCsvText, parseRows } from './parse';
import { SheetsError, getSheetMeta, getTabValues, parseSheetUrl, pickDefaultTab, type FetchLike } from './sheets';

const ID = '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abc';

const reply = (status: number, body: unknown): FetchLike =>
  vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));

describe('parseSheetUrl', () => {
  it.each([
    [`https://docs.google.com/spreadsheets/d/${ID}/edit#gid=0`, ID],
    [`https://docs.google.com/spreadsheets/d/${ID}/edit?usp=sharing`, ID],
    [`https://docs.google.com/spreadsheets/u/1/d/${ID}/`, ID],
    [`  ${ID}  `, ID],
  ])('%s', (input, expected) => {
    expect(parseSheetUrl(input)).toBe(expected);
  });

  it.each(['', 'not a sheet', 'https://example.com/spreadsheets/d/short', 'https://docs.google.com/document/d/abc'])('rejects %j', (input) => {
    expect(parseSheetUrl(input)).toBeNull();
  });
});

describe('pickDefaultTab', () => {
  it('prefers the remembered tab, then a data-looking one, then the first', () => {
    expect(pickDefaultTab(['Summary', 'Fin Data'], 'Summary')).toBe('Summary');
    expect(pickDefaultTab(['Summary', 'Fin Data'], 'Gone')).toBe('Fin Data');
    expect(pickDefaultTab(['Summary', 'Notes'])).toBe('Summary');
    expect(pickDefaultTab([])).toBeNull();
  });
});

describe('getSheetMeta', () => {
  it('asks for just the title and tab names, with the token', async () => {
    const fetchFn = reply(200, { properties: { title: 'MASTER SHEET' }, sheets: [{ properties: { title: 'Fin Data' } }, { properties: { title: 'Budget' } }] });
    await expect(getSheetMeta(ID, 'tok', fetchFn)).resolves.toEqual({ id: ID, title: 'MASTER SHEET', tabs: ['Fin Data', 'Budget'] });
    const [url, init] = vi.mocked(fetchFn).mock.calls[0];
    expect(url).toBe(`https://sheets.googleapis.com/v4/spreadsheets/${ID}?fields=properties.title,sheets.properties.title`);
    expect(init?.headers).toEqual({ Authorization: 'Bearer tok' });
  });

  it.each([
    [401, {}, /expired/],
    [403, { error: { message: 'Google Sheets API has not been used in project 123' } }, /isn’t enabled/],
    [403, { error: { message: 'The caller does not have permission' } }, /can’t open this sheet/],
    [404, {}, /not found/],
    [500, { error: { message: 'Backend error' } }, /500: Backend error/],
  ])('explains HTTP %i', async (status, body, message) => {
    const err = await getSheetMeta(ID, 'tok', reply(status, body)).catch((e) => e);
    expect(err).toBeInstanceOf(SheetsError);
    expect(err.status).toBe(status);
    expect(err.message).toMatch(message);
  });

  it('explains network failures', async () => {
    const fetchFn: FetchLike = async () => {
      throw new TypeError('Failed to fetch');
    };
    await expect(getSheetMeta(ID, 'tok', fetchFn)).rejects.toThrow(/Couldn’t reach Google/);
  });
});

describe('getTabValues', () => {
  it('quotes the tab name, asks for formatted values and pads short rows', async () => {
    const fetchFn = reply(200, {
      values: [
        ['Bank', 'Date (month)', 'Bookmark Date', 'Description', 'Type', 'Amount', 'Spending Bucket'],
        ['BOI', 'May 2025', '', 'Paycheck', 'Income', '€3,936.14', 'Income'],
        ['BOI', 'September 2026'],
        [],
      ],
    });
    const rows = await getTabValues(ID, "Dad's Fin Data", 'tok', fetchFn);
    const [url] = vi.mocked(fetchFn).mock.calls[0];
    expect(url).toBe(
      `https://sheets.googleapis.com/v4/spreadsheets/${ID}/values/${encodeURIComponent("'Dad''s Fin Data'")}?valueRenderOption=FORMATTED_VALUE&majorDimension=ROWS`,
    );
    expect(rows.map((r) => r.length)).toEqual([7, 7, 7, 7]);
    expect(rows[2]).toEqual(['BOI', 'September 2026', '', '', '', '', '']);
  });

  it('handles an empty tab', async () => {
    await expect(getTabValues(ID, 'Empty', 'tok', reply(200, {}))).resolves.toEqual([]);
  });
});

describe('Sheets rows parse exactly like the CSV export', () => {
  const csv = `Bank,Date (month),Bookmark Date,Description,Type,Amount,Spending Bucket
BOI,May 2025,,Paycheck,Income,"€3,936.14",Income
REVOLUT,July 2026,"Thursday, 9 July ",tesco,Supermarket,-€39.93,Variable Essential
MONZO,September 2026,,,,,Other
REVOLUT,June 2026,,pharmacy refund,Healthcare,€9.97,Variable Essential
`;
  it('same transactions and skipped rows', () => {
    const now = new Date('2026-09-23');
    const fromCsv = parseCsvText(csv, { now });
    // What the Sheets API returns for the same tab: the same cells, trailing blanks dropped then padded.
    const grid = Papa.parse<string[]>(csv, { skipEmptyLines: true }).data;
    const fromSheet = parseRows(grid, { now, source: 'sheets', fileName: 'MASTER SHEET › Fin Data' });
    expect(fromSheet.transactions).toEqual(fromCsv.transactions);
    expect(fromSheet.report.reasons).toEqual(fromCsv.report.reasons);
    expect(fromSheet.report.source).toBe('sheets');
    expect(fromCsv.report.source).toBe('csv');
  });
});
