import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PIVOT,
  type PivotConfig,
  type PivotNode,
  accValue,
  cellTransactions,
  colHeaderRows,
  computePivot,
  fieldValue,
  flattenPivot,
  groupIds,
  pathId,
  pivotFieldValues,
  pivotToRows,
} from './pivot';
import { tx } from './testUtils';

const data = [
  tx({ month: '2026-01', category: 'Food', merchant: 'Tesco', account: 'BOI', amount: -10 }),
  tx({ month: '2026-01', category: 'Food', merchant: 'Tesco', account: 'REV', amount: -30 }),
  tx({ month: '2026-01', category: 'Food', merchant: 'Spar', account: 'REV', amount: -5 }),
  tx({ month: '2026-02', category: 'Food', merchant: 'Spar', account: 'BOI', amount: -15 }),
  tx({ month: '2026-02', category: 'Bills', merchant: 'Electric', account: 'BOI', amount: -80 }),
  tx({ month: '2026-02', category: 'Income', merchant: 'Paycheck', account: 'BOI', amount: 3000, kind: 'income' }),
  // Refund: negative spend
  tx({ month: '2026-02', category: 'Food', merchant: 'Tesco', account: 'BOI', amount: 4, kind: 'expense' }),
];

const cfg = (p: Partial<PivotConfig>): PivotConfig => ({ ...DEFAULT_PIVOT, sort: { by: 'label', dir: 'asc' }, ...p });
const cell = (node: PivotNode, col: string[], agg: PivotConfig['agg'] = 'sum') =>
  accValue(node.cells.get(pathId(col)), agg);

describe('computePivot', () => {
  it('sums spending by category x month, with totals', () => {
    const r = computePivot(data, cfg({ rows: ['category'], cols: ['month'] }));
    expect(r.colKeys).toEqual([['2026-01'], ['2026-02']]);
    const [bills, food] = r.root.children;
    expect(bills.label).toBe('Bills');
    expect(cell(food, ['2026-01'])).toBe(45);
    expect(cell(food, ['2026-02'])).toBe(11); // 15 - 4 refund
    expect(accValue(food.total, 'sum')).toBe(56);
    expect(cell(bills, ['2026-01'])).toBeNull();
    // Grand totals: income rows excluded because value = spend
    expect(cell(r.root, ['2026-02'])).toBe(91);
    expect(accValue(r.root.total, 'sum')).toBe(136);
  });

  it('supports every aggregation', () => {
    const r = computePivot(data, cfg({ rows: ['category'], cols: [], value: 'amount' }));
    const food = r.root.children.find((n) => n.label === 'Food')!;
    expect(accValue(food.total, 'sum')).toBe(-56);
    expect(accValue(food.total, 'count')).toBe(5);
    expect(accValue(food.total, 'avg')).toBe(-11.2);
    expect(accValue(food.total, 'min')).toBe(-30);
    expect(accValue(food.total, 'max')).toBe(4);
  });

  it('nests row groups with subtotals', () => {
    const r = computePivot(data, cfg({ rows: ['category', 'merchant'], cols: ['month'] }));
    const food = r.root.children.find((n) => n.label === 'Food')!;
    expect(food.children.map((c) => c.label)).toEqual(['Spar', 'Tesco']);
    const tesco = food.children[1];
    expect(tesco.path).toEqual(['Food', 'Tesco']);
    expect(cell(tesco, ['2026-01'])).toBe(40);
    expect(accValue(tesco.total, 'sum')).toBe(36);
    // Subtotal equals the sum of its children.
    const childSum = food.children.reduce((s, c) => s + accValue(c.total, 'sum')!, 0);
    expect(accValue(food.total, 'sum')).toBe(childSum);
  });

  it('nests column fields and builds spanning headers', () => {
    const r = computePivot(data, cfg({ rows: ['category'], cols: ['month', 'account'] }));
    expect(r.colKeys).toEqual([
      ['2026-01', 'BOI'],
      ['2026-01', 'REV'],
      ['2026-02', 'BOI'],
    ]);
    expect(colHeaderRows(r)).toEqual([
      [
        { label: 'Jan 2026', span: 2 },
        { label: 'Feb 2026', span: 1 },
      ],
      [
        { label: 'BOI', span: 1 },
        { label: 'REV', span: 1 },
        { label: 'BOI', span: 1 },
      ],
    ]);
  });

  it('applies pivot filters', () => {
    const r = computePivot(data, cfg({ rows: ['merchant'], cols: [], filters: { account: ['REV'] } }));
    expect(r.root.children.map((n) => [n.label, accValue(n.total, 'sum')])).toEqual([
      ['Spar', 5],
      ['Tesco', 30],
    ]);
  });

  it('treats a null filter as all values and an empty one as none', () => {
    const all = computePivot(data, cfg({ rows: ['merchant'], cols: [], filters: { account: null } }));
    expect(accValue(all.root.total, 'sum')).toBe(136);
    const none = computePivot(data, cfg({ rows: ['merchant'], cols: [], filters: { account: [] } }));
    expect(none.root.children).toEqual([]);
    expect(none.root.total.count).toBe(0);
  });

  it('sorts by total or by a column, empty cells last', () => {
    const byTotal = computePivot(data, cfg({ rows: ['merchant'], cols: ['month'], sort: { by: 'total', dir: 'desc' } }));
    expect(byTotal.root.children.map((n) => n.label)).toEqual(['Electric', 'Tesco', 'Spar']);
    const byJan = computePivot(data, cfg({ rows: ['merchant'], cols: ['month'], sort: { by: pathId(['2026-01']), dir: 'asc' } }));
    expect(byJan.root.children.map((n) => n.label)).toEqual(['Spar', 'Tesco', 'Electric']);
    const byLabelDesc = computePivot(data, cfg({ rows: ['merchant'], cols: [], sort: { by: 'label', dir: 'desc' } }));
    expect(byLabelDesc.root.children.map((n) => n.label)).toEqual(['Tesco', 'Spar', 'Electric']);
  });

  it('orders date parts naturally', () => {
    const txns = ['2026-12', '2026-02', '2026-10'].map((m) => tx({ month: m, amount: -1 }));
    const r = computePivot(txns, cfg({ rows: ['monthName'], cols: [] }));
    expect(r.root.children.map((n) => n.label)).toEqual(['Feb', 'Oct', 'Dec']);
    expect(pivotFieldValues([tx({ amount: -1, day: 5 }), tx({ amount: -1 })], 'weekday')).toEqual(['Mon', '(no day)']);
  });

  it('works with no row or column fields (grand total only)', () => {
    const r = computePivot(data, cfg({ rows: [], cols: [] }));
    expect(r.root.children).toEqual([]);
    expect(accValue(r.root.total, 'sum')).toBe(136);
  });
});

