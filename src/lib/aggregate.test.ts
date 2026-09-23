import { describe, expect, it } from 'vitest';
import { bucketMonthly, categoryChanges, monthlyTotals, spendBy, summarise, topMerchants } from './aggregate';
import { tx } from './testUtils';

const data = [
  tx({ month: '2026-01', category: 'Income', amount: 3000 }),
  tx({ month: '2026-01', category: 'Supermarket', merchant: 'Tesco', bucket: 'Variable Essential', amount: -100 }),
  tx({ month: '2026-01', category: 'Bills', merchant: 'Electric', bucket: 'Fixed Essential', amount: -80 }),
  // A refund in a spending category nets against spend, not income.
  tx({ month: '2026-01', category: 'Supermarket', merchant: 'Tesco', bucket: 'Variable Essential', amount: 20, kind: 'expense' }),
  tx({ month: '2026-03', category: 'Income', amount: 3000 }),
  tx({ month: '2026-03', category: 'Supermarket', merchant: 'Spar', bucket: 'Variable Essential', amount: -150 }),
];

describe('monthlyTotals', () => {
  it('sums per month, nets refunds and fills gaps', () => {
    expect(monthlyTotals(data)).toEqual([
      { month: '2026-01', income: 3000, spend: 160, net: 2840 },
      { month: '2026-02', income: 0, spend: 0, net: 0 },
      { month: '2026-03', income: 3000, spend: 150, net: 2850 },
    ]);
  });
  it('is empty for no data', () => {
    expect(monthlyTotals([])).toEqual([]);
  });
});

describe('summarise', () => {
  it('computes totals, savings rate and bucket split', () => {
    const s = summarise(data);
    expect(s).toMatchObject({ income: 6000, spend: 310, net: 5690, count: 6 });
    expect(s.savingsRate).toBeCloseTo(5690 / 6000);
    expect(s.byBucket).toEqual([
      { bucket: 'Fixed Essential', spend: 80 },
      { bucket: 'Variable Essential', spend: 230 },
    ]);
  });
  it('savings rate is null without income', () => {
    expect(summarise([tx({ amount: -5 })]).savingsRate).toBeNull();
  });
});

describe('spendBy / topMerchants', () => {
  it('groups expense rows only, largest first', () => {
    expect(spendBy(data, (t) => t.category)).toEqual([
      { key: 'Supermarket', spend: 230, count: 3 },
      { key: 'Bills', spend: 80, count: 1 },
    ]);
  });
  it('folds the tail into Other', () => {
    const { items, other } = topMerchants(data, 1);
    expect(items).toEqual([{ key: 'Spar', spend: 150, count: 1 }]);
    expect(other).toEqual({ key: 'Other (2)', spend: 160, count: 3 });
  });
});

describe('categoryChanges', () => {
  it('compares with the previous month and the trailing average', () => {
    const txns = [
      tx({ month: '2026-01', category: 'Food', amount: -100 }),
      tx({ month: '2026-02', category: 'Food', amount: -200 }),
      tx({ month: '2026-03', category: 'Food', amount: -300 }),
      tx({ month: '2026-04', category: 'Food', amount: -400 }),
      tx({ month: '2026-03', category: 'Gym', amount: -50 }),
    ];
    const byCat = Object.fromEntries(categoryChanges(txns, '2026-04').map((c) => [c.category, c]));
    expect(byCat.Food).toMatchObject({ current: 400, previous: 300, avg3: 200, deltaPrev: 100, deltaAvg: 200 });
    // Gym stopped: shows as a drop to zero.
    expect(byCat.Gym).toMatchObject({ current: 0, previous: 50, deltaPrev: -50 });
  });
  it('averages only over months inside the data', () => {
    const txns = [tx({ month: '2026-01', category: 'Food', amount: -100 }), tx({ month: '2026-02', category: 'Food', amount: -200 })];
    expect(categoryChanges(txns, '2026-02')[0].avg3).toBe(100);
  });
});

describe('bucketMonthly', () => {
  it('orders buckets and fills months', () => {
    const { months, buckets } = bucketMonthly(data);
    expect(buckets).toEqual(['Fixed Essential', 'Variable Essential']);
    expect(months.map((m) => m.month)).toEqual(['2026-01', '2026-02', '2026-03']);
    expect(months[0].values).toEqual({ 'Fixed Essential': 80, 'Variable Essential': 80 });
    expect(months[1].values).toEqual({ 'Fixed Essential': 0, 'Variable Essential': 0 });
  });
});
