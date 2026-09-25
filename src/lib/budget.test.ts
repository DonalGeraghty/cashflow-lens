import { describe, expect, it } from 'vitest';
import { type Budget, budgetStatuses, findBudget, monthProgress, monthsSpanned, suggestBudget } from './budget';
import { tx } from './testUtils';

const today = new Date(2026, 8, 21); // 21 Sep 2026 (30-day month → 9 days left)
const food: Budget = { id: 'b1', dim: 'category', value: 'Food', amount: 350 };
const disc: Budget = { id: 'b2', dim: 'bucket', value: 'Discretionary', amount: 200 };

describe('monthProgress', () => {
  it('knows how far through the month we are', () => {
    expect(monthProgress('2026-09', today)).toEqual({ elapsed: 21 / 30, daysLeft: 9 });
    expect(monthProgress('2026-08', today)).toEqual({ elapsed: 1, daysLeft: 0 });
    expect(monthProgress('2026-10', today)).toEqual({ elapsed: 0, daysLeft: 31 });
  });
});

describe('budgetStatuses', () => {
  const txns = [
    tx({ month: '2026-09', category: 'Food', amount: -200 }),
    tx({ month: '2026-09', category: 'Food', amount: -112 }),
    tx({ month: '2026-09', category: 'Food', amount: 20, kind: 'expense' }), // refund
    tx({ month: '2026-09', category: 'Social', bucket: 'Discretionary', amount: -150 }),
    tx({ month: '2026-09', category: 'Gym', bucket: 'Discretionary', amount: -90 }),
    tx({ month: '2026-08', category: 'Food', amount: -999 }), // other month
    tx({ month: '2026-09', category: 'Food', amount: -500, future: true }), // planned, not spent yet
    tx({ month: '2026-09', category: 'Income', amount: 3000, kind: 'income' }),
  ];

  it('reports "€292 of €350 used, 9 days left", netting refunds', () => {
    const [s] = budgetStatuses(txns, [food], '2026-09', today);
    expect(s).toMatchObject({ spent: 292, remaining: 58, daysLeft: 9 });
    expect(s.pct).toBeCloseTo(292 / 350);
  });

  it('flags a budget whose pace would overshoot, and one already over', () => {
    const [f, d] = budgetStatuses(txns, [food, disc], '2026-09', today);
    // 292 after 21 of 30 days → pace ≈ 417 > 350
    expect(f.projected).toBeCloseTo(292 / (21 / 30), 1);
    expect(f.state).toBe('warn');
    expect(d).toMatchObject({ spent: 240, remaining: -40, state: 'over' });
  });

  it('a finished month has no pace projection', () => {
    const [s] = budgetStatuses(txns, [food], '2026-08', today);
    expect(s).toMatchObject({ spent: 999, projected: null, state: 'over', daysLeft: 0 });
  });

  it('a single payment that uses the whole budget is on track, not "at risk"', () => {
    const rent: Budget = { id: 'r', dim: 'category', value: 'Rent', amount: 1450 };
    const [s] = budgetStatuses([tx({ month: '2026-09', category: 'Rent', amount: -1450 })], [rent], '2026-09', today);
    expect(s).toMatchObject({ spent: 1450, projected: null, state: 'ok' });
  });

  it('is on track when well under', () => {
    const [s] = budgetStatuses([tx({ month: '2026-09', category: 'Food', amount: -50 })], [food], '2026-09', today);
    expect(s.state).toBe('ok');
  });
});

describe('suggestBudget', () => {
  it('uses the median of recent complete months, rounded up to €10', () => {
    const txns = ['2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08'].flatMap((m, i) => [
      tx({ month: m, category: 'Food', amount: -[300, 320, 900, 310, 305, 330][i] }),
    ]);
    // median of 300, 305, 310, 320, 330, 900 = 315 → 320
    expect(suggestBudget(txns, 'category', 'Food', '2026-09')).toBe(320);
    expect(suggestBudget(txns, 'category', 'Nothing', '2026-09')).toBe(0);
  });
});

describe('helpers', () => {
  it('findBudget and monthsSpanned', () => {
    expect(findBudget([food, disc], 'bucket', 'Discretionary')).toBe(disc);
    expect(findBudget([food], 'bucket', 'Food')).toBeUndefined();
    expect(monthsSpanned([tx({ month: '2026-01', amount: -1 }), tx({ month: '2026-03', amount: -1 })])).toBe(3);
    expect(monthsSpanned([])).toBe(0);
  });
});
