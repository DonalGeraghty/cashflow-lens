import { useCallback, useMemo, useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { useData } from '../../store/DataContext';
import { usePeek } from '../../hooks/usePeek';
import { categoryChanges } from '../../lib/aggregate';
import { addMonths, monthLabel } from '../../lib/dates';
import { dimValue, monthSteps } from '../../lib/drill';
import { formatMoney, formatPct } from '../../lib/format';
import { HBarChart, type HBarItem } from '../../charts/HBarChart';
import { TipBody } from '../../charts/useTooltip';
import { LegendItem, Panel, Segmented } from '../Panel';

type Baseline = 'prev' | 'avg3';

/**
 * Month-over-month change per category, to spot creeping costs. Uses the
 * "context" rows (filters without the date range) so the comparison months
 * are always available.
 */
export function ChangePanel() {
  const { context, currency, currentMonth } = useData();
  const drill = useAppStore((s) => s.drill);
  const drillInto = useAppStore((s) => s.drillInto);
  const peek = usePeek();
  const [baseline, setBaseline] = useState<Baseline>('prev');
  const [picked, setPicked] = useState<string | null>(null);

  const months = useMemo(() => [...new Set(context.map((t) => t.month))].sort().slice(1), [context]);
  const fallback = months.filter((m) => m <= currentMonth).pop() ?? months[months.length - 1] ?? null;
  const drilled = dimValue(drill, 'month');
  const month = drilled && months.includes(drilled) ? drilled : picked && months.includes(picked) ? picked : fallback;

  const items = useMemo<HBarItem[]>(() => {
    if (!month) return [];
    return categoryChanges(context, month)
      .map((c) => {
        const base = baseline === 'prev' ? c.previous : c.avg3;
        const delta = baseline === 'prev' ? c.deltaPrev : c.deltaAvg;
        return { c, base, delta };
      })
      .filter((x) => Math.abs(x.delta) >= 0.5)
      .sort((a, b) => b.delta - a.delta)
      .map(({ c, base, delta }) => ({
        key: c.category,
        label: c.category,
        value: delta,
        cls: delta > 0 ? 'fill-up' : 'fill-down',
        tooltip: (
          <TipBody
            title={c.category}
            rows={[
              [monthLabel(month), formatMoney(c.current, currency)],
              [baseline === 'prev' ? monthLabel(addMonths(month, -1)) : '3-month average', formatMoney(base, currency)],
              ['Change', formatMoney(delta, currency, { sign: true })],
              ['Change %', base > 0 ? formatPct(delta / base, { sign: true }) : 'new'],
            ]}
            hint="Click to drill in · right-click for this month's transactions"
          />
        ),
      }));
  }, [context, month, baseline, currency]);

  const fmt = useCallback((v: number) => formatMoney(v, currency, { sign: true }), [currency]);
  const fmtAxis = useCallback((v: number) => formatMoney(v, currency, { compact: true, sign: true }), [currency]);

  return (
    <Panel
      title="What changed"
      drillable
      subtitle={month ? `${monthLabel(month, 'long')} vs ${baseline === 'prev' ? monthLabel(addMonths(month, -1), 'long') : 'the 3 months before'}` : 'Needs at least two months of data'}
      controls={
        <>
          <select aria-label="Month to compare" value={month ?? ''} onChange={(e) => setPicked(e.target.value)} disabled={Boolean(drilled)}>
            {[...months].reverse().map((m) => (
              <option key={m} value={m}>
                {monthLabel(m)}
              </option>
            ))}
          </select>
          <Segmented<Baseline>
            label="Compare with"
            value={baseline}
            onChange={setBaseline}
            options={[
              { value: 'prev', label: 'vs last month' },
              { value: 'avg3', label: 'vs 3-mo avg' },
            ]}
          />
        </>
      }
      legend={
        <>
          <LegendItem cls="fill-up">Spent more</LegendItem>
          <LegendItem cls="fill-down">Spent less</LegendItem>
        </>
      }
    >
      <HBarChart
        items={items}
        format={fmt}
        formatAxis={fmtAxis}
        ariaLabel="Change in spending per category"
        emptyText="No changes to show."
        onSelect={(item) => month && drillInto([...monthSteps(month), { dim: 'category', value: item.key }])}
        onPeek={(item) => month && peek(`${item.key} · ${monthLabel(month, 'long')}`, context.filter((t) => t.month === month && t.category === item.key))}
      />
    </Panel>
  );
}
