import { describe, expect, it } from 'vitest';
import { addMonths } from './dates';
import { detectRecurring } from './recurring';
import { tx } from './testUtils';

const months = (n: number, start = '2026-01') => Array.from({ length: n }, (_, i) => addMonths(start, i));

describe('detectRecurring', () => {
  it('finds a monthly subscription and a price rise', () => {
    const txns = months(6).map((m, i) => tx({ month: m, merchant: 'Netflix', category: 'Subscriptions', amount: i < 3 ? -10.99 : -12.99 }));
    const [item] = detectRecurring(txns);
    expect(item).toMatchObject({ merchant: 'Netflix', kind: 'expense', streak: 6, active: true, first: '2026-01', last: '2026-06' });
    expect(item.typical).toBeCloseTo(11.99, 1);
    expect(item.change).toBeCloseTo((12.99 - 10.99) / 10.99);
  });

  it('ignores frequent, variable spending like groceries', () => {
    const txns = months(6).flatMap((m) => [5, 12, 30, 44, 8].map((a) => tx({ month: m, merchant: 'Spar', amount: -a })));
    expect(detectRecurring(txns)).toEqual([]);
  });

  it('needs enough consecutive months', () => {
    const txns = ['2026-01', '2026-03', '2026-05', '2026-07'].map((m) => tx({ month: m, merchant: 'Gym', amount: -40 }));
    expect(detectRecurring(txns)).toEqual([]);
  });

  it('sums split payments within a month (4 x 100 = 400)', () => {
    const txns = [
      ...months(3).map((m) => tx({ month: m, merchant: 'Dad', category: 'Income', amount: 400 })),
      ...[1, 2, 3, 4].map(() => tx({ month: '2026-04', merchant: 'Dad', category: 'Income', amount: 100 })),
    ];
    const [item] = detectRecurring(txns, { maxPerMonth: 4 });
    expect(item).toMatchObject({ merchant: 'Dad', kind: 'income', streak: 4, typical: 400 });
  });

  it('marks lapsed subscriptions inactive and sorts expenses first by annual cost', () => {
    const txns = [
      ...months(3).map((m) => tx({ month: m, merchant: 'Old Sub', amount: -5 })),
      ...months(8).map((m) => tx({ month: m, merchant: 'Rent', amount: -1000 })),
      ...months(8).map((m) => tx({ month: m, merchant: 'Salary', category: 'Income', amount: 3000 })),
    ];
    const out = detectRecurring(txns);
    expect(out.map((r) => r.merchant)).toEqual(['Rent', 'Old Sub', 'Salary']);
    expect(out.find((r) => r.merchant === 'Old Sub')!.active).toBe(false);
    expect(out[0].annualised).toBe(12000);
  });

  it('tolerates the odd outlier month', () => {
    const amounts = [50, 50, 50, 200, 50, 50];
    const txns = months(6).map((m, i) => tx({ month: m, merchant: 'Electric', amount: -amounts[i] }));
    expect(detectRecurring(txns)[0]).toMatchObject({ merchant: 'Electric', typical: 50, streak: 3 });
  });
});
