import { useMemo, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { useData } from '../store/DataContext';
import { usePeek } from '../hooks/usePeek';
import { type BudgetDim, type BudgetStatus, budgetMatches, budgetStatuses, suggestBudget } from '../lib/budget';
import { spendBy } from '../lib/aggregate';
import { addMonths, monthLabel } from '../lib/dates';
import { NO_BUCKET } from '../lib/filters';
import { formatMoney, formatPct } from '../lib/format';
import { bucketClass } from '../charts/BucketChart';
import { Panel, Segmented } from './Panel';

const STATE: Record<BudgetStatus['state'], { icon: string; label: string }> = {
  ok: { icon: '✓', label: 'On track' },
  warn: { icon: '!', label: 'At risk' },
  over: { icon: '✕', label: 'Over budget' },
};

/**
 * Budgets tab: a monthly limit per category or bucket, with progress for any
 * month. Uses the Account filter (budgets are about categories, so the
 * category/bucket filters and drill path don't apply here).
 */
export function BudgetsView() {
  const { all, currency, options, currentMonth, today } = useData();
  const accounts = useAppStore((s) => s.filters.accounts);
  const budgets = useAppStore((s) => s.budgets);
  const { addBudget, updateBudget, removeBudget } = useAppStore.getState();
  const peek = usePeek();

  const rows = useMemo(() => (accounts ? all.filter((t) => accounts.includes(t.account)) : all), [all, accounts]);
  const months = useMemo(() => {
    const ms = new Set(rows.filter((t) => !t.future).map((t) => t.month));
    ms.add(currentMonth);
    return [...ms].sort().reverse();
  }, [rows, currentMonth]);
  const [month, setMonth] = useState(currentMonth);
  const statuses = useMemo(() => budgetStatuses(rows, budgets, month, today), [rows, budgets, month, today]);

  const money = (v: number) => formatMoney(v, currency);
  const totalBudget = statuses.reduce((s, b) => s + b.budget.amount, 0);
  const totalSpent = statuses.reduce((s, b) => s + b.spent, 0);
  const counts = { ok: 0, warn: 0, over: 0 };
  for (const s of statuses) counts[s.state]++;
  const buckets = options.buckets.filter((b) => b !== NO_BUCKET);
  const order = { over: 0, warn: 1, ok: 2 } as const;
  const sorted = [...statuses].sort((a, b) => order[a.state] - order[b.state] || b.pct - a.pct);

  // Quick start: budgets for the biggest spending categories, at their typical level.
  const quickStart = () => {
    const recent = rows.filter((t) => !t.future && t.month >= addMonths(currentMonth, -6) && t.month < currentMonth);
    for (const g of spendBy(recent, (t) => t.category).slice(0, 6)) {
      const amount = suggestBudget(rows, 'category', g.key, currentMonth);
      if (amount > 0) addBudget({ dim: 'category', value: g.key, amount });
    }
  };

  return (
    <div className="stack">
      <Panel
        title="Budgets"
        subtitle={
          budgets.length
            ? `${monthLabel(month, 'long')}: ${money(totalSpent)} of ${money(totalBudget)} budgeted · ${counts.ok} on track · ${counts.warn} at risk · ${counts.over} over`
            : 'Set a monthly limit for any category or bucket and track it here, in the Money flow tooltips and in the pivot (Budget vs actual).'
        }
        controls={
          <select aria-label="Month" value={month} onChange={(e) => setMonth(e.target.value)}>
            {months.map((m) => (
              <option key={m} value={m}>
                {monthLabel(m, 'long')}
                {m === currentMonth ? ' (this month)' : ''}
              </option>
            ))}
          </select>
        }
      >
        {!budgets.length ? (
          <div className="empty-budgets">
            <p className="muted">No budgets yet. Add one below, or start from your spending:</p>
            <button type="button" className="primary" onClick={quickStart}>
              Suggest budgets for my top categories
            </button>
          </div>
        ) : (
          <div className="budget-grid">
            {sorted.map((s) => (
              <BudgetCard
                key={s.budget.id}
                s={s}
                money={money}
                isCurrent={month === currentMonth}
                swatch={s.budget.dim === 'bucket' ? bucketClass(s.budget.value, buckets) : 'fill-spend'}
                onAmount={(amount) => updateBudget(s.budget.id, { amount })}
                onRemove={() => removeBudget(s.budget.id)}
                onPeek={() =>
                  peek(
                    `${s.budget.value} · ${monthLabel(month, 'long')}`,
                    rows.filter((t) => !t.future && t.month === month && budgetMatches(t, s.budget.dim, s.budget.value)),
                  )
                }
              />
            ))}
          </div>
        )}
      </Panel>

      <AddBudget
        categories={options.categories.filter((c) => c !== 'Income')}
        buckets={buckets}
        suggest={(dim, value) => suggestBudget(rows, dim, value, currentMonth)}
        money={money}
        onAdd={addBudget}
        existing={budgets.map((b) => `${b.dim}|${b.value}`)}
      />
    </div>
  );
}

function BudgetCard({
  s,
  money,
  isCurrent,
  swatch,
  onAmount,
  onRemove,
  onPeek,
}: {
  s: BudgetStatus;
  money: (v: number) => string;
  isCurrent: boolean;
  swatch: string;
  onAmount: (v: number) => void;
  onRemove: () => void;
  onPeek: () => void;
}) {
  const { budget, spent, remaining, pct, elapsed, daysLeft, projected, state } = s;
  const when = isCurrent ? `${daysLeft} day${daysLeft === 1 ? '' : 's'} left` : elapsed >= 1 ? 'month ended' : 'not started';
  const detail =
    state === 'over'
      ? `Over by ${money(-remaining)}`
      : state === 'warn' && projected !== null && projected > budget.amount
        ? `Heading for ${money(projected)}`
        : remaining <= 0.005
          ? 'Fully used'
          : `${money(remaining)} left`;
  return (
    <article className={`budget-card state-${state}`}>
      <header>
        <span className={`swatch swatch-square ${swatch}`} aria-hidden="true" />
        <h3>{budget.value}</h3>
        <span className="budget-dim">{budget.dim === 'bucket' ? 'Bucket' : 'Category'}</span>
        <button type="button" className="icon" onClick={onRemove} aria-label={`Remove ${budget.value} budget`}>
          ✕
        </button>
      </header>
      <p className="budget-line">
        <strong>{money(spent)}</strong> of{' '}
        <input
          className="budget-amount"
          type="number"
          min={0}
          step={10}
          value={budget.amount}
          onChange={(e) => onAmount(Math.max(0, Number(e.target.value) || 0))}
          aria-label={`Monthly budget for ${budget.value}`}
        />{' '}
        used · {when}
      </p>
      <div
        className="progress"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={budget.amount}
        aria-valuenow={Math.round(spent)}
        aria-label={`${budget.value}: ${formatPct(pct)} of budget used`}
      >
        <span className="progress-fill" style={{ width: `${Math.min(1, Math.max(0, pct)) * 100}%` }} />
        {isCurrent && elapsed > 0 && elapsed < 1 && (
          <span className="progress-pace" style={{ left: `${elapsed * 100}%` }} title="Where you'd be spending evenly through the month" />
        )}
      </div>
      <footer>
        <span className="budget-state">
          <span className="state-icon" aria-hidden="true">
            {STATE[state].icon}
          </span>
          {STATE[state].label}
        </span>
        <span className="muted">
          {formatPct(Number.isFinite(pct) ? pct : 1)} · {detail}
        </span>
        <button type="button" className="link" onClick={onPeek}>
          Transactions
        </button>
      </footer>
    </article>
  );
}

function AddBudget({
  categories,
  buckets,
  suggest,
  money,
  onAdd,
  existing,
}: {
  categories: string[];
  buckets: string[];
  suggest: (dim: BudgetDim, value: string) => number;
  money: (v: number) => string;
  onAdd: (b: { dim: BudgetDim; value: string; amount: number }) => void;
  existing: string[];
}) {
  const [dim, setDim] = useState<BudgetDim>('category');
  const [value, setValue] = useState('');
  const [amount, setAmount] = useState('');
  const list = dim === 'category' ? categories : buckets;
  const suggestion = value ? suggest(dim, value) : 0;
  const replacing = existing.includes(`${dim}|${value}`);
  const valid = value !== '' && Number(amount) > 0;

  return (
    <Panel title="Add a budget" subtitle="Monthly limit. Adding a budget that already exists updates its amount.">
      <form
        className="add-budget"
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid) return;
          onAdd({ dim, value, amount: Number(amount) });
          setValue('');
          setAmount('');
        }}
      >
        <Segmented<BudgetDim>
          label="Budget type"
          value={dim}
          onChange={(d) => {
            setDim(d);
            setValue('');
          }}
          options={[
            { value: 'category', label: 'Category' },
            { value: 'bucket', label: 'Bucket' },
          ]}
        />
        <select aria-label={dim === 'category' ? 'Category' : 'Bucket'} value={value} onChange={(e) => setValue(e.target.value)}>
          <option value="">Choose a {dim}…</option>
          {list.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <label className="field">
          <span>€ per month</span>
          <input type="number" min={0} step={10} value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Monthly amount" />
        </label>
        {suggestion > 0 && (
          <button type="button" className="link" onClick={() => setAmount(String(suggestion))} title="Median monthly spend over your last 6 complete months">
            Use typical: {money(suggestion)}
          </button>
        )}
        <button type="submit" className="primary" disabled={!valid}>
          {replacing ? 'Update budget' : 'Add budget'}
        </button>
        {dim === 'bucket' && !buckets.length && <span className="muted">Your data has no spending buckets yet.</span>}
      </form>
    </Panel>
  );
}
