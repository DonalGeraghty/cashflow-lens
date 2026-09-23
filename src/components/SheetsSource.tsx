import { useEffect, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import type { DataLoader } from '../hooks/useDataLoader';
import { parseSheetUrl, pickDefaultTab, type SheetMeta } from '../lib/sheets';
import { preloadGoogleAuth, signOutGoogle } from '../lib/googleAuth';
import { Panel } from './Panel';

/** Connect a Google Sheet (read-only), pick the tab, and refresh it on demand. */
export function SheetsSource({ loader }: { loader: DataLoader }) {
  const sheet = useAppStore((s) => s.sheetSource);
  const report = useAppStore((s) => s.report);
  const setSheetSource = useAppStore((s) => s.setSheetSource);
  const { sheetsEnabled, connectSheet, loadSheet, refreshSheet, busy } = loader;

  const [editing, setEditing] = useState(false);
  const [url, setUrl] = useState('');
  const [meta, setMeta] = useState<SheetMeta | null>(null);
  const [tab, setTab] = useState('');

  // Load Google's sign-in script up front, so the popup opens straight from the click.
  useEffect(() => {
    if (sheetsEnabled) preloadGoogleAuth().catch(() => {});
  }, [sheetsEnabled]);

  if (!sheetsEnabled) {
    return (
      <Panel title="Google Sheets" subtitle="Load straight from your spreadsheet instead of exporting a CSV.">
        <p className="muted">
          Not set up yet. Create a Google OAuth client ID, put it in a <code>.env</code> file as <code>VITE_GOOGLE_CLIENT_ID=…</code>, and restart{' '}
          <code>npm run dev</code> (or rebuild the Docker image). The README has step-by-step instructions under <strong>Google Sheets</strong>.
        </p>
      </Panel>
    );
  }

  const spreadsheetId = parseSheetUrl(url);
  const lastLoaded = report?.source === 'sheets' ? new Date(report.loadedAt).toLocaleString('en-IE') : null;
  const showForm = editing || !sheet;

  const connect = async () => {
    if (!spreadsheetId) return;
    const m = await connectSheet(spreadsheetId);
    if (m) {
      setMeta(m);
      setTab(pickDefaultTab(m.tabs, sheet?.spreadsheetId === m.id ? sheet.tab : null) ?? '');
    }
  };
  const load = async () => {
    if (!meta || !tab) return;
    if (await loadSheet(meta.id, tab, meta.title)) {
      setEditing(false);
      setMeta(null);
      setUrl('');
    }
  };

  return (
    <Panel
      title="Google Sheets"
      subtitle="Read-only. Data goes straight from Google to this browser; the sign-in token is kept in memory only."
      controls={
        sheet && !showForm ? (
          <>
            <button type="button" className="primary" onClick={() => void refreshSheet()} disabled={Boolean(busy)}>
              {busy ?? '↻ Refresh from sheet'}
            </button>
            <button type="button" onClick={() => setEditing(true)} disabled={Boolean(busy)}>
              Change sheet or tab
            </button>
            <button
              type="button"
              onClick={() => {
                if (confirm('Disconnect this Google Sheet? The data already loaded stays until you load something else.')) {
                  setSheetSource(null);
                  signOutGoogle();
                }
              }}
            >
              Disconnect
            </button>
          </>
        ) : undefined
      }
    >
      {sheet && !showForm && (
        <dl className="report-stats">
          <div>
            <dt>Spreadsheet</dt>
            <dd>
              <a href={`https://docs.google.com/spreadsheets/d/${sheet.spreadsheetId}/edit`} target="_blank" rel="noreferrer noopener">
                {sheet.title}
              </a>
            </dd>
          </div>
          <div>
            <dt>Tab</dt>
            <dd>{sheet.tab}</dd>
          </div>
          <div>
            <dt>Last loaded from it</dt>
            <dd>{lastLoaded ?? 'Not since the last CSV load'}</dd>
          </div>
        </dl>
      )}

      {showForm && (
        <div className="sheet-form">
          <label className="field-block">
            <span>Sheet URL or ID</span>
            <input
              type="text"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setMeta(null);
              }}
              placeholder="https://docs.google.com/spreadsheets/d/…"
              spellCheck={false}
              aria-invalid={url.trim() !== '' && !spreadsheetId}
            />
            {url.trim() !== '' && !spreadsheetId && <span className="field-error">That doesn’t look like a Google Sheets link.</span>}
          </label>
          <div className="sheet-actions">
            <button type="button" className={meta ? '' : 'primary'} onClick={() => void connect()} disabled={!spreadsheetId || Boolean(busy)}>
              {busy && !meta ? busy : meta ? 'Reconnect' : 'Connect'}
            </button>
            {meta && (
              <>
                <label className="field">
                  <span>Tab in “{meta.title}”</span>
                  <select value={tab} onChange={(e) => setTab(e.target.value)}>
                    {meta.tabs.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </label>
                <button type="button" className="primary" onClick={() => void load()} disabled={!tab || Boolean(busy)}>
                  {busy ?? 'Load this tab'}
                </button>
              </>
            )}
            {sheet && (
              <button
                type="button"
                className="link"
                onClick={() => {
                  setEditing(false);
                  setMeta(null);
                }}
              >
                Cancel
              </button>
            )}
          </div>
          <p className="muted small">
            Google will ask you to sign in and allow read-only access to your spreadsheets. The first row of the tab must be the header, with the same
            columns as your CSV export.
          </p>
        </div>
      )}
    </Panel>
  );
}
