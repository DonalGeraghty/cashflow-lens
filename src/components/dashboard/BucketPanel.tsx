import { useMemo } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { useData } from '../../store/DataContext';
import { usePeek } from '../../hooks/usePeek';
import { bucketMonthly } from '../../lib/aggregate';
import { bucketOf } from '../../lib/filters';
import { monthLabel } from '../../lib/dates';
import { monthSteps } from '../../lib/drill';
import { BucketChart, bucketClass } from '../../charts/BucketChart';
import { LegendItem, Panel } from '../Panel';

/** Fixed vs variable vs discretionary spending, month by month. */
export function BucketPanel() {
  const { filtered, currency } = useData();
  const drillInto = useAppStore((s) => s.drillInto);
  const peek = usePeek();
  const { months, buckets } = useMemo(() => bucketMonthly(filtered), [filtered]);

  return (
    <Panel
      title="Spending by bucket"
      subtitle="Fixed essentials vs variable essentials vs discretionary"
      legend={buckets.map((b) => (
        <LegendItem key={b} cls={bucketClass(b, buckets)}>
          {b}
        </LegendItem>
      ))}
    >
      <BucketChart
        months={months}
        buckets={buckets}
        currency={currency}
        onSelect={(month, bucket) => drillInto([...monthSteps(month), { dim: 'bucket', value: bucket }])}
        onPeek={(month, bucket) =>
          peek(`${bucket} · ${monthLabel(month, 'long')}`, filtered.filter((t) => t.month === month && t.kind === 'expense' && bucketOf(t) === bucket))
        }
      />
    </Panel>
  );
}
