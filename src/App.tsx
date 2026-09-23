import { useAppStore, type Tab, type Theme } from './store/useAppStore';
import { DataProvider, useData } from './store/DataContext';
import { useUrlSync } from './hooks/useUrlSync';
import { useTheme } from './hooks/useTheme';
import { Breadcrumbs } from './components/Breadcrumbs';
import { DataPanel } from './components/DataPanel';
import { EmptyState } from './components/EmptyState';
import { FileLoader } from './components/FileLoader';
import { SheetsSource } from './components/SheetsSource';
import { useDataLoader } from './hooks/useDataLoader';
import { FilterBar } from './components/FilterBar';
import { PeekDialog } from './components/PeekDialog';
import { RulesEditor } from './components/RulesEditor';
import { SummaryStrip } from './components/SummaryStrip';
import { TransactionTable } from './components/TransactionTable';
import { Dashboard } from './components/dashboard/Dashboard';
import { PivotView } from './components/pivot/PivotView';
import { WaterfallView } from './components/WaterfallView';
import { FlowView } from './components/FlowView';
import { Panel } from './components/Panel';

const TABS: { id: Tab; label: string }[] = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'transactions', label: 'Transactions' },
  { id: 'pivot', label: 'Pivot' },
  { id: 'waterfall', label: 'Waterfall' },
  { id: 'flow', label: 'Money flow' },
  { id: 'data', label: 'Data & rules' },
];

export function App() {
  useUrlSync();
  useTheme();
  return (
    <DataProvider>
      <Shell />
    </DataProvider>
  );
}

function Shell() {
  const tab = useAppStore((s) => s.tab);
  const setTab = useAppStore((s) => s.setTab);
  const hasData = useAppStore((s) => s.transactions.length > 0);
  const loader = useDataLoader();

  return (
    <div className="app" data-tab={tab}>
      <header className="topbar">
        <div className="brand">
          <svg viewBox="0 0 32 32" width="22" height="22" aria-hidden="true">
            <rect x="4" y="15" width="6" height="13" rx="1.5" className="fill-income" />
            <rect x="13" y="9" width="6" height="19" rx="1.5" className="fill-spend" />
            <rect x="22" y="4" width="6" height="24" rx="1.5" className="fill-s3" />
          </svg>
          Cashflow Lens
        </div>
        <nav className="tabs" role="tablist" aria-label="Views">
          {TABS.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </nav>
        <div className="top-actions">
          <FileLoader loader={loader} />
          <ThemeToggle />
        </div>
      </header>

      {hasData && tab !== 'data' && (
        <div className="sticky-controls">
          <FilterBar />
          <Breadcrumbs />
        </div>
      )}

      <main>
        {tab === 'data' ? (
          <div className="stack">
            <SheetsSource loader={loader} />
            <DataPanel />
            <RulesEditor />
          </div>
        ) : !hasData ? (
          <EmptyState loader={loader} />
        ) : (
          <>
            <SummaryStrip />
            {tab === 'dashboard' && <Dashboard />}
            {tab === 'transactions' && <TransactionsTab />}
            {tab === 'pivot' && <PivotView />}
            {tab === 'waterfall' && <WaterfallView />}
            {tab === 'flow' && <FlowView />}
          </>
        )}
      </main>
      <PeekDialog />
    </div>
  );
}

function TransactionsTab() {
  const { filtered, currency } = useData();
  return (
    <Panel title="Transactions" subtitle="Everything matching the filters and drill path above.">
      <TransactionTable rows={filtered} currency={currency} />
    </Panel>
  );
}

function ThemeToggle() {
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);
  return (
    <select className="theme" value={theme} onChange={(e) => setTheme(e.target.value as Theme)} aria-label="Colour theme">
      <option value="system">Auto theme</option>
      <option value="light">Light</option>
      <option value="dark">Dark</option>
    </select>
  );
}
