import type { Transaction } from '../types';

let seq = 0;

/** Build a Transaction with sensible defaults for tests. */
export function tx(p: Partial<Transaction> & { amount: number }): Transaction {
  const month = p.month ?? '2026-01';
  const description = p.description ?? p.merchant ?? 'thing';
  return {
    id: p.id ?? `t${++seq}`,
    line: p.line ?? seq,
    account: 'BOI',
    day: null,
    description,
    merchant: description,
    csvCategory: p.category ?? '',
    bucket: '',
    currency: 'EUR',
    estimate: false,
    category: 'Misc',
    categorySource: 'csv',
    kind: p.amount > 0 && (p.category ?? 'Income') === 'Income' ? 'income' : 'expense',
    future: false,
    ...p,
    month,
    year: Number(month.slice(0, 4)),
  };
}
