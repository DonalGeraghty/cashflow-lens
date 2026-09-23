import type { Transaction } from '../types';
import { MONTH_SHORT, NO_DAY, WEEKDAYS, monthLabel, quarterOf, weekdayOf } from './dates';
import { bucketOf } from './filters';

export type PivotField =
  | 'year' | 'quarter' | 'month' | 'monthName' | 'weekday'
  | 'category' | 'merchant' | 'account' | 'currency' | 'bucket' | 'kind';

export const PIVOT_FIELDS: { id: PivotField; label: string }[] = [
  { id: 'year', label: 'Year' },
  { id: 'quarter', label: 'Quarter' },
  { id: 'month', label: 'Month' },
  { id: 'monthName', label: 'Month of year' },
  { id: 'weekday', label: 'Weekday' },
  { id: 'category', label: 'Category' },
  { id: 'merchant', label: 'Merchant' },
  { id: 'account', label: 'Account' },
  { id: 'currency', label: 'Currency' },
  { id: 'bucket', label: 'Spending bucket' },
  { id: 'kind', label: 'Income / expense' },
];
export const fieldLabel = (f: PivotField) => PIVOT_FIELDS.find((p) => p.id === f)?.label ?? f;

export type ValueField = 'amount' | 'spend' | 'income';
export const VALUE_FIELDS: { id: ValueField; label: string }[] = [
  { id: 'spend', label: 'Spending (refunds netted)' },
  { id: 'income', label: 'Income' },
  { id: 'amount', label: 'Amount (signed)' },
];

export type AggFn = 'sum' | 'count' | 'avg' | 'min' | 'max';
export const AGG_FNS: { id: AggFn; label: string }[] = [
  { id: 'sum', label: 'Sum' },
  { id: 'count', label: 'Count' },
  { id: 'avg', label: 'Average' },
  { id: 'min', label: 'Min' },
  { id: 'max', label: 'Max' },
];

export interface PivotSort {
  /** 'label' sorts by row label; 'total' by the row total; anything else is a column id. */
  by: string;
  dir: 'asc' | 'desc';
}

export interface PivotConfig {
  rows: PivotField[];
  cols: PivotField[];
  value: ValueField;
  agg: AggFn;
  /** Included values per field; missing or null = no restriction, [] = nothing. */
  filters: Partial<Record<PivotField, string[] | null>>;
  sort: PivotSort;
  heatmap: boolean;
  /** Ids of collapsed row groups. */
  collapsed: string[];
}

export const DEFAULT_PIVOT: PivotConfig = {
  rows: ['category'],
  cols: ['month'],
  value: 'spend',
  agg: 'sum',
  filters: {},
  sort: { by: 'total', dir: 'desc' },
  heatmap: true,
  collapsed: [],
};

// ---- Field values -----------------------------------------------------------

export function fieldValue(t: Transaction, f: PivotField): string {
  switch (f) {
    case 'year':
      return String(t.year);
    case 'quarter':
      return `${t.year} Q${quarterOf(Number(t.month.slice(5)))}`;
    case 'month':
      return t.month;
    case 'monthName':
      return MONTH_SHORT[Number(t.month.slice(5)) - 1];
    case 'weekday':
      return t.day === null ? NO_DAY : weekdayOf(t.year, Number(t.month.slice(5)), t.day);
    case 'category':
      return t.category;
    case 'merchant':
      return t.merchant;
    case 'account':
      return t.account;
    case 'currency':
      return t.currency;
    case 'bucket':
      return bucketOf(t);
    case 'kind':
      return t.kind === 'income' ? 'Income' : 'Expense';
  }
}

/** Human label for a field value (month keys become "Aug 2026"). */
export function valueLabel(f: PivotField, v: string): string {
  return f === 'month' ? monthLabel(v) : v;
}

