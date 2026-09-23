import type { Kind, Transaction } from '../types';
import { addMonths } from './dates';

export interface RecurringItem {
  merchant: string;
  category: string;
  kind: Kind;
  /** Median monthly amount (positive) across months that fit the pattern. */
  typical: number;
  /** Months the payment appeared in, sorted. */
  months: string[];
  /** Monthly totals (positive) keyed by month. */
  amounts: Record<string, number>;
  /** Longest run of consecutive months with a consistent amount. */
  streak: number;
  first: string;
  last: string;
  /** Seen in the latest month of the data or the one before. */
  active: boolean;
  annualised: number;
  /** Relative change from the first to the latest in-pattern amount (0.1 = +10%). */
  change: number;
}

export interface RecurringOptions {
  /** Minimum consecutive months to count as recurring. */
  minStreak?: number;
  /** How far a month's total may stray from the median and still fit (0.2 = ±20%). */
  tolerance?: number;
  /** Median payments per month above this isn't a subscription (e.g. groceries). */
  maxPerMonth?: number;
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

/**
 * Detect recurring payments from month-level data.
 *
 * For each merchant (split by income/expense) we total the amount per month.
 * It counts as recurring when payments are few per month, most monthly totals
 * sit within `tolerance` of the median, and those consistent months form a
 * run of at least `minStreak` consecutive months.
 */
export function detectRecurring(txns: Transaction[], opts: RecurringOptions = {}): RecurringItem[] {
  const { minStreak = 3, tolerance = 0.2, maxPerMonth = 2 } = opts;
  if (!txns.length) return [];
  const latest = txns.reduce((max, t) => (t.month > max ? t.month : max), txns[0].month);

  const groups = new Map<string, Transaction[]>();
  for (const t of txns) {
    if (t.amount === 0) continue;
    const key = `${t.kind}\u0000${t.merchant}`;
    let g = groups.get(key);
    if (!g) groups.set(key, (g = []));
    g.push(t);
  }

  const out: RecurringItem[] = [];
  for (const g of groups.values()) {
    const perMonth = new Map<string, { total: number; count: number }>();
    for (const t of g) {
      const m = perMonth.get(t.month) ?? { total: 0, count: 0 };
      m.total += Math.abs(t.amount);
      m.count++;
      perMonth.set(t.month, m);
    }
    if (perMonth.size < minStreak) continue;
    if (median([...perMonth.values()].map((m) => m.count)) > maxPerMonth) continue;

    const med = median([...perMonth.values()].map((m) => m.total));
    const fits = [...perMonth.entries()]
      .filter(([, m]) => Math.abs(m.total - med) <= tolerance * med)
      .map(([month]) => month)
      .sort();
    if (fits.length / perMonth.size < 0.6) continue;

    let streak = 1;
    let run = 1;
    for (let i = 1; i < fits.length; i++) {
      run = fits[i] === addMonths(fits[i - 1], 1) ? run + 1 : 1;
      streak = Math.max(streak, run);
    }
    if (streak < minStreak) continue;

    const months = [...perMonth.keys()].sort();
    const amounts = Object.fromEntries(months.map((m) => [m, Math.round(perMonth.get(m)!.total * 100) / 100]));
    const typical = Math.round(median(fits.map((m) => perMonth.get(m)!.total)) * 100) / 100;
    const firstAmt = perMonth.get(fits[0])!.total;
    const lastAmt = perMonth.get(fits[fits.length - 1])!.total;
    const categories = new Map<string, number>();
    for (const t of g) categories.set(t.category, (categories.get(t.category) ?? 0) + 1);

    out.push({
      merchant: g[0].merchant,
      category: [...categories.entries()].sort((a, b) => b[1] - a[1])[0][0],
      kind: g[0].kind,
      typical,
      months,
      amounts,
      streak,
      first: months[0],
      last: months[months.length - 1],
      active: months[months.length - 1] >= addMonths(latest, -1),
      annualised: Math.round(typical * 12 * 100) / 100,
      change: firstAmt ? (lastAmt - firstAmt) / firstAmt : 0,
    });
  }
  return out.sort((a, b) => (a.kind === b.kind ? b.annualised - a.annualised : a.kind === 'expense' ? -1 : 1));
}
