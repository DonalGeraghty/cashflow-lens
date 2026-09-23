import type { Transaction } from '../types';
import { monthLabel } from './dates';
import { bucketOf } from './filters';

export type DrillDim = 'year' | 'month' | 'category' | 'merchant' | 'account' | 'bucket';
export const DRILL_DIMS: DrillDim[] = ['year', 'month', 'category', 'merchant', 'account', 'bucket'];

export interface DrillStep {
  dim: DrillDim;
  value: string;
}

export function stepMatches(t: Transaction, s: DrillStep): boolean {
  switch (s.dim) {
    case 'year':
      return String(t.year) === s.value;
    case 'month':
      return t.month === s.value;
    case 'category':
      return t.category === s.value;
    case 'merchant':
      return t.merchant === s.value;
    case 'account':
      return t.account === s.value;
    case 'bucket':
      return bucketOf(t) === s.value;
  }
}

export function applyDrill(txns: Transaction[], path: DrillStep[]): Transaction[] {
  if (!path.length) return txns;
  return txns.filter((t) => path.every((s) => stepMatches(t, s)));
}

/**
 * Add steps to the path. If a dimension is already in the path with a
 * different value, the path is cut back to before it and the new value takes
 * its place, so the breadcrumb never shows two months (or two categories).
 */
export function pushSteps(path: DrillStep[], steps: DrillStep[]): DrillStep[] {
  let next = [...path];
  for (const step of steps) {
    const i = next.findIndex((s) => s.dim === step.dim);
    if (i >= 0) {
      if (next[i].value === step.value) continue;
      next = next.slice(0, i);
    }
    next.push(step);
  }
  return next;
}

/** Steps for a month, including its year so the breadcrumb reads All > 2026 > August. */
export const monthSteps = (month: string): DrillStep[] => [
  { dim: 'year', value: month.slice(0, 4) },
  { dim: 'month', value: month },
];

export function stepLabel(step: DrillStep, path: DrillStep[] = []): string {
  if (step.dim === 'month') {
    const hasYear = path.some((s) => s.dim === 'year' && s.value === step.value.slice(0, 4));
    return monthLabel(step.value, hasYear ? 'name' : 'long');
  }
  return step.value;
}

export const hasDim = (path: DrillStep[], dim: DrillDim) => path.some((s) => s.dim === dim);
export const dimValue = (path: DrillStep[], dim: DrillDim) => path.find((s) => s.dim === dim)?.value ?? null;

export type ExplorerLevel = 'months' | 'categories' | 'merchants' | 'transactions';

/**
 * Which view the drill explorer shows for a path. The hierarchy is
 * months -> categories -> merchants -> transactions, and each level is
 * "the first dimension not yet pinned by the path".
 */
export function explorerLevel(path: DrillStep[]): ExplorerLevel {
  if (hasDim(path, 'merchant')) return 'transactions';
  if (!hasDim(path, 'month')) return 'months';
  if (!hasDim(path, 'category')) return 'categories';
  return 'merchants';
}

// ---- URL encoding: ?drill=year:2026/month:2026-08/category:Supermarket ------

export function encodeDrill(path: DrillStep[]): string {
  return path.map((s) => `${s.dim}:${encodeURIComponent(s.value)}`).join('/');
}

export function decodeDrill(param: string | null): DrillStep[] {
  if (!param) return [];
  const out: DrillStep[] = [];
  for (const part of param.split('/')) {
    const i = part.indexOf(':');
    if (i < 0) continue;
    const dim = part.slice(0, i) as DrillDim;
    if (!DRILL_DIMS.includes(dim)) continue;
    try {
      const value = decodeURIComponent(part.slice(i + 1));
      if (dim === 'month' && !/^\d{4}-\d{2}$/.test(value)) continue;
      if (dim === 'year' && !/^\d{4}$/.test(value)) continue;
      out.push({ dim, value });
    } catch {
      // Malformed escape sequence: ignore this step.
    }
  }
  return pushSteps([], out);
}