/** Natural ordering: calendar order for months/weekdays, "(no day)" last, else alphabetical. */
export function compareFieldValues(f: PivotField, a: string, b: string): number {
  if (f === 'monthName') return MONTH_SHORT.indexOf(a) - MONTH_SHORT.indexOf(b);
  if (f === 'weekday') {
    const rank = (v: string) => (v === NO_DAY ? 99 : WEEKDAYS.indexOf(v));
    return rank(a) - rank(b);
  }
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

export function pivotFieldValues(txns: Transaction[], f: PivotField): string[] {
  return [...new Set(txns.map((t) => fieldValue(t, f)))].sort((a, b) => compareFieldValues(f, a, b));
}

// ---- Aggregation ------------------------------------------------------------

export interface Acc {
  sum: number;
  count: number;
  min: number;
  max: number;
}

const newAcc = (): Acc => ({ sum: 0, count: 0, min: Infinity, max: -Infinity });
function addTo(acc: Acc, v: number) {
  acc.sum += v;
  acc.count++;
  if (v < acc.min) acc.min = v;
  if (v > acc.max) acc.max = v;
}

export function accValue(acc: Acc | undefined, agg: AggFn): number | null {
  if (!acc || acc.count === 0) return null;
  switch (agg) {
    case 'sum':
      return Math.round(acc.sum * 100) / 100;
    case 'count':
      return acc.count;
    case 'avg':
      return Math.round((acc.sum / acc.count) * 100) / 100;
    case 'min':
      return acc.min;
    case 'max':
      return acc.max;
  }
}

/** The measured value for a row, or null if the row doesn't belong to the value field. */
export function measure(t: Transaction, value: ValueField): number | null {
  switch (value) {
    case 'amount':
      return t.amount;
    case 'spend':
      return t.kind === 'expense' ? -t.amount : null;
    case 'income':
      return t.kind === 'income' ? t.amount : null;
  }
}

// ---- Tree -------------------------------------------------------------------

export interface PivotNode {
  /** Stable id: JSON of the row path. The root is "[]". */
  id: string;
  path: string[];
  depth: number;
  /** Field this node groups by (null for the root / grand total). */
  field: PivotField | null;
  label: string;
  children: PivotNode[];
  cells: Map<string, Acc>;
  total: Acc;
}

export interface PivotResult {
  config: PivotConfig;
  /** One entry per leaf column: the values of each column field. */
  colKeys: string[][];
  /** JSON ids matching colKeys. */
  colIds: string[];
  /** Grand totals per column and overall live on the root. */
  root: PivotNode;
}

export const pathId = (path: string[]) => JSON.stringify(path);

export function passesPivotFilters(t: Transaction, filters: PivotConfig['filters']): boolean {
  for (const [f, vals] of Object.entries(filters) as [PivotField, string[] | null | undefined][]) {
    if (vals && !vals.includes(fieldValue(t, f))) return false;
  }
  return true;
}

export function computePivot(txns: Transaction[], config: PivotConfig): PivotResult {
  const root = makeNode([], null, '');
  const colMap = new Map<string, string[]>();
  // Children are collected in maps while building, then sorted into arrays.
  const childMaps = new Map<PivotNode, Map<string, PivotNode>>();

  for (const t of txns) {
    if (!passesPivotFilters(t, config.filters)) continue;
    const v = measure(t, config.value);
    if (v === null) continue;
    const colVals = config.cols.map((f) => fieldValue(t, f));
    const colId = pathId(colVals);
    if (!colMap.has(colId)) colMap.set(colId, colVals);

    let node = root;
    add(node, colId, v);
    for (const f of config.rows) {
      const val = fieldValue(t, f);
      let kids = childMaps.get(node);
      if (!kids) childMaps.set(node, (kids = new Map()));
      let child = kids.get(val);
      if (!child) kids.set(val, (child = makeNode([...node.path, val], f, valueLabel(f, val))));
      node = child;
      add(node, colId, v);
    }
  }

  const colKeys = [...colMap.values()].sort((a, b) => {
    for (let i = 0; i < config.cols.length; i++) {
      const c = compareFieldValues(config.cols[i], a[i], b[i]);
      if (c) return c;
    }
    return 0;
  });

  const finish = (node: PivotNode) => {
    const kids = childMaps.get(node);
    if (!kids) return;
    node.children = [...kids.values()];
    node.children.forEach(finish);
  };
  finish(root);

  const result: PivotResult = { config, colKeys, colIds: colKeys.map(pathId), root };
  sortTree(result);
  return result;

  function add(node: PivotNode, colId: string, v: number) {
    let acc = node.cells.get(colId);
    if (!acc) node.cells.set(colId, (acc = newAcc()));
    addTo(acc, v);
    addTo(node.total, v);
  }
}

function makeNode(path: string[], field: PivotField | null, label: string): PivotNode {
  return { id: pathId(path), path, depth: path.length, field, label, children: [], cells: new Map(), total: newAcc() };
}

function sortTree({ root, config }: PivotResult) {
  const { by, dir } = config.sort;
  const sign = dir === 'asc' ? 1 : -1;
  const keyOf = (n: PivotNode) => accValue(by === 'total' ? n.total : n.cells.get(by), config.agg);
  const visit = (node: PivotNode) => {
    node.children.sort((a, b) => {
      if (by !== 'label') {
        const va = keyOf(a);
        const vb = keyOf(b);
        // Empty cells always sink to the bottom regardless of direction.
        if (va === null && vb !== null) return 1;
        if (vb === null && va !== null) return -1;
        if (va !== null && vb !== null && va !== vb) return (va - vb) * sign;
      }
      return compareFieldValues(a.field!, a.path[a.depth - 1], b.path[b.depth - 1]) * (by === 'label' ? sign : 1);
    });
    node.children.forEach(visit);
  };
  visit(root);
}

// ---- Display helpers --------------------------------------------------------

export interface PivotRow {
  node: PivotNode;
  isGroup: boolean;
  expanded: boolean;
}

/** Depth-first list of visible rows, honouring collapsed groups. The root is not included. */
export function flattenPivot(result: PivotResult, collapsed: Iterable<string>): PivotRow[] {
  const closed = new Set(collapsed);
  const out: PivotRow[] = [];
  const visit = (node: PivotNode) => {
    for (const child of node.children) {
      const isGroup = child.children.length > 0;
      const expanded = isGroup && !closed.has(child.id);
      out.push({ node: child, isGroup, expanded });
      if (expanded) visit(child);
    }
  };
  visit(result.root);
  return out;
}

/** Ids of every group node, for "collapse all". */
export function groupIds(result: PivotResult): string[] {
  const ids: string[] = [];
  const visit = (n: PivotNode) => {
    for (const c of n.children) {
      if (c.children.length) {
        ids.push(c.id);
        visit(c);
      }
    }
  };
  visit(result.root);
  return ids;
}

/** Header rows for (possibly nested) column fields, with colspans. */
export function colHeaderRows(result: PivotResult): { label: string; span: number }[][] {
  const { colKeys, config } = result;
  return config.cols.map((f, level) => {
    const row: { label: string; span: number; prefix: string }[] = [];
    for (const key of colKeys) {
      const prefix = pathId(key.slice(0, level + 1));
      const last = row[row.length - 1];
      if (last && last.prefix === prefix) last.span++;
      else row.push({ label: valueLabel(f, key[level]), span: 1, prefix });
    }
    return row.map(({ label, span }) => ({ label, span }));
  });
}

/** The transactions behind one cell. An empty colPath means the row total. */
export function cellTransactions(
  txns: Transaction[],
  config: PivotConfig,
  rowPath: string[],
  colPath: string[] | null,
): Transaction[] {
  return txns.filter(
    (t) =>
      passesPivotFilters(t, config.filters) &&
      measure(t, config.value) !== null &&
      rowPath.every((v, i) => fieldValue(t, config.rows[i]) === v) &&
      (colPath === null || colPath.every((v, i) => fieldValue(t, config.cols[i]) === v)),
  );
}

/** The visible pivot as a 2-D array of strings/numbers for CSV export. */
export function pivotToRows(result: PivotResult, collapsed: Iterable<string>): (string | number)[][] {
  const { config, colKeys, colIds, root } = result;
  const hasCols = config.cols.length > 0;
  const header: (string | number)[] = [
    ...(config.rows.length ? config.rows.map(fieldLabel) : ['']),
    ...(hasCols ? colKeys.map((k) => k.map((v, i) => valueLabel(config.cols[i], v)).join(' / ')) : []),
    'Total',
  ];
  const valueCells = (n: PivotNode) => [
    ...(hasCols ? colIds.map((id) => accValue(n.cells.get(id), config.agg) ?? '') : []),
    accValue(n.total, config.agg) ?? '',
  ];
  const width = Math.max(config.rows.length, 1);
  const body = flattenPivot(result, collapsed).map(({ node, isGroup, expanded }) => {
    const labels: string[] = Array(width).fill('');
    node.path.forEach((v, i) => (labels[i] = valueLabel(config.rows[i], v)));
    if (isGroup && !expanded) labels[node.depth - 1] += ' (collapsed)';
    return [...labels, ...valueCells(node)];
  });
  const totalLabels: string[] = Array(width).fill('');
  totalLabels[0] = 'Grand total';
  return [header, ...body, [...totalLabels, ...valueCells(root)]];
}
