import { useCallback, useMemo, useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { useData } from '../../store/DataContext';
import { usePeek } from '../../hooks/usePeek';
import { spendBy } from '../../lib/aggregate';
import { dimValue, monthSteps } from '../../lib/drill';
import { monthLabel } from '../../lib/dates';
import { formatMoney, formatPct } from '../../lib/format';
import { HBarChart, type HBarItem } from '../../charts/HBarChart';
import { TipBody } from '../../charts/useTooltip';
import { Panel, Segmented } from '../Panel';

type Mode = 'month' | 'period';

/** Spending by category for one month ("this month" or the drilled month) or the whole filtered period. */
export function CategoryPanel() {
  const { filtered, context, currency, currentMonth } = useData();
  const drill = useAppStore((s) => s.drill);
  const drillInto = useAppStore((s) => s.drillInto);
  const peek = usePeek();
  const [mode, setMode] = useState<Mode>('month');

  const contextMonths = useMemo(() => [...new Set(context.map((t) => t.month))].sort(), [context]);
  const month =
    dimValue(drill, 'month') ??
    (contextMonths.includes(currentMonth) ? currentMonth : contextMonths.filter((m) => m <= currentMonth).pop() ?? contextMonths[contextMonths.length - 1]);

  const rows = useMemo(() => (mode === 'month' ? context.filter((t) => t.month === month) : filtered), [mode, context, filtered, month]);
  const items = useMemo<HBarItem[]>(() => {
    const groups = spendBy(rows, (t) => t.category);
    const total = groups.reduce((s, g) => s + g.spend, 0);
    return groups.map((g) => ({
      key: g.key,
      label: g.key,
      value: g.spend,
      cls: 'fill-spend',
      tooltip: (
        <TipBody
          title={g.key}
          rows={[
            ['Spending', formatMoney(g.spend, currency)],
            ['Share', total > 0 ? formatPct(g.spend / total) : '–'],
            ['Transactions', g.count],
          ]}
          hint="Click to drill in · right-click for transactions"
        />
      ),
    }));
  }, [rows, currency]);

  const fmt = useCallback((v: number) => formatMoney(v, currency), [currency]);
  const fmtAxis = useCallback((v: number) => formatMoney(v, currency, { compact: true }), [currency]);
  const scope = mode === 'month' ? (month ? monthLabel(month, 'long') : '–') : 'Selected period';

  return (
    <Panel
      title="Spending by category"
      subtitle={scope}
      controls={
        <Segmented<Mode>
          label="Category period"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'month', label: dimValue(drill, 'month') ? 'Drilled month' : 'This month' },
            { value: 'period', label: 'Selected period' },
          ]}
        />
      }
    >
      <HBarChart
        items={items}
        format={fmt}
        formatAxis={fmtAxis}
        ariaLabel={`Spending by category, ${scope}`}
        emptyText={`No spending in ${scope}.`}
        onSelect={(item) => drillInto(mode === 'month' && month ? [...monthSteps(month), { dim: 'category', value: item.key }] : [{ dim: 'category', value: item.key }])}
        onPeek={(item) => peek(`${item.key} · ${scope}`, rows.filter((t) => t.category === item.key))}
      />
    </Panel>
  );
}
