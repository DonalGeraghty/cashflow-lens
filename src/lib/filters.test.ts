import { describe, expect, it } from 'vitest';
import { applyFilters, DEFAULT_FILTERS, isFiltered } from './filters';
import { tx } from './testUtils';

const data = [
  tx({ account: 'BOI', category: 'Food', bucket: 'Variable Essential', amount: -10 }),
  tx({ account: 'REV', category: 'Bills', bucket: 'Fixed Essential', amount: -20 }),
  tx({ account: 'REV', category: 'Food', amount: -30 }),
];

describe('applyFilters', () => {
  it('null means no restriction (select all)', () => {
    expect(applyFilters(data, DEFAULT_FILTERS)).toHaveLength(3);
    expect(isFiltered(DEFAULT_FILTERS)).toBe(false);
  });

  it('an empty list means nothing selected (select none)', () => {
    expect(applyFilters(data, { ...DEFAULT_FILTERS, accounts: [] })).toEqual([]);
    expect(applyFilters(data, { ...DEFAULT_FILTERS, categories: [] })).toEqual([]);
    expect(isFiltered({ ...DEFAULT_FILTERS, buckets: [] })).toBe(true);
  });

  it('a list keeps only the chosen values, and filters combine', () => {
    expect(applyFilters(data, { ...DEFAULT_FILTERS, accounts: ['REV'] }).map((t) => t.amount)).toEqual([-20, -30]);
    expect(applyFilters(data, { ...DEFAULT_FILTERS, accounts: ['REV'], categories: ['Food'] }).map((t) => t.amount)).toEqual([-30]);
    expect(applyFilters(data, { ...DEFAULT_FILTERS, buckets: ['(none)'] }).map((t) => t.amount)).toEqual([-30]);
  });

  it('hides future rows unless included', () => {
    const rows = [...data, tx({ amount: -5, future: true })];
    expect(applyFilters(rows, DEFAULT_FILTERS)).toHaveLength(3);
    expect(applyFilters(rows, { ...DEFAULT_FILTERS, includeFuture: true })).toHaveLength(4);
  });
});
