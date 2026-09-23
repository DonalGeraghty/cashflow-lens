import type { Kind, Transaction } from '../types';
import { orderBuckets, spendOf } from './aggregate';
import { bucketOf } from './filters';
import type { DrillStep } from './drill';

/** Which rows a node or link stands for. Used for drill-down and "peek". */
export interface FlowMatch {
  kind?: Kind;
  merchant?: string;
  /** Several merchants, for the folded "Other income" node. */
  merchants?: string[];
  bucket?: string;
  category?: string;
}

export type FlowRole = 'source' | 'deficit' | 'hub' | 'bucket' | 'saved' | 'category';

export interface FlowNode {
  id: string;
  label: string;
  /** 0 income sources · 1 income hub · 2 buckets + saved · 3 categories */
  column: number;
  role: FlowRole;
  /** Bucket used for colour (categories take their largest bucket's). */
  bucket?: string;
  match: FlowMatch | null;
}

export interface FlowLink {
  id: string;
  source: string;
  target: string;
  value: number;
  /** Bucket the money flows through, for colour; undefined for income-side links. */
  bucket?: string;
  match: FlowMatch | null;
}

export interface FlowGraph {
  nodes: FlowNode[];
  links: FlowLink[];
  income: number;
  /** Spending shown in the diagram: net of refunds, per bucket/category pair, positives only. */
  spend: number;
  saved: number;
  /** Spending funded from savings (spend beyond income). */
  deficit: number;
}

export interface FlowOptions {
  /** Income sources shown individually before folding into "Other income". */
  maxIncome?: number;
  /** Include the category column. */
  categories?: boolean;
  /** Show individual income sources (else a single Income node). */
  incomeSources?: boolean;
}

const round2 = (v: number) => Math.round(v * 100) / 100;

/**
 * Build the Sankey graph: income sources → Income → buckets (+ Saved) → categories.
 *
 * Every node balances: Income out = spending + Saved, and when spending is
 * more than income a "From savings" source makes up the difference. With no
 * income in view (e.g. drilled into one category) the root is "Spending".
 * A bucket/category pair whose refunds exceed its spending has no positive
 * flow to draw, so it's left out.
 */
