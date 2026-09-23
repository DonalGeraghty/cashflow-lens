import { useDeferredValue, useMemo, useState } from 'react';
import type { Transaction } from '../types';
import { monthLabel } from '../lib/dates';
import { formatMoney } from '../lib/format';
import { spendOf, incomeOf } from '../lib/aggregate';

type SortKey = 'date' | 'account' | 'description' | 'merchant' | 'category' | 'bucket' | 'amount';

const COLUMNS: { key: SortKey; label: string; numeric?: boolean }[] = [
  { key: 'date', label: 'Date' },
  { key: 'account', label: 'Account' },
  { key: 'description', label: 'Description' },
  { key: 'merchant', label: 'Merchant' },
  { key: 'category', label: 'Category' },
  { key: 'bucket', label: 'Bucket' },
  { key: 'amount', label: 'Amount', numeric: true },
];

const dateKey = (t: Transaction) => `${t.month}-${String(t.day ?? 0).padStart(2, '0')}`;
const sortValue = (t: Transaction, k: SortKey): string | number =>
  k === 'date' ? dateKey(t) : k === 'amount' ? t.amount : (t[k] ?? '').toString().toLowerCase();

interface Props {
  rows: Transaction[];
  currency?: string;
  pageSize?: number;
  /** Focus the search box on mount (e.g. in the dialog). */
  autoFocus?: boolean;
}

/** Searchable, sortable transaction list. */
export function TransactionTable({ rows, currency = 'EUR', pageSize = 100, autoFocus = false }: Props) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'date', dir: 'desc' });
  const [limit, setLimit] = useState(pageSize);
  const q = useDeferredValue(query.trim().toLowerCase());

  const shown = useMemo(() => {
    const matched = q
      ? rows.filter((t) =>
          [t.description, t.merchant, t.category, t.account, t.bucket, monthLabel(t.month), t.amount.toFixed(2)].some((f) => f.toLowerCase().includes(q)),
        )
      : rows;
    const sign = sort.dir === 'asc' ? 1 : -1;
    return [...matched].sort((a, b) => {
      const va = sortValue(a, sort.key);
      const vb = sortValue(b, sort.key);
      if (va < vb) return -sign;
      if (va > vb) return sign;
      return a.line - b.line;
    });
  }, [rows, q, sort]);

  const totals = useMemo(
    () => shown.reduce((acc, t) => ({ income: acc.income + incomeOf(t), spend: acc.spend + spendOf(t) }), { income: 0, spend: 0 }),
    [shown],
  );

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'amount' || key === 'date' ? 'desc' : 'asc' }));

  return (
    <div className="txn-table">
      <div className="table-tools">
        <input
          type="search"
          placeholder="Search description, merchant, category, amount…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setLimit(pageSize);
          }}
          aria-label="Search transactions"
          autoFocus={autoFocus}
        />
        <span className="muted">
          {shown.length.toLocaleString('en-IE')} of {rows.length.toLocaleString('en-IE')} · in {formatMoney(totals.income, currency)} · out{' '}
          {formatMoney(totals.spend, currency)}
        </span>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              {COLUMNS.map((c) => (
                <th key={c.key} className={c.numeric ? 'num' : undefined} aria-sort={sort.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                  <button type="button" onClick={() => toggleSort(c.key)}>
                    {c.label}
                    <span className="sort-ind" aria-hidden="true">
                      {sort.key === c.key ? (sort.dir === 'asc' ? '▲' : '▼') : ''}
                    </span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.slice(0, limit).map((t) => (
              <tr key={t.id} className={t.future ? 'future' : undefined}>
                <td className="nowrap">{t.day ? `${t.day} ${monthLabel(t.month)}` : monthLabel(t.month)}</td>
                <td>{t.account}</td>
                <td>
                  {t.description || <span className="muted">(none)</span>}
                  {t.future && <span className="badge">{t.estimate ? 'estimate' : 'future'}</span>}
                </td>
                <td>{t.merchant}</td>
                <td>
                  {t.category}
                  {t.categorySource === 'rule' && (
                    <span className="badge" title="Set by a keyword rule">
                      rule
                    </span>
                  )}
                </td>
                <td>{t.bucket || <span className="muted">–</span>}</td>
                <td className="num">
                  {formatMoney(t.amount, t.currency, { sign: true })}
                  {t.kind === 'expense' && t.amount > 0 && (
                    <span className="badge" title="Positive amount in a spending category: counted as a refund">
                      refund
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!shown.length && <p className="empty">No matching transactions.</p>}
      </div>
      {shown.length > limit && (
        <button type="button" className="show-more" onClick={() => setLimit((l) => l + pageSize * 2)}>
          Show more ({(shown.length - limit).toLocaleString('en-IE')} remaining)
        </button>
      )}
    </div>
  );
}
