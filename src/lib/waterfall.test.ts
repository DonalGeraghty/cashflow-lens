import { describe, expect, it } from 'vitest';
import { categoryWaterfall, monthlyWaterfall } from './waterfall';
import { tx } from './testUtils';

const data = [
  tx({ month: '2026-01', category: 'Income', merchant: 'Paycheck', amount: 3000, kind: 'income' }),
  tx({ month: '2026-01', category: 'Income', merchant: 'Dad', amount: 400, kind: 'income' }),
  tx({ month: '2026-01', category: 'Mortgage', merchant: 'Bank', amount: -1300 }),
  tx({ month: '2026-01', category: 'Food', merchant: 'Tesco', amount: -200 }),
  tx({ month: '2026-02', category: 'Income', merchant: 'Paycheck', amount: 3000, kind: 'income' }),
  tx({ month: '2026-02', category: 'Food', merchant: 'Spar', amount: -150 }),
  tx({ month: '2026-02', category: 'Gym', merchant: 'Gym', amount: -50 }),
  // Refund bigger than spend: the category steps up.
  tx({ month: '2026-02', category: 'Health', merchant: 'Vhi', amount: 60, kind: 'expense' }),
];

describe('categoryWaterfall', () => {
  const steps = categoryWaterfall(data);

  it('steps income up to a total, then spending down to net savings', () => {
    expect(steps.map((s) => [s.label, s.kind, s.start, s.end])).toEqual([
      ['Paycheck', 'increase', 0, 6000],
      ['Dad', 'increase', 6000, 6400],
      ['Total income', 'total', 0, 6400],
      ['Mortgage', 'decrease', 6400, 5100],
      ['Food', 'decrease', 5100, 4750],
      ['Gym', 'decrease', 4750, 4700],
      ['Health', 'increase', 4700, 4760],
      ['Net savings', 'total', 0, 4760],
    ]);
  });

  it('net savings equals income minus spending', () => {
    const net = steps[steps.length - 1];
    expect(net.value).toBe(6400 - 1300 - 350 - 50 + 60);
  });

  it('records what each step stands for (for drill/peek); totals have none', () => {
    expect(steps[0].source).toEqual({ dim: 'merchant', values: ['Paycheck'], kind: 'income' });
    expect(steps[3].source).toEqual({ dim: 'category', values: ['Mortgage'], kind: 'expense' });
    expect(steps[2].source).toBeNull();
  });

  it('folds the tail into Other', () => {
    const s = categoryWaterfall(data, { maxIncome: 1, maxCategories: 2 });
    expect(s.map((x) => x.label)).toEqual(['Paycheck', 'Other income (1)', 'Total income', 'Mortgage', 'Food', 'Other spending (2)', 'Net savings']);
    const other = s.find((x) => x.key === 'out|__other__')!;
    expect(other.value).toBe(10); // -50 gym + 60 refund
    expect(other.source!.values).toEqual(['Gym', 'Health']);
    expect(s[s.length - 1].end).toBe(4760);
  });

  it('skips the income total when there is no income', () => {
    const s = categoryWaterfall(data.filter((t) => t.kind === 'expense'));
    expect(s.map((x) => x.label)).toEqual(['Mortgage', 'Food', 'Gym', 'Health', 'Net savings']);
    expect(s[s.length - 1].end).toBe(-1300 - 350 - 50 + 60);
  });

  it('is empty with no data', () => {
    expect(categoryWaterfall([])).toEqual([]);
  });
});

describe('monthlyWaterfall', () => {
  it('accumulates monthly net and ends with the total saved', () => {
    const txns = [
      tx({ month: '2026-01', category: 'Income', amount: 1000, kind: 'income' }),
      tx({ month: '2026-01', amount: -400 }),
      tx({ month: '2026-03', amount: -900 }),
    ];
    expect(monthlyWaterfall(txns).map((s) => [s.label, s.kind, s.value, s.start, s.end])).toEqual([
      ['Jan 2026', 'increase', 600, 0, 600],
      ['Feb 2026', 'increase', 0, 600, 600],
      ['Mar 2026', 'decrease', -900, 600, -300],
      ['Total saved', 'total', -300, 0, -300],
    ]);
  });
});
