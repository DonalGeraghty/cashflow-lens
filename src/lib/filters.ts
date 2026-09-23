import type { Transaction } from '../types';

export interface Filters {
  /** Inclusive month bounds, 'YYYY-MM'; null = open-ended. */
  from: string | null;
  to: string | null;
  /** null = no restriction; [] = nothing selected (every row filtered out). */
  accounts: string[] | null;
  categories: string[] | null;
  buckets: string[] | null;
  /** Show rows dated after today / flagged as estimates. */
  includeFuture: boolean;
}

export const DEFAULT_FILTERS: Filters = {
  from: null,
  to: null,
  accounts: null,
  categories: null,
  buckets: null,
  includeFuture: false,
};

export function applyFilters(
  txns: Transaction[],
  f: Filters,
  { ignoreDate = false }: { ignoreDate?: boolean } = {},
): Transaction[] {
  const accounts = f.accounts && new Set(f.accounts);
  const categories = f.categories && new Set(f.categories);
  const buckets = f.buckets && new Set(f.buckets);
  return txns.filter(
    (t) =>
      (f.includeFuture || !t.future) &&
      (ignoreDate || f.from === null || t.month >= f.from) &&
      (ignoreDate || f.to === null || t.month <= f.to) &&
      (!accounts || accounts.has(t.account)) &&
      (!categories || categories.has(t.category)) &&
      (!buckets || buckets.has(bucketOf(t))),
  );
}

export const NO_BUCKET = '(none)';
export const bucketOf = (t: Transaction): string => t.bucket || NO_BUCKET;

export function isFiltered(f: Filters): boolean {
  return f.from !== null || f.to !== null || f.accounts !== null || f.categories !== null || f.buckets !== null;
}
