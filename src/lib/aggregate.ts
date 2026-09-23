import type { Transaction } from '../types';
import { addMonths, monthRange } from './dates';
import { bucketOf } from './filters';

/** Money out. Refunds (positive amounts on spending rows) come out negative, so they net. */
export const spendOf = (t: Transaction): number => (t.kind === 'expense' ? -t.amount : 0);
export const incomeOf = (t: Transaction): number => (t.kind === 'income' ? t.amount : 0);

const round2 = (v: number) => Math.round(v * 100) / 100;

export interface MonthTotals {
  month: string;
  income: number;
  spend: number;
  net: number;
}

/** Per-month income, spend and net. Gaps between the first and last month are filled with zeros. */
export function monthlyTotals(txns: Transaction[]): MonthTotals[] {
  const by = new Map<string, MonthTotals>();
  for (const t of txns) {
    let m = by.get(t.month);
    if (!m) by.set(t.month, (m = { month: t.month, income: 0, spend: 0, net: 0 }));
    m.income += incomeOf(t);
    m.spend += spendOf(t);
  }
  if (!by.size) return [];
  const keys = [...by.keys()].sort();
  return monthRange(keys[0], keys[keys.length - 1]).map((month) => {
    const m = by.get(month) ?? { month, income: 0, spend: 0, net: 0 };
    return { month, income: round2(m.income), spend: round2(m.spend), net: round2(m.income - m.spend) };
  });
}

export interface Summary {
  income: number;
  spend: number;
  net: number;
  /** net / income, or null when there is no income. */
  savingsRate: number | null;
  count: number;
  byBucket: { bucket: string; spend: number }[];
}

export function summarise(txns: Transaction[]): Summary {
  let income = 0;
  let spend = 0;
  const buckets = new Map<string, number>();
  for (const t of txns) {
    income += incomeOf(t);
    const s = spendOf(t);
    spend += s;
    if (t.kind === 'expense') buckets.set(bucketOf(t), (buckets.get(bucketOf(t)) ?? 0) + s);
  }
  const net = income - spend;
  return {
    income: round2(income),
    spend: round2(spend),
    net: round2(net),
    savingsRate: income > 0 ? net / income : null,
    count: txns.length,
    byBucket: orderBuckets([...buckets.keys()]).map((bucket) => ({ bucket, spend: round2(buckets.get(bucket)!) })),
  };
}

export interface KeyTotal {
  key: string;
  spend: number;
  count: number;
}

/** Net spend grouped by a key, largest first. Income rows are ignored. */
export function spendBy(txns: Transaction[], keyOf: (t: Transaction) => string): KeyTotal[] {
  const by = new Map<string, KeyTotal>();
  for (const t of txns) {
    if (t.kind !== 'expense') continue;
    const key = keyOf(t);
    let g = by.get(key);
    if (!g) by.set(key, (g = { key, spend: 0, count: 0 }));
    g.spend += spendOf(t);
    g.count++;
  }
  return [...by.values()]
    .map((g) => ({ ...g, spend: round2(g.spend) }))
    .sort((a, b) => b.spend - a.spend || a.key.localeCompare(b.key));
}

/** Top-N merchants by spend; everything past N folds into one "Other" entry. */
export function topMerchants(txns: Transaction[], n: number): { items: KeyTotal[]; other: KeyTotal | null } {
  const all = spendBy(txns, (t) => t.merchant).filter((m) => m.spend !== 0);
  const items = all.slice(0, n);
  const rest = all.slice(n);
  const other = rest.length
    ? { key: `Other (${rest.length})`, spend: round2(rest.reduce((s, r) => s + r.spend, 0)), count: rest.reduce((s, r) => s + r.count, 0) }
    : null;
  return { items, other };
}

export interface CategoryChange {
  category: string;
  current: number;
  previous: number;
  /** Mean of the (up to) three months before `month` that fall inside the data. */
  avg3: number;
  deltaPrev: number;
  deltaAvg: number;
}

/** Spend per category in `month` compared with the month before and the trailing 3-month average. */
export function categoryChanges(txns: Transaction[], month: string): CategoryChange[] {
  const firstMonth = txns.reduce((min, t) => (t.month < min ? t.month : min), month);
  const prior = [1, 2, 3].map((i) => addMonths(month, -i)).filter((m) => m >= firstMonth);
  const prev = addMonths(month, -1);
  const byCat = new Map<string, Map<string, number>>();
  for (const t of txns) {
    if (t.kind !== 'expense') continue;
    let m = byCat.get(t.category);
    if (!m) byCat.set(t.category, (m = new Map()));
    m.set(t.month, (m.get(t.month) ?? 0) + spendOf(t));
  }
  const out: CategoryChange[] = [];
  for (const [category, m] of byCat) {
    const current = m.get(month) ?? 0;
    const previous = m.get(prev) ?? 0;
    const avg3 = prior.length ? prior.reduce((s, k) => s + (m.get(k) ?? 0), 0) / prior.length : 0;
    if (current === 0 && previous === 0 && avg3 === 0) continue;
    out.push({
      category,
      current: round2(current),
      previous: round2(previous),
      avg3: round2(avg3),
      deltaPrev: round2(current - previous),
      deltaAvg: round2(current - avg3),
    });
  }
  return out;
}

const BUCKET_ORDER = ['Fixed Essential', 'Variable Essential', 'Discretionary', 'Other'];

export function orderBuckets(buckets: string[]): string[] {
  const rank = (b: string) => {
    const i = BUCKET_ORDER.indexOf(b);
    return i < 0 ? BUCKET_ORDER.length : i;
  };
  return [...new Set(buckets)].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

export interface BucketMonth {
  month: string;
  values: Record<string, number>;
}

/** Spend per bucket per month (gap months filled), for a stacked chart. */
export function bucketMonthly(txns: Transaction[]): { months: BucketMonth[]; buckets: string[] } {
  const expenses = txns.filter((t) => t.kind === 'expense');
  if (!expenses.length) return { months: [], buckets: [] };
  const buckets = orderBuckets(expenses.map(bucketOf));
  const by = new Map<string, Record<string, number>>();
  for (const t of expenses) {
    let v = by.get(t.month);
    if (!v) by.set(t.month, (v = Object.fromEntries(buckets.map((b) => [b, 0]))));
    v[bucketOf(t)] += spendOf(t);
  }
  const keys = [...by.keys()].sort();
  const months = monthRange(keys[0], keys[keys.length - 1]).map((month) => {
    const v = by.get(month) ?? Object.fromEntries(buckets.map((b) => [b, 0]));
    return { month, values: Object.fromEntries(Object.entries(v).map(([k, n]) => [k, round2(n)])) };
  });
  return { months, buckets };
}
