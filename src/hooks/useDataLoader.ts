import { useCallback, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { CsvFormatError, parseCsvText, parseRows, type ParseResult } from '../lib/parse';
import { generateDemoCsv } from '../lib/demo';
import { SheetsError, getSheetMeta, getTabValues, type SheetMeta } from '../lib/sheets';
import { dropAccessToken, getAccessToken, googleClientId } from '../lib/googleAuth';

export type Notice = { kind: 'ok' | 'error'; text: string } | null;

/**
 * Everything that loads data into the store: CSV files, the demo data and
 * Google Sheets. All three go through the same parser (parseRows), so they
 * get the same validation and skipped-rows report.
 */
export function useDataLoader() {
  const loadData = useAppStore((s) => s.loadData);
  const setSheetSource = useAppStore((s) => s.setSheetSource);
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState<string | null>(null);

  /** Put a parse result into the store and say what happened. Returns false if nothing was usable. */
  const apply = useCallback(
    ({ transactions, report }: ParseResult, name: string): boolean => {
      if (!transactions.length) {
        setNotice({ kind: 'error', text: `No usable rows in ${name} (${report.skipped.length} skipped). See Data & rules for details.` });
        return false;
      }
      loadData(transactions, report);
      const skipped = report.skipped.length ? ` · ${report.skipped.length} rows skipped (see Data & rules)` : '';
      setNotice({ kind: 'ok', text: `Loaded ${report.kept.toLocaleString('en-IE')} transactions from ${name}${skipped}` });
      return true;
    },
    [loadData],
  );

  const fail = useCallback((e: unknown, what: string) => {
    const known = e instanceof CsvFormatError || e instanceof SheetsError;
    setNotice({ kind: 'error', text: known ? (e as Error).message : `${what}: ${(e as Error).message}` });
  }, []);

  // ---- CSV & demo -------------------------------------------------------------

  const loadText = useCallback(
    (text: string, fileName: string, source: 'csv' | 'demo' = 'csv') => {
      try {
        apply(parseCsvText(text, { fileName, source }), fileName);
      } catch (e) {
        fail(e, `Couldn't read ${fileName}`);
      }
    },
    [apply, fail],
  );

  const loadFile = useCallback(
    async (file: File) => {
      if (!/\.(csv|txt)$/i.test(file.name) && file.type && !file.type.includes('csv') && !file.type.startsWith('text/')) {
        setNotice({ kind: 'error', text: `${file.name} doesn't look like a CSV file.` });
        return;
      }
      loadText(await file.text(), file.name);
    },
    [loadText],
  );

  const loadDemo = useCallback(() => loadText(generateDemoCsv(), 'demo-data.csv', 'demo'), [loadText]);

  // ---- Google Sheets ------------------------------------------------------------

  /** Run a Sheets call with a token, signing in again once if the token turns out to be stale. */
  const withToken = useCallback(async <T,>(fn: (token: string) => Promise<T>): Promise<T> => {
    if (!googleClientId) throw new SheetsError('Google Sheets isn’t set up: add VITE_GOOGLE_CLIENT_ID to .env (see README).');
    try {
      return await fn(await getAccessToken(googleClientId));
    } catch (e) {
      if (e instanceof SheetsError && e.status === 401) {
        dropAccessToken();
        return fn(await getAccessToken(googleClientId));
      }
      throw e;
    }
  }, []);

  /** Sign in if needed and list the spreadsheet's tabs. */
  const connectSheet = useCallback(
    async (spreadsheetId: string): Promise<SheetMeta | null> => {
      setBusy('Connecting to Google…');
      try {
        return await withToken((token) => getSheetMeta(spreadsheetId, token));
      } catch (e) {
        fail(e, 'Couldn’t open the sheet');
        return null;
      } finally {
        setBusy(null);
      }
    },
    [withToken, fail],
  );

  /** Fetch one tab and load it. Remembers the sheet + tab for Refresh on success. */
  const loadSheet = useCallback(
    async (spreadsheetId: string, tab: string, title: string): Promise<boolean> => {
      setBusy('Loading from Google Sheets…');
      try {
        const rows = await withToken((token) => getTabValues(spreadsheetId, tab, token));
        const name = `${title} › ${tab}`;
        const ok = apply(parseRows(rows, { fileName: name, source: 'sheets' }), name);
        if (ok) setSheetSource({ spreadsheetId, tab, title });
        return ok;
      } catch (e) {
        fail(e, 'Couldn’t load the sheet');
        return false;
      } finally {
        setBusy(null);
      }
    },
    [withToken, apply, fail, setSheetSource],
  );

  /** Re-fetch the remembered sheet. */
  const refreshSheet = useCallback(async () => {
    const src = useAppStore.getState().sheetSource;
    if (src) await loadSheet(src.spreadsheetId, src.tab, src.title);
  }, [loadSheet]);

  const clearNotice = useCallback(() => setNotice(null), []);

  return { loadFile, loadDemo, connectSheet, loadSheet, refreshSheet, busy, notice, clearNotice, sheetsEnabled: Boolean(googleClientId) };
}

export type DataLoader = ReturnType<typeof useDataLoader>;
