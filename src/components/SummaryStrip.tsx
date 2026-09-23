import { useMemo } from 'react';
import { useData } from '../store/DataContext';
import { summarise } from '../lib/aggregate';
import { formatMoney, formatPct } from '../lib/format';
import { bucketClass } from '../charts/BucketChart';

/** Total in, total out, net and savings rate for whatever is currently filtered + drilled. */
export function SummaryStrip() {
  const { filtered, currency } = useData();
  const s = useMemo(() => summarise(filtered), [filtered]);
  const bucketNames = s.byBucket.map((b) => b.bucket);
  const positive = s.byBucket.filter((b) => b.spend > 0);
  const bucketTotal = positive.reduce((sum, b) => sum + b.spend, 0);

  return (
    <section className="summary" aria-label="Summary for the selected period">
      <Stat label="Money in" value={formatMoney(s.income, currency)} />
      <Stat label="Money out" value={formatMoney(s.spend, currency)} />
      <Stat label="Net" value={formatMoney(s.net, currency, { sign: true })} note={s.net < 0 ? 'Spent more than earned' : undefined} />
      <Stat label="Savings rate" value={s.savingsRate === null ? '–' : formatPct(s.savingsRate)} note={s.savingsRate === null ? 'No income in selection' : undefined} />
      <div className="stat stat-wide">
        <div className="stat-label">Where the money went</div>
        {bucketTotal > 0 ? (
          <>
            <div className="meter" role="img" aria-label={positive.map((b) => `${b.bucket} ${formatPct(b.spend / bucketTotal)}`).join(', ')}>
              {positive.map((b) => (
                <span key={b.bucket} className={bucketClass(b.bucket, bucketNames)} style={{ flexGrow: b.spend }} title={`${b.bucket}: ${formatMoney(b.spend, currency)}`} />
              ))}
            </div>
            <div className="meter-legend">
              {positive.map((b) => (
                <span key={b.bucket} className="legend-item">
                  <span className={`swatch swatch-square ${bucketClass(b.bucket, bucketNames)}`} aria-hidden="true" />
                  {b.bucket} <strong>{formatPct(b.spend / bucketTotal)}</strong>
                </span>
              ))}
            </div>
          </>
        ) : (
          <div className="stat-note">No spending in selection</div>
        )}
      </div>
      <div className="stat-count">{s.count.toLocaleString('en-IE')} transactions</div>
    </section>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {note && <div className="stat-note">{note}</div>}
    </div>
  );
}
