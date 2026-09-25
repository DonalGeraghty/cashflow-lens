import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import type { Transaction } from '../types';
import { enrich } from '../lib/categorise';
import { applyFilters, bucketOf } from '../lib/filters';
import { applyDrill } from '../lib/drill';
import { orderBuckets } from '../lib/aggregate';
import { monthKey } from '../lib/dates';
import { useAppStore } from './useAppStore';

export interface DerivedData {
  /** Every row after rules, including future ones. */
  all: Transaction[];
  /** Global filters + drill path: what every view shows. */
  filtered: Transaction[];
  /**
   * Global filters + drill, but ignoring the date range and any year/month
   * drill. Trend views (month-over-month, recurring) need neighbouring months.
   */
  context: Transaction[];
  byId: Map<string, Transaction>;
  options: { accounts: string[]; categories: string[]; buckets: string[]; months: string[] };
  /** Rows hidden because they're in the future or estimates. */
  hiddenFuture: number;
  currentMonth: string;
  /** "Now" for the session (fixed at load, so projections don't shift mid-session). */
  today: Date;
  /** Dominant currency, used for formatting. */
  currency: string;
}

const DataContext = createContext<DerivedData | null>(null);

/**
 * Computes derived data once per state change and shares it, so every chart,
 * the summary, the table and the pivot read the same filtered rows.
 */
export function DataProvider({ children }: { children: ReactNode }) {
  const transactions = useAppStore((s) => s.transactions);
  const rules = useAppStore((s) => s.rules);
  const override = useAppStore((s) => s.rulesOverride);
  const filters = useAppStore((s) => s.filters);
  const drill = useAppStore((s) => s.drill);
  const [today] = useState(() => new Date());

  const all = useMemo(() => enrich(transactions, rules, { override, today }), [transactions, rules, override, today]);

  const value = useMemo<DerivedData>(() => {
    const visible = filters.includeFuture ? all : all.filter((t) => !t.future);
    const sorted = (xs: Iterable<string>) => [...new Set(xs)].sort((a, b) => a.localeCompare(b));
    const currencies = new Map<string, number>();
    for (const t of all) currencies.set(t.currency, (currencies.get(t.currency) ?? 0) + 1);
    return {
      all,
      filtered: applyDrill(applyFilters(all, filters), drill),
      context: applyDrill(
        applyFilters(all, filters, { ignoreDate: true }),
        drill.filter((s) => s.dim !== 'year' && s.dim !== 'month'),
      ),
      byId: new Map(all.map((t) => [t.id, t])),
      options: {
        accounts: sorted(visible.map((t) => t.account)),
        categories: sorted(visible.map((t) => t.category)),
        buckets: orderBuckets(visible.map(bucketOf)),
        months: sorted(visible.map((t) => t.month)),
      },
      hiddenFuture: filters.includeFuture ? 0 : all.length - visible.length,
      currentMonth: monthKey(today.getFullYear(), today.getMonth() + 1),
      today,
      currency: [...currencies.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'EUR',
    };
  }, [all, filters, drill, today]);

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): DerivedData {
  const v = useContext(DataContext);
  if (!v) throw new Error('useData must be used inside <DataProvider>');
  return v;
}
