import type { DataLoader } from '../hooks/useDataLoader';
import { useAppStore } from '../store/useAppStore';

export function EmptyState({ loader }: { loader: DataLoader }) {
  const sheet = useAppStore((s) => s.sheetSource);
  const setTab = useAppStore((s) => s.setTab);
  return (
    <div className="empty-state">
      <h1>See where your money goes</h1>
      <p>
        Drop a CSV export anywhere on this page, or use <strong>Load CSV</strong>. It's parsed in your browser and never leaves this machine.
      </p>
      <p className="muted">
        Expected columns (names are matched flexibly): <code>Date</code> or <code>Date (month)</code>, <code>Description</code>, <code>Amount</code> (or{' '}
        <code>Debit</code>/<code>Credit</code>), and optionally <code>Bank</code>/<code>Account</code>, <code>Type</code>/<code>Category</code>,{' '}
        <code>Spending Bucket</code>, <code>Currency</code>.
      </p>
      <div className="empty-actions">
        {loader.sheetsEnabled &&
          (sheet ? (
            <button type="button" className="primary" onClick={() => void loader.refreshSheet()} disabled={Boolean(loader.busy)}>
              {loader.busy ?? `Load ${sheet.title} › ${sheet.tab} from Google Sheets`}
            </button>
          ) : (
            <button type="button" className="primary" onClick={() => setTab('data')}>
              Connect a Google Sheet
            </button>
          ))}
        <button type="button" onClick={loader.loadDemo}>
          Try it with demo data
        </button>
      </div>
    </div>
  );
}
