import { describe, expect, it } from 'vitest';
import type { FlowGraph } from './flow';
import { buildFlow, flowDrillSteps, matchesFlow } from './flow';
import { tx } from './testUtils';

const data = [
  tx({ category: 'Income', merchant: 'Paycheck', amount: 3000, kind: 'income' }),
  tx({ category: 'Income', merchant: 'Dad', amount: 400, kind: 'income' }),
  tx({ category: 'Mortgage', bucket: 'Fixed Essential', amount: -1300 }),
  tx({ category: 'Supermarket', bucket: 'Variable Essential', amount: -500 }),
  tx({ category: 'Social', bucket: 'Discretionary', amount: -300 }),
  tx({ category: 'Healthcare', bucket: 'Variable Essential', amount: -100 }),
  // Refund bigger than spend for this pair: no positive flow, dropped.
  tx({ category: 'Gifts', bucket: 'Discretionary', amount: -20 }),
  tx({ category: 'Gifts', bucket: 'Discretionary', amount: 50, kind: 'expense' }),
];

const inflow = (g: FlowGraph, id: string) => g.links.filter((l) => l.target === id).reduce((s, l) => s + l.value, 0);
const outflow = (g: FlowGraph, id: string) => g.links.filter((l) => l.source === id).reduce((s, l) => s + l.value, 0);

describe('buildFlow', () => {
  const g = buildFlow(data);

  it('lays out sources → Income → buckets + Saved → categories', () => {
    expect(g.nodes.map((n) => [n.id, n.column])).toEqual([
      ['src|Paycheck', 0],
      ['src|Dad', 0],
      ['hub', 1],
      ['bucket|Fixed Essential', 2],
      ['bucket|Variable Essential', 2],
      ['bucket|Discretionary', 2],
      ['saved', 2],
      ['cat|Mortgage', 3],
      ['cat|Supermarket', 3],
      ['cat|Healthcare', 3],
      ['cat|Social', 3],
    ]);
    expect(g).toMatchObject({ income: 3400, spend: 2200, saved: 1200, deficit: 0 });
  });

  it('balances every node that money passes through', () => {
    for (const id of ['hub', 'bucket|Fixed Essential', 'bucket|Variable Essential', 'bucket|Discretionary']) {
      expect(outflow(g, id)).toBeCloseTo(inflow(g, id));
    }
  });

  it('adds "From savings" when spending exceeds income', () => {
    const over = buildFlow([...data, tx({ category: 'Holiday', bucket: 'Discretionary', amount: -2000 })]);
    expect(over).toMatchObject({ income: 3400, spend: 4200, saved: 0, deficit: 800 });
    expect(over.nodes.find((n) => n.id === 'deficit')!.column).toBe(0);
    expect(over.nodes.some((n) => n.id === 'saved')).toBe(false);
    expect(outflow(over, 'hub')).toBeCloseTo(inflow(over, 'hub'));
  });

  it('roots at Spending when there is no income in view', () => {
    const g2 = buildFlow(data.filter((t) => t.kind === 'expense'));
    expect(g2.nodes.find((n) => n.column === 1)).toMatchObject({ id: 'spending', label: 'Spending' });
    expect(g2.nodes.filter((n) => n.column === 0)).toEqual([]);
    expect(g2.saved).toBe(0);
  });

  it('folds small income sources and can hide sources or categories', () => {
    const folded = buildFlow(data, { maxIncome: 1 });
    expect(folded.nodes.find((n) => n.id === 'src|__other__')).toMatchObject({ label: 'Other income (1)', match: { kind: 'income', merchants: ['Dad'] } });
    const simple = buildFlow(data, { incomeSources: false, categories: false });
    expect(simple.nodes.map((n) => n.column)).not.toContain(0);
    expect(simple.nodes.map((n) => n.column)).not.toContain(3);
  });

  it('is empty without data', () => {
    expect(buildFlow([]).nodes).toEqual([]);
  });
});

describe('matching and drilling', () => {
  it('link matches select exactly the rows behind the flow', () => {
    const g = buildFlow(data);
    const link = g.links.find((l) => l.id === 'bucket|Variable Essential>cat|Supermarket')!;
    expect(data.filter((t) => matchesFlow(t, link.match!)).map((t) => t.amount)).toEqual([-500]);
    expect(flowDrillSteps(link.match)).toEqual([
      { dim: 'bucket', value: 'Variable Essential' },
      { dim: 'category', value: 'Supermarket' },
    ]);
  });

  it('hub, Saved and folded groups are not drillable', () => {
    expect(flowDrillSteps(null)).toBeNull();
    expect(flowDrillSteps({ kind: 'income' })).toBeNull();
    expect(flowDrillSteps({ kind: 'income', merchants: ['a', 'b'] })).toBeNull();
    expect(flowDrillSteps({ kind: 'income', merchant: 'Dad' })).toEqual([{ dim: 'merchant', value: 'Dad' }]);
  });
});