export function buildFlow(txns: Transaction[], { maxIncome = 5, categories = true, incomeSources = true }: FlowOptions = {}): FlowGraph {
  // ---- income side
  const incomeBy = new Map<string, number>();
  for (const t of txns) if (t.kind === 'income' && t.amount > 0) incomeBy.set(t.merchant, (incomeBy.get(t.merchant) ?? 0) + t.amount);
  const incomes = [...incomeBy.entries()].sort((a, b) => b[1] - a[1]);
  const income = round2(incomes.reduce((s, [, v]) => s + v, 0));

  // ---- spending side: net spend per (bucket, category) pair
  const pairs = new Map<string, { bucket: string; category: string; spend: number }>();
  for (const t of txns) {
    if (t.kind !== 'expense') continue;
    const bucket = bucketOf(t);
    const key = `${bucket}\u0000${t.category}`;
    const p = pairs.get(key) ?? { bucket, category: t.category, spend: 0 };
    p.spend += spendOf(t);
    pairs.set(key, p);
  }
  const positive = [...pairs.values()].filter((p) => p.spend > 0.005).map((p) => ({ ...p, spend: round2(p.spend) }));
  const spend = round2(positive.reduce((s, p) => s + p.spend, 0));
  if (income === 0 && spend === 0) return { nodes: [], links: [], income: 0, spend: 0, saved: 0, deficit: 0 };

  const nodes: FlowNode[] = [];
  const links: FlowLink[] = [];
  const hasIncome = income > 0;
  const hubId = hasIncome ? 'hub' : 'spending';
  const saved = hasIncome ? round2(Math.max(0, income - spend)) : 0;
  const deficit = hasIncome ? round2(Math.max(0, spend - income)) : 0;

  // Column 0: where the money comes from.
  if (hasIncome && incomeSources) {
    const head = incomes.slice(0, maxIncome);
    const rest = incomes.slice(maxIncome);
    for (const [merchant, value] of head) {
      nodes.push({ id: `src|${merchant}`, label: merchant, column: 0, role: 'source', match: { kind: 'income', merchant } });
      links.push({ id: `src|${merchant}>hub`, source: `src|${merchant}`, target: hubId, value: round2(value), match: { kind: 'income', merchant } });
    }
    if (rest.length) {
      const merchants = rest.map(([m]) => m);
      const value = round2(rest.reduce((s, [, v]) => s + v, 0));
      nodes.push({ id: 'src|__other__', label: `Other income (${rest.length})`, column: 0, role: 'source', match: { kind: 'income', merchants } });
      links.push({ id: 'src|__other__>hub', source: 'src|__other__', target: hubId, value, match: { kind: 'income', merchants } });
    }
  }
  if (deficit > 0) {
    nodes.push({ id: 'deficit', label: 'From savings', column: 0, role: 'deficit', match: null });
    links.push({ id: 'deficit>hub', source: 'deficit', target: hubId, value: deficit, match: null });
  }

  // Column 1: the hub everything passes through.
  nodes.push({
    id: hubId,
    label: hasIncome ? 'Income' : 'Spending',
    column: 1,
    role: 'hub',
    match: hasIncome ? { kind: 'income' } : { kind: 'expense' },
  });

  // Column 2: buckets in their usual order, then Saved.
  const bucketTotals = new Map<string, number>();
  for (const p of positive) bucketTotals.set(p.bucket, (bucketTotals.get(p.bucket) ?? 0) + p.spend);
  for (const bucket of orderBuckets([...bucketTotals.keys()])) {
    nodes.push({ id: `bucket|${bucket}`, label: bucket, column: 2, role: 'bucket', bucket, match: { kind: 'expense', bucket } });
    links.push({ id: `${hubId}>bucket|${bucket}`, source: hubId, target: `bucket|${bucket}`, value: round2(bucketTotals.get(bucket)!), bucket, match: { kind: 'expense', bucket } });
  }
  if (saved > 0) {
    nodes.push({ id: 'saved', label: 'Saved', column: 2, role: 'saved', match: null });
    links.push({ id: `${hubId}>saved`, source: hubId, target: 'saved', value: saved, match: null });
  }

  // Column 3: categories, grouped by bucket (largest first) so flows don't cross.
  if (categories) {
    const bucketOrder = orderBuckets([...bucketTotals.keys()]);
    const mainBucket = new Map<string, { bucket: string; spend: number }>();
    for (const p of positive) {
      const cur = mainBucket.get(p.category);
      if (!cur || p.spend > cur.spend) mainBucket.set(p.category, { bucket: p.bucket, spend: p.spend });
    }
    const catTotals = new Map<string, number>();
    for (const p of positive) catTotals.set(p.category, (catTotals.get(p.category) ?? 0) + p.spend);
    const catsSorted = [...catTotals.keys()].sort(
      (a, b) =>
        bucketOrder.indexOf(mainBucket.get(a)!.bucket) - bucketOrder.indexOf(mainBucket.get(b)!.bucket) ||
        catTotals.get(b)! - catTotals.get(a)! ||
        a.localeCompare(b),
    );
    for (const category of catsSorted) {
      nodes.push({ id: `cat|${category}`, label: category, column: 3, role: 'category', bucket: mainBucket.get(category)!.bucket, match: { kind: 'expense', category } });
    }
    const pairOrder = [...positive].sort((a, b) => catsSorted.indexOf(a.category) - catsSorted.indexOf(b.category));
    for (const p of pairOrder) {
      links.push({
        id: `bucket|${p.bucket}>cat|${p.category}`,
        source: `bucket|${p.bucket}`,
        target: `cat|${p.category}`,
        value: p.spend,
        bucket: p.bucket,
        match: { kind: 'expense', bucket: p.bucket, category: p.category },
      });
    }
  }

  return { nodes, links, income, spend, saved, deficit };
}

export function matchesFlow(t: Transaction, m: FlowMatch): boolean {
  return (
    (m.kind === undefined || t.kind === m.kind) &&
    (m.merchant === undefined || t.merchant === m.merchant) &&
    (m.merchants === undefined || m.merchants.includes(t.merchant)) &&
    (m.bucket === undefined || bucketOf(t) === m.bucket) &&
    (m.category === undefined || t.category === m.category)
  );
}

/** Drill steps for a node or link, or null when it can't be drilled (hub, Saved, folded groups). */
export function flowDrillSteps(m: FlowMatch | null): DrillStep[] | null {
  if (!m) return null;
  const steps: DrillStep[] = [];
  if (m.bucket !== undefined) steps.push({ dim: 'bucket', value: m.bucket });
  if (m.category !== undefined) steps.push({ dim: 'category', value: m.category });
  if (m.merchant !== undefined) steps.push({ dim: 'merchant', value: m.merchant });
  return steps.length ? steps : null;
}
