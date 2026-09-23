import { describe, expect, it } from 'vitest';
import { applyDrill, decodeDrill, encodeDrill, explorerLevel, monthSteps, pushSteps, stepLabel, type DrillStep } from './drill';
import { applyFilters, DEFAULT_FILTERS } from './filters';
import { tx } from './testUtils';

const year: DrillStep = { dim: 'year', value: '2026' };
const aug: DrillStep = { dim: 'month', value: '2026-08' };
const groceries: DrillStep = { dim: 'category', value: 'Groceries' };

describe('pushSteps', () => {
  it('appends new dimensions', () => {
    expect(pushSteps([], monthSteps('2026-08'))).toEqual([year, aug]);
    expect(pushSteps([year, aug], [groceries])).toEqual([year, aug, groceries]);
  });
  it('replacing a dimension cuts everything after it', () => {
    const next = pushSteps([year, aug, groceries], [{ dim: 'month', value: '2026-07' }]);
    expect(next).toEqual([year, { dim: 'month', value: '2026-07' }]);
  });
  it('re-pushing the same value is a no-op', () => {
    expect(pushSteps([year, aug, groceries], monthSteps('2026-08'))).toEqual([year, aug, groceries]);
  });
  it('a month in another year replaces the year', () => {
    expect(pushSteps([year, aug], monthSteps('2025-12'))).toEqual([
      { dim: 'year', value: '2025' },
      { dim: 'month', value: '2025-12' },
    ]);
  });
});

describe('applyDrill', () => {
  const txns = [
    tx({ month: '2026-08', category: 'Groceries', amount: -10 }),
    tx({ month: '2026-08', category: 'Bills', amount: -20 }),
    tx({ month: '2025-08', category: 'Groceries', amount: -30 }),
  ];
  it('ANDs every step', () => {
    expect(applyDrill(txns, [])).toHaveLength(3);
    expect(applyDrill(txns, [year])).toHaveLength(2);
    expect(applyDrill(txns, [year, aug, groceries]).map((t) => t.amount)).toEqual([-10]);
  });
  it('composes with filters', () => {
    const filtered = applyFilters(txns, { ...DEFAULT_FILTERS, categories: ['Groceries'] });
    expect(applyDrill(filtered, [year]).map((t) => t.amount)).toEqual([-10]);
  });
});

describe('explorerLevel', () => {
  it('walks months -> categories -> merchants -> transactions', () => {
    expect(explorerLevel([])).toBe('months');
    expect(explorerLevel([year])).toBe('months');
    expect(explorerLevel([year, aug])).toBe('categories');
    expect(explorerLevel([year, aug, groceries])).toBe('merchants');
    expect(explorerLevel([year, aug, groceries, { dim: 'merchant', value: 'Tesco' }])).toBe('transactions');
    expect(explorerLevel([groceries])).toBe('months');
  });
});

describe('URL encoding', () => {
  it('round-trips awkward values', () => {
    const path: DrillStep[] = [year, aug, { dim: 'merchant', value: 'M&S / Food: 50%' }];
    const encoded = encodeDrill(path);
    expect(encoded).toBe('year:2026/month:2026-08/merchant:M%26S%20%2F%20Food%3A%2050%25');
    expect(decodeDrill(encoded)).toEqual(path);
  });
  it('drops unknown dims, bad months and broken escapes', () => {
    expect(decodeDrill('year:2026/colour:red/month:August/category:%E0%A4%A/category:Bills')).toEqual([
      year,
      { dim: 'category', value: 'Bills' },
    ]);
    expect(decodeDrill(null)).toEqual([]);
  });
});

describe('stepLabel', () => {
  it('shows just the month name when the year is already in the path', () => {
    expect(stepLabel(aug, [year, aug])).toBe('August');
    expect(stepLabel(aug, [aug])).toBe('August 2026');
  });
});
