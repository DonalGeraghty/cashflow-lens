import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import type { DataLoader } from '../hooks/useDataLoader';

/** "Load CSV" button plus a full-window drop target. */
export function FileLoader({ loader }: { loader: DataLoader }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const { loadFile, notice, clearNotice, busy, refreshSheet, sheetsEnabled } = loader;
  const sheet = useAppStore((st) => st.sheetSource);

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
      {sheetsEnabled && sheet && (
        <button type="button" onClick={() => void refreshSheet()} disabled={Boolean(busy)} title={`Reload ${sheet.title} › ${sheet.tab} from Google Sheets`}>
          {busy ?? '↻ Refresh sheet'}
        </button>
      )}
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
