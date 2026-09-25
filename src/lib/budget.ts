import type { Transaction } from '../types';
import { spendOf } from './aggregate';
import { addMonths, daysInMonth, monthKey, monthRange, parseMonthKey } from './dates';
import { bucketOf } from './filters';

export type BudgetDim = 'category' | 'bucket';

export interface Budget {
  id: string;
  dim: BudgetDim;
  /** Category or bucket name. */
  value: string;
  /** Monthly limit. */
  amount: number;
}

export type BudgetState = 'ok' | 'warn' | 'over';

export interface BudgetStatus {
  budget: Budget;
  spent: number;
  remaining: number;
  /** spent / amount (can exceed 1). */
  pct: number;
  /** Share of the month that has passed: 1 for past months, 0 for future ones. */
  elapsed: number;
  /** Days left in the month (0 once it's over). */
  daysLeft: number;
  /**
   * End-of-month spend at the current pace. Only for the current month, once
   * enough of it has passed, and only when spending is spread over several
   * transactions: a single rent or bill payment isn't a "pace".
   */
  projected: number | null;
  state: BudgetState;
}

const round2 = (v: number) => Math.round(v * 100) / 100;

export const budgetMatches = (t: Transaction, dim: BudgetDim, value: string) =>
  t.kind === 'expense' && (dim === 'category' ? t.category === value : bucketOf(t) === value);

export function findBudget(budgets: Budget[], dim: BudgetDim, value: string): Budget | undefined {
  return budgets.find((b) => b.dim === dim && b.value === value);
}

/** Where the month stands on `today`: fraction elapsed and days left. */
export function monthProgress(month: string, today: Date): { elapsed: number; daysLeft: number } {
  const current = monthKey(today.getFullYear(), today.getMonth() + 1);
  const { year, month: m } = parseMonthKey(month);
  const days = daysInMonth(year, m);
  if (month < current) return { elapsed: 1, daysLeft: 0 };
  if (month > current) return { elapsed: 0, daysLeft: days };
  const day = today.getDate();
  return { elapsed: day / days, daysLeft: days - day };
}

/** Transactions needed in a month before its spending counts as spread out (so pace means something). */
const MIN_FOR_PACE = 3;

/**
 * Spending against each budget for one month. Refunds net against spend.
 * "over" once the limit is passed. "At risk" (warn) while the month is still
 * running and either the current pace would overshoot, or 90% is already
 * used; both only for spread-out spending (see MIN_FOR_PACE), so a bill paid
 * in full on the 1st is simply "on track".
 */
export function budgetStatuses(txns: Transaction[], budgets: Budget[], month: string, today: Date): BudgetStatus[] {
  const { elapsed, daysLeft } = monthProgress(month, today);
  const rows = txns.filter((t) => !t.future && t.month === month);
  return budgets.map((budget) => {
    const matching = rows.filter((t) => budgetMatches(t, budget.dim, budget.value));
    const spent = round2(matching.reduce((s, t) => s + spendOf(t), 0));
    const pct = budget.amount > 0 ? spent / budget.amount : spent > 0 ? Infinity : 0;
    const spread = matching.length >= MIN_FOR_PACE;
    const running = elapsed > 0 && elapsed < 1;
    const projected = spread && running && elapsed > 0.15 ? round2(spent / elapsed) : null;
    const state: BudgetState =
      spent > budget.amount + 0.005
        ? 'over'
        : (projected !== null && projected > budget.amount) || (spread && running && pct >= 0.9)
          ? 'warn'
          : 'ok';
    return { budget, spent, remaining: round2(budget.amount - spent), pct, elapsed, daysLeft, projected, state };
  });
}

/**
 * A sensible starting limit: the median monthly spend over the last few
 * complete months (before `month`), rounded up to the next €10.
 */
export function suggestBudget(txns: Transaction[], dim: BudgetDim, value: string, month: string, historyMonths = 6): number {
  const first = txns.reduce((min, t) => (t.month < min ? t.month : min), month);
  const from = [first, addMonths(month, -historyMonths)].sort()[1];
  const to = addMonths(month, -1);
  if (from > to) return 0;
  const totals = monthRange(from, to).map((m) =>
    txns.filter((t) => !t.future && t.month === m && budgetMatches(t, dim, value)).reduce((s, t) => s + spendOf(t), 0),
  );
  const sorted = [...totals].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  const med = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return med > 0 ? Math.ceil(med / 10) * 10 : 0;
}

/** Number of calendar months spanned by some rows (for scaling a monthly budget to a period). */
export function monthsSpanned(txns: Transaction[]): number {
  if (!txns.length) return 0;
  let min = txns[0].month;
  let max = txns[0].month;
  for (const t of txns) {
    if (t.month < min) min = t.month;
    if (t.month > max) max = t.month;
  }
  return monthRange(min, max).length;
}
