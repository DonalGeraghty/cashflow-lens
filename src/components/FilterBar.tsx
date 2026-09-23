import { useAppStore } from '../store/useAppStore';
import { useData } from '../store/DataContext';
import { addMonths, monthLabel } from '../lib/dates';
import { isFiltered } from '../lib/filters';
import { MultiSelect } from './MultiSelect';

type Preset = 'all' | 'ytd' | '12m' | '6m' | '3m' | 'month' | 'custom';

/** Global filters: one row above everything, applied to every view at once. */
export function FilterBar() {
  const filters = useAppStore((s) => s.filters);
  const setFilters = useAppStore((s) => s.setFilters);
  const resetFilters = useAppStore((s) => s.resetFilters);
  const { options, hiddenFuture, currentMonth } = useData();
  const months = options.months;
  const last = months[months.length - 1] ?? currentMonth;
  const anchor = last < currentMonth ? last : currentMonth;

  const presetRange = (p: Preset): [string | null, string | null] => {
    switch (p) {
      case 'ytd':
        return [`${anchor.slice(0, 4)}-01`, null];
      case '12m':
        return [addMonths(anchor, -11), null];
      case '6m':
        return [addMonths(anchor, -5), null];
      case '3m':
        return [addMonths(anchor, -2), null];
      case 'month':
        return [anchor, anchor];
      default:
        return [null, null];
    }
  };
  const presets: { id: Preset; label: string }[] = [
    { id: 'all', label: 'All time' },
    { id: 'ytd', label: 'This year' },
    { id: '12m', label: 'Last 12 months' },
    { id: '6m', label: 'Last 6 months' },
    { id: '3m', label: 'Last 3 months' },
    { id: 'month', label: `This month (${monthLabel(anchor)})` },
  ];
  const current: Preset =
    presets.find(({ id }) => {
      const [f, t] = presetRange(id);
      return f === filters.from && t === filters.to;
    })?.id ?? 'custom';

  return (
    <div className="filterbar" role="region" aria-label="Filters">
      <label className="field">
        <span>Period</span>
        <select
          value={current}
          onChange={(e) => {
            const [from, to] = presetRange(e.target.value as Preset);
            setFilters({ from, to });
          }}
        >
          {presets.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
          {current === 'custom' && <option value="custom">Custom</option>}
        </select>
      </label>
      <label className="field">
        <span>From</span>
        <select value={filters.from ?? ''} onChange={(e) => setFilters({ from: e.target.value || null })}>
          <option value="">Start</option>
          {months.map((m) => (
            <option key={m} value={m} disabled={filters.to !== null && m > filters.to}>
              {monthLabel(m)}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>To</span>
        <select value={filters.to ?? ''} onChange={(e) => setFilters({ to: e.target.value || null })}>
          <option value="">Latest</option>
          {months.map((m) => (
            <option key={m} value={m} disabled={filters.from !== null && m < filters.from}>
              {monthLabel(m)}
            </option>
          ))}
        </select>
      </label>
      <MultiSelect label="Account" options={options.accounts} selected={filters.accounts} onChange={(accounts) => setFilters({ accounts })} />
      <MultiSelect label="Category" options={options.categories} selected={filters.categories} onChange={(categories) => setFilters({ categories })} />
      <MultiSelect label="Bucket" options={options.buckets} selected={filters.buckets} onChange={(buckets) => setFilters({ buckets })} />
      <label className="toggle" title="Rows dated after today, or marked as estimates with '?' or '(est)'">
        <input type="checkbox" checked={filters.includeFuture} onChange={(e) => setFilters({ includeFuture: e.target.checked })} />
        Show future &amp; estimates{!filters.includeFuture && hiddenFuture > 0 ? ` (${hiddenFuture} hidden)` : ''}
      </label>
      {isFiltered(filters) && (
        <button type="button" className="link" onClick={resetFilters}>
          Clear filters
        </button>
      )}
    </div>
  );
}
