import type { useCsvLoader } from './FileLoader';

export function EmptyState({ loader }: { loader: ReturnType<typeof useCsvLoader> }) {
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
      <button type="button" onClick={loader.loadDemo}>
        Try it with demo data
      </button>
    </div>
  );
}
