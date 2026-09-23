import { useCallback, useMemo, useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { useData } from '../../store/DataContext';
import { usePeek } from '../../hooks/usePeek';
import { topMerchants } from '../../lib/aggregate';
import { formatMoney } from '../../lib/format';
import { HBarChart, type HBarItem } from '../../charts/HBarChart';
import { TipBody } from '../../charts/useTooltip';
import { Panel, Segmented } from '../Panel';

type TopN = '10' | '15' | '25';

/** Top merchants / payees by total spend in the filtered data. */
export function MerchantPanel() {
  const { filtered, currency } = useData();
  const drillInto = useAppStore((s) => s.drillInto);
  const peek = usePeek();
  const [n, setN] = useState<TopN>('10');

  const { items, top } = useMemo(() => {
    const { items: head, other } = topMerchants(filtered, Number(n));
    const list: HBarItem[] = head.map((m) => ({
      key: m.key,
      label: m.key,
      value: m.spend,
      cls: 'fill-spend',
      tooltip: (
        <TipBody
          title={m.key}
          rows={[
            ['Spending', formatMoney(m.spend, currency)],
            ['Transactions', m.count],
            ['Average', formatMoney(m.spend / m.count, currency)],
          ]}
          hint="Click to drill in · right-click for transactions"
        />
      ),
    }));
    if (other) {
      list.push({
        key: '__other__',
        label: other.key,
        value: other.spend,
        cls: 'fill-muted',
        clickable: false,
        tooltip: <TipBody title={other.key} rows={[['Spending', formatMoney(other.spend, currency)], ['Transactions', other.count]]} hint="Right-click for transactions" />,
      });
    }
    return { items: list, top: new Set(head.map((m) => m.key)) };
  }, [filtered, n, currency]);

  const fmt = useCallback((v: number) => formatMoney(v, currency), [currency]);
  const fmtAxis = useCallback((v: number) => formatMoney(v, currency, { compact: true }), [currency]);

  return (
    <Panel
      title="Top merchants"
      drillable
      subtitle="By total spend, refunds netted"
      controls={
        <Segmented<TopN>
          label="Number of merchants"
          value={n}
          onChange={setN}
          options={[
            { value: '10', label: 'Top 10' },
            { value: '15', label: '15' },
            { value: '25', label: '25' },
          ]}
        />
      }
    >
      <HBarChart
        items={items}
        format={fmt}
        formatAxis={fmtAxis}
        ariaLabel="Top merchants by spend"
        onSelect={(item) => drillInto([{ dim: 'merchant', value: item.key }])}
        onPeek={(item) =>
          peek(
            item.key === '__other__' ? 'Other merchants' : item.key,
            filtered.filter((t) => t.kind === 'expense' && (item.key === '__other__' ? !top.has(t.merchant) : t.merchant === item.key)),
          )
        }
      />
    </Panel>
  );
}
