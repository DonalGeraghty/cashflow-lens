import { useMemo, useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { useData } from '../../store/DataContext';
import { usePeek } from '../../hooks/usePeek';
import { detectRecurring } from '../../lib/recurring';
import { monthRange } from '../../lib/dates';
import { formatMoney } from '../../lib/format';
import { RecurringChart } from '../../charts/RecurringChart';
import { LegendItem, Panel, Segmented } from '../Panel';

type Show = 'active' | 'all';

/** Automatically detected subscriptions and regular payments. */
export function RecurringPanel() {
  const { context, currency } = useData();
  const drillInto = useAppStore((s) => s.drillInto);
  const peek = usePeek();
  const [show, setShow] = useState<Show>('active');

  const all = useMemo(() => detectRecurring(context), [context]);
  const items = useMemo(() => (show === 'active' ? all.filter((r) => r.active) : all), [all, show]);
  const months = useMemo(() => {
    const ms = context.map((t) => t.month).sort();
    return ms.length ? monthRange(ms[0], ms[ms.length - 1]) : [];
  }, [context]);

  const activeOut = all.filter((r) => r.active && r.kind === 'expense');
  const monthly = activeOut.reduce((s, r) => s + r.typical, 0);

  return (
    <Panel
      className="recurring-panel"
      title="Recurring payments"
      subtitle={
        activeOut.length
          ? `${activeOut.length} active outgoing: about ${formatMoney(monthly, currency)} a month, ${formatMoney(monthly * 12, currency)} a year`
          : 'Detected from 3+ consecutive months with a steady amount'
      }
      controls={
        <Segmented<Show>
          label="Which payments"
          value={show}
          onChange={setShow}
          options={[
            { value: 'active', label: 'Active' },
            { value: 'all', label: 'Include stopped' },
          ]}
        />
      }
      legend={
        <>
          <LegendItem cls="fill-spend" shape="dot">
            Outgoing
          </LegendItem>
          <LegendItem cls="fill-income" shape="dot">
            Incoming
          </LegendItem>
          <span className="legend-note">Dot size = that month's amount vs the usual amount</span>
        </>
      }
    >
      <RecurringChart
        items={items}
        months={months}
        currency={currency}
        onSelect={(r) => drillInto([{ dim: 'merchant', value: r.merchant }])}
        onPeek={(r) => peek(`${r.merchant} (recurring)`, context.filter((t) => t.merchant === r.merchant && t.kind === r.kind))}
      />
    </Panel>
  );
}