describe('fieldValue', () => {
  it('derives date parts', () => {
    const t = tx({ month: '2026-08', day: 9, amount: -1 });
    expect(fieldValue(t, 'year')).toBe('2026');
    expect(fieldValue(t, 'quarter')).toBe('2026 Q3');
    expect(fieldValue(t, 'monthName')).toBe('Aug');
    expect(fieldValue(t, 'weekday')).toBe('Sun');
    expect(fieldValue(tx({ amount: -1 }), 'weekday')).toBe('(no day)');
  });
});

describe('flatten / collapse', () => {
  const r = computePivot(data, cfg({ rows: ['category', 'merchant'], cols: [] }));
  it('lists groups and leaves depth-first', () => {
    expect(flattenPivot(r, []).map((x) => x.node.path.join('>'))).toEqual(['Bills', 'Bills>Electric', 'Food', 'Food>Spar', 'Food>Tesco']);
  });
  it('hides children of collapsed groups', () => {
    const rows = flattenPivot(r, [pathId(['Food'])]);
    expect(rows.map((x) => x.node.path.join('>'))).toEqual(['Bills', 'Bills>Electric', 'Food']);
    expect(rows[2]).toMatchObject({ isGroup: true, expanded: false });
    expect(groupIds(r)).toEqual([pathId(['Bills']), pathId(['Food'])]);
  });
});

describe('cellTransactions', () => {
  const config = cfg({ rows: ['category', 'merchant'], cols: ['month'] });
  it('returns exactly the rows behind a cell', () => {
    const rows = cellTransactions(data, config, ['Food', 'Tesco'], ['2026-01']);
    expect(rows.map((t) => t.amount)).toEqual([-10, -30]);
  });
  it('row totals and subtotals use partial paths / null column', () => {
    expect(cellTransactions(data, config, ['Food'], null)).toHaveLength(5);
    expect(cellTransactions(data, config, [], ['2026-02'])).toHaveLength(3); // income excluded
  });
  it('matches the aggregated number', () => {
    const r = computePivot(data, config);
    const food = r.root.children.find((n) => n.label === 'Food')!;
    const rows = cellTransactions(data, config, ['Food'], ['2026-02']);
    expect(rows.reduce((s, t) => s - t.amount, 0)).toBe(cell(food, ['2026-02']));
  });
});

describe('pivotToRows (CSV export)', () => {
  it('exports the visible view with headers and grand total', () => {
    const r = computePivot(data, cfg({ rows: ['category', 'merchant'], cols: ['month'] }));
    const rows = pivotToRows(r, [pathId(['Bills'])]);
    expect(rows[0]).toEqual(['Category', 'Merchant', 'Jan 2026', 'Feb 2026', 'Total']);
    expect(rows[1]).toEqual(['Bills (collapsed)', '', '', 80, 80]);
    expect(rows[2]).toEqual(['Food', '', 45, 11, 56]);
    expect(rows[3]).toEqual(['Food', 'Spar', 5, 15, 20]);
    expect(rows[rows.length - 1]).toEqual(['Grand total', '', 45, 91, 136]);
  });
});
