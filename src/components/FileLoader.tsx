import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { CsvFormatError, parseCsvText } from '../lib/parse';
import { generateDemoCsv } from '../lib/demo';

type Notice = { kind: 'ok' | 'error'; text: string } | null;

/** Hook that parses a CSV file (or text) into the store and reports the result. */
export function useCsvLoader() {
  const loadData = useAppStore((s) => s.loadData);
  const [notice, setNotice] = useState<Notice>(null);

  const loadText = useCallback(
    (text: string, fileName: string) => {
      try {
        const { transactions, report } = parseCsvText(text, { fileName });
        if (!transactions.length) {
          setNotice({ kind: 'error', text: `No usable rows in ${fileName} (${report.skipped.length} skipped). See Data & rules for details.` });
          return;
        }
        loadData(transactions, report);
        const skipped = report.skipped.length ? ` · ${report.skipped.length} rows skipped (see Data & rules)` : '';
        setNotice({ kind: 'ok', text: `Loaded ${report.kept.toLocaleString('en-IE')} transactions from ${fileName}${skipped}` });
      } catch (e) {
        setNotice({ kind: 'error', text: e instanceof CsvFormatError ? e.message : `Couldn't read ${fileName}: ${(e as Error).message}` });
      }
    },
    [loadData],
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

  const loadDemo = useCallback(() => loadText(generateDemoCsv(), 'demo-data.csv'), [loadText]);

  return { loadFile, loadDemo, notice, clearNotice: () => setNotice(null) };
}

/** "Load CSV" button plus a full-window drop target. */
export function FileLoader({ loader }: { loader: ReturnType<typeof useCsvLoader> }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const { loadFile, notice, clearNotice } = loader;

  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth++;
      setDragging(true);
    };
    const over = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const leave = () => {
      depth = Math.max(0, depth - 1);
      if (!depth) setDragging(false);
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDragging(false);
      const file = e.dataTransfer?.files[0];
      if (file) void loadFile(file);
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragover', over);
    window.addEventListener('dragleave', leave);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragover', over);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('drop', drop);
    };
  }, [loadFile]);

  useEffect(() => {
    if (notice?.kind !== 'ok') return;
    const t = window.setTimeout(clearNotice, 6000);
    return () => window.clearTimeout(t);
  }, [notice, clearNotice]);

  return (
    <>
      <button type="button" className="primary" onClick={() => inputRef.current?.click()}>
        Load CSV
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv,text/plain"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void loadFile(file);
          e.target.value = '';
        }}
      />
      {dragging && (
        <div className="drop-overlay" aria-hidden="true">
          <div>Drop your CSV to load it</div>
        </div>
      )}
      {notice && (
        <div className={`toast ${notice.kind}`} role={notice.kind === 'error' ? 'alert' : 'status'}>
          <span>{notice.text}</span>
          <button type="button" className="icon" onClick={clearNotice} aria-label="Dismiss">
            ✕
          </button>
        </div>
      )}
    </>
  );
}
