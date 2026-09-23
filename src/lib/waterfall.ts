import type { Kind, Transaction } from '../types';
import { incomeOf, monthlyTotals, spendBy } from './aggregate';
import { monthLabel } from './dates';

export type StepKind = 'increase' | 'decrease' | 'total';

export interface WaterfallStep {
  key: string;
  label: string;
  kind: StepKind;
  /** Signed change for increase/decrease steps; the running value for totals. */
  value: number;
  /** Bar spans start..end on the value axis (totals start at 0). */
  start: number;
  end: number;
  /** Which rows the step stands for, for drill-down and "peek". Null for totals. */
  source: { dim: 'merchant' | 'category' | 'month'; values: string[]; kind: Kind | null } | null;
  /** Consecutive steps sharing a group sit together under one axis label (e.g. a month's in + out). */
  group?: string;
  groupLabel?: string;
}

const round2 = (v: number) => Math.round(v * 100) / 100;

/** Running-total helper: turns signed deltas into floating steps. */
function accumulate(
  deltas: (Pick<WaterfallStep, 'key' | 'label' | 'value' | 'source'> & Partial<Pick<WaterfallStep, 'group' | 'groupLabel'>>)[],
  startAt: number,
): { steps: WaterfallStep[]; end: number } {
  let run = startAt;
  const steps = deltas.map((d) => {
    const start = run;
    run = round2(run + d.value);
    return { ...d, value: round2(d.value), kind: (d.value >= 0 ? 'increase' : 'decrease') as StepKind, start, end: run };
  });
  return { steps, end: run };
}

const total = (key: string, label: string, value: number): WaterfallStep => ({
  key,
  label,
  kind: 'total',
  value: round2(value),
  start: 0,
  end: round2(value),
  source: null,
});

/** Keep the largest `max` groups and fold the rest into one "Other …" step. */
function topWithOther<T extends { key: string; amount: number }>(groups: T[], max: number, otherLabel: string) {
  if (groups.length <= max) return { head: groups, rest: [] as T[], otherLabel };
  return { head: groups.slice(0, max), rest: groups.slice(max), otherLabel: `${otherLabel} (${groups.length - max})` };
}

export interface CategoryWaterfallOptions {
  /** Income sources shown individually before folding into "Other income". */
  maxIncome?: number;
  /** Spending categories shown individually before folding into "Other spending". */
  maxCategories?: number;
}

/**
 * Income sources step up to Total income; spending categories step down
 * (largest first) to Net savings. A category that is net positive (refunds
 * exceed spending) steps up instead.
 */
export function categoryWaterfall(txns: Transaction[], { maxIncome = 4, maxCategories = 10 }: CategoryWaterfallOptions = {}): WaterfallStep[] {
  const incomeBy = new Map<string, number>();
  for (const t of txns) if (t.kind === 'income') incomeBy.set(t.merchant, (incomeBy.get(t.merchant) ?? 0) + incomeOf(t));
  const incomes = [...incomeBy.entries()]
    .map(([key, amount]) => ({ key, amount }))
    .filter((g) => g.amount !== 0)
    .sort((a, b) => b.amount - a.amount);
  const spends = spendBy(txns, (t) => t.category)
    .filter((g) => g.spend !== 0)
    .map((g) => ({ key: g.key, amount: g.spend }));
  if (!incomes.length && !spends.length) return [];

  const inc = topWithOther(incomes, maxIncome, 'Other income');
  const incomeDeltas = [
    ...inc.head.map((g) => ({ key: `in|${g.key}`, label: g.key, value: g.amount, source: { dim: 'merchant' as const, values: [g.key], kind: 'income' as const } })),
    ...(inc.rest.length
      ? [{
          key: 'in|__other__',
          label: inc.otherLabel,
          value: inc.rest.reduce((s, g) => s + g.amount, 0),
          source: { dim: 'merchant' as const, values: inc.rest.map((g) => g.key), kind: 'income' as const },
        }]
      : []),
  ];
  const incomeRun = accumulate(incomeDeltas, 0);

  const sp = topWithOther(spends, maxCategories, 'Other spending');
  const spendDeltas = [
    ...sp.head.map((g) => ({ key: `out|${g.key}`, label: g.key, value: -g.amount, source: { dim: 'category' as const, values: [g.key], kind: 'expense' as const } })),
    ...(sp.rest.length
      ? [{
          key: 'out|__other__',
          label: sp.otherLabel,
          value: -sp.rest.reduce((s, g) => s + g.amount, 0),
          source: { dim: 'category' as const, values: sp.rest.map((g) => g.key), kind: 'expense' as const },
        }]
      : []),
  ];
  const spendRun = accumulate(spendDeltas, incomeRun.end);

  // With no income in view (e.g. drilled into one spending category) a "Total income: €0" bar is just noise.
  const incomeTotal = incomeRun.steps.length ? [total('total|income', 'Total income', incomeRun.end)] : [];
  return [...incomeRun.steps, ...incomeTotal, ...spendRun.steps, total('total|net', 'Net savings', spendRun.end)];
}

/** Each month's net savings stacked on the last, ending with the total saved over the period. */
export function monthlyWaterfall(txns: Transaction[]): WaterfallStep[] {
  const months = monthlyTotals(txns);
  if (!months.length) return [];
  const { steps, end } = accumulate(
    months.map((m) => ({ key: `m|${m.month}`, label: monthLabel(m.month), value: m.net, source: { dim: 'month' as const, values: [m.month], kind: null } })),
    0,
  );
  return [...steps, total('total|saved', 'Total saved', end)];
}

