import { useCallback, useMemo, useState } from 'react';
import type { Transaction } from '../types';
import { useAppStore } from '../store/useAppStore';
import { useData } from '../store/DataContext';
import { usePeek } from '../hooks/usePeek';
import { categoryWaterfall, monthlyWaterfall, type WaterfallStep } from '../lib/waterfall';
import { monthlyTotals } from '../lib/aggregate';
import { monthSteps } from '../lib/drill';
import { formatMoney, formatPct } from '../lib/format';
import { WaterfallChart } from '../charts/WaterfallChart';
import { TipBody } from '../charts/useTooltip';
import { LegendItem, Panel, Segmented } from './Panel';

type Mode = 'months' | 'categories';
type Top = '8' | '12' | 'all';

/** Waterfall tab: net savings month by month, or where the income went. */
export function WaterfallView() {
  const { filtered, currency } = useData();
  const drillInto = useAppStore((s) => s.drillInto);
  const peek = usePeek();
  const [mode, setMode] = useState<Mode>('months');
  const [top, setTop] = useState<Top>('12');

  const steps = useMemo(
    () =>
      mode === 'categories'
        ? categoryWaterfall(filtered, { maxIncome: 4, maxCategories: top === 'all' ? Infinity : Number(top) })
        : monthlyWaterfall(filtered),
    [mode, top, filtered],
  );
  // Income and spending per month, so a month's tooltip can explain its net.
  const monthTotals = useMemo(() => new Map(monthlyTotals(filtered).map((m) => [m.month, m])), [filtered]);
  const totalIncome = steps.find((s) => s.key === 'total|income')?.value ?? 0;

  const rowsFor = useCallback(
    (s: WaterfallStep): Transaction[] => {
      if (!s.source) return s.key === 'total|income' ? filtered.filter((t) => t.kind === 'income') : filtered;
      const { dim, values, kind } = s.source;
      const set = new Set(values);
      return filtered.filter((t) => set.has(t[dim]) && (!kind || t.kind === kind));
    },
    [filtered],
  );

  const money = useCallback((v: number, sign = false) => formatMoney(v, currency, { sign }), [currency]);
  const formatAxis = useCallback((v: number) => formatMoney(v, currency, { compact: true }), [currency]);
  const formatLabel = useCallback(
    (s: WaterfallStep) => formatMoney(s.value, currency, { compact: true, sign: s.kind !== 'total' }),
    [currency],
  );

  const tooltip = useCallback(
    (s: WaterfallStep) => {
      const rows: [string, string][] =
        s.kind === 'total'
          ? [['Total', money(s.value)]]
          : [
              ['Change', money(s.value, true)],
              ['Running total', money(s.end)],
            ];
      if (mode === 'categories' && s.kind === 'decrease' && totalIncome > 0) rows.push(['Share of income', formatPct(-s.value / totalIncome)]);
      const m = mode === 'months' && s.source?.dim === 'month' ? monthTotals.get(s.source.values[0]) : undefined;
      if (m) {
        rows.splice(
          0,
          rows.length,
          ['Net', money(m.net, true)],
          ['Income', money(m.income)],
          ['Spending', money(m.spend)],
          ['Running total', money(s.end)],
        );
        if (m.income > 0) rows.push(['Saved', formatPct(m.net / m.income)]);
      }
      if (s.source && s.source.values.length > 1) rows.push(['Includes', s.source.values.slice(0, 6).join(', ') + (s.source.values.length > 6 ? '…' : '')]);
      const canDrill = s.source?.values.length === 1;
      return (
        <TipBody
          title={s.label}
          rows={rows}
          hint={canDrill ? `Click to drill into the ${s.source?.dim === 'month' ? 'month' : s.source?.dim} · right-click for transactions` : 'Right-click for transactions'}
        />
      );
    },
    [money, mode, totalIncome, monthTotals],
  );

  const select = (s: WaterfallStep) => {
    if (!s.source || s.source.values.length !== 1) return;
    const [value] = s.source.values;
    if (s.source.dim === 'month') drillInto(monthSteps(value));
    else drillInto([{ dim: s.source.dim, value }]);
  };

  const categoryLegend = (
    <>
      <LegendItem cls="fill-income">Income</LegendItem>
      <LegendItem cls="fill-spend">Spending</LegendItem>
      <LegendItem cls="fill-total">Total</LegendItem>
    </>
  );
  const monthLegend = (
    <>
      <LegendItem cls="fill-income">Net positive (saved)</LegendItem>
      <LegendItem cls="fill-spend">Net negative (overspent)</LegendItem>
      <LegendItem cls="fill-total">Total saved</LegendItem>
    </>
  );

  return (
    <Panel
      title="Waterfall"
      drillable
      subtitle={
        mode === 'categories'
          ? 'Income sources build up to total income; each spending category takes its share, leaving net savings.'
          : "Each month's net (income − spending) added to the running total, ending with the total saved over the period."
      }
      controls={
        <>
          <Segmented<Mode>
            label="Waterfall type"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'months', label: 'Net by month' },
              { value: 'categories', label: 'Where the income went' },
            ]}
          />
          {mode === 'categories' && (
            <Segmented<Top>
              label="Categories shown"
              value={top}
              onChange={setTop}
              options={[
                { value: '8', label: 'Top 8' },
                { value: '12', label: '12' },
                { value: 'all', label: 'All' },
              ]}
            />
          )}
        </>
      }
      legend={mode === 'categories' ? categoryLegend : monthLegend}
    >
      <WaterfallChart
        steps={steps}
        formatAxis={formatAxis}
        formatLabel={formatLabel}
        tooltip={tooltip}
        onSelect={select}
        onPeek={(s) => peek(s.label, rowsFor(s))}
        labelSteps={mode === 'months' ? 'all' : 5}
        ariaLabel={mode === 'categories' ? 'Waterfall from income to net savings' : 'Waterfall of monthly net savings'}
      />
      {steps.length > 0 && (
        <details className="waterfall-table">
          <summary>Show as table</summary>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Step</th>
                  <th className="num">Change</th>
                  <th className="num">Running total</th>
                </tr>
              </thead>
              <tbody>
                {steps.map((s) => (
                  <tr key={s.key} className={s.kind === 'total' ? 'total-row' : undefined}>
                    <td>{s.label}</td>
                    <td className="num">{s.kind === 'total' ? '' : money(s.value, true)}</td>
                    <td className="num">{money(s.end)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </Panel>
  );
}
