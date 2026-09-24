import { useLayoutEffect, useMemo, useRef } from 'react';
import * as d3 from 'd3';
import { useElementWidth } from '../hooks/useElementWidth';
import { useLatest } from '../hooks/useLatest';
import type { BucketMonth } from '../lib/aggregate';
import { NO_BUCKET } from '../lib/filters';
import { MONTH_SHORT, monthLabel, parseMonthKey } from '../lib/dates';
import { formatMoney, formatPct } from '../lib/format';
import { joinBars, type BarMark } from './bars';
import { BAR_MAX, NO_RADII, endRadii, motion } from './core';
import { Swatch, TipBody, useTooltip } from './useTooltip';

interface Props {
  months: BucketMonth[];
  buckets: string[];
  currency: string;
  onSelect?: (month: string, bucket: string, el: Element) => void;
  onPeek?: (month: string, bucket: string) => void;
}

const HEIGHT = 260;
const MARGIN = { top: 12, right: 12, bottom: 28, left: 56 };
const GAP = 2; // surface gap between stacked segments

/** Colour follows the bucket name, never its position, so filters don't repaint survivors. */
const BUCKET_CLASS: Record<string, string> = {
  'Fixed Essential': 'fill-fixed',
  'Variable Essential': 'fill-variable',
  Discretionary: 'fill-disc',
  Other: 'fill-other-bucket',
  [NO_BUCKET]: 'fill-none',
};
const EXTRA = ['fill-x1', 'fill-x2'];
export function bucketClass(bucket: string, all: string[]): string {
  if (BUCKET_CLASS[bucket]) return BUCKET_CLASS[bucket];
  const extras = all.filter((b) => !BUCKET_CLASS[b]).sort();
  return EXTRA[Math.max(0, extras.indexOf(bucket)) % EXTRA.length];
}

interface Seg {
  month: string;
  bucket: string;
  value: number;
  total: number;
}

/** Monthly spending stacked by bucket (Fixed / Variable / Discretionary / Other). */
export function BucketChart({ months, buckets, currency, onSelect, onPeek }: Props) {
  const [wrapRef, width] = useElementWidth<HTMLDivElement>();
  const { show, hide, tooltip } = useTooltip(wrapRef);
  const gridRef = useRef<SVGGElement>(null);
  const xAxisRef = useRef<SVGGElement>(null);
  const barsRef = useRef<SVGGElement>(null);
  const zeroRef = useRef<SVGLineElement>(null);
  const cb = useLatest({ onSelect, onPeek, show, hide });

  const layout = useMemo(() => {
    if (!width || !months.length) return null;
    const innerW = Math.max(60, width - MARGIN.left - MARGIN.right);
    const innerH = HEIGHT - MARGIN.top - MARGIN.bottom;
    const x = d3.scaleBand(months.map((m) => m.month), [0, innerW]).paddingInner(0.35).paddingOuter(0.1);
    // Diverging offset: a bucket that is net-negative for the month (refunds) stacks below zero.
    const stack = d3
      .stack<BucketMonth, string>()
      .keys(buckets)
      .value((d, k) => d.values[k] ?? 0)
      .offset(d3.stackOffsetDiverging);
    const series = stack(months);
    const lo = Math.min(0, d3.min(series, (s) => d3.min(s, (p) => p[0])) ?? 0);
    const hi = d3.max(series, (s) => d3.max(s, (p) => p[1])) || 1;
    const y = d3.scaleLinear([lo, hi], [innerH, 0]).nice();
    const thick = Math.min(BAR_MAX * 1.2, x.bandwidth());

    // The segment that ends highest in each month gets the rounded top.
    const topKey = new Map<string, string>();
    months.forEach((m, i) => {
      let best: { key: string; top: number } | null = null;
      for (const s of series) {
        const [a, b] = s[i];
        if (b > a && (!best || b >= best.top)) best = { key: s.key, top: b };
      }
      if (best) topKey.set(m.month, best.key);
    });

    const marks: BarMark<Seg>[] = [];
    for (const s of series) {
      for (const p of s) {
        const month = p.data.month;
        const left = x(month)! + (x.bandwidth() - thick) / 2;
        const y0 = y(p[0]);
        const y1 = y(p[1]);
        const top = Math.min(y0, y1);
        const h = Math.max(0, Math.abs(y0 - y1) - GAP);
        const total = d3.sum(buckets, (b) => p.data.values[b] ?? 0);
        marks.push({
          key: `${month}|${s.key}`,
          group: month,
          rect: { x: left, y: top + (h > 0 ? GAP / 2 : 0), w: thick, h },
          base: { x: left, y: y(0), w: thick, h: 0 },
          radii: topKey.get(month) === s.key ? endRadii('top') : NO_RADII,
          cls: bucketClass(s.key, buckets),
          datum: { month, bucket: s.key, value: p.data.values[s.key] ?? 0, total },
        });
      }
    }
    const every = Math.max(1, Math.ceil((months.length * 46) / innerW));
    const ticks = months.map((m) => m.month).filter((_, i) => i % every === 0);
    return { innerW, innerH, x, y, marks: marks.filter((m) => m.datum.value !== 0), ticks };
  }, [months, buckets, width]);

  useLayoutEffect(() => {
    if (!layout) return;
    const { innerW, innerH, x, y, marks, ticks } = layout;
    const t = motion();
    d3.select(gridRef.current!)
      .transition(t)
      .call(d3.axisLeft(y).ticks(5).tickSize(-innerW).tickPadding(8).tickFormat((v) => formatMoney(Number(v), currency, { compact: true })));
    d3.select(xAxisRef.current!)
      .attr('transform', `translate(0,${innerH})`)
      .transition(t)
      .call(
        d3
          .axisBottom(x)
          .tickValues(ticks)
          .tickSize(0)
          .tickPadding(10)
          .tickFormat((k) => {
            const { year, month } = parseMonthKey(k);
            return month === 1 || k === ticks[0] ? `${MONTH_SHORT[month - 1]} ${String(year).slice(2)}` : MONTH_SHORT[month - 1];
          }),
      );
    d3.select(zeroRef.current!).transition(t).attr('x2', innerW).attr('y1', y(0)).attr('y2', y(0));

    joinBars(d3.select(barsRef.current!), marks, {
      intro: null,
      plot: { x: 0, y: 0, w: innerW, h: innerH },
      transition: t,
      handlers: {
        onClick: (m, el) => cb.current.onSelect?.(m.datum.month, m.datum.bucket, el),
        onPeek: (m) => cb.current.onPeek?.(m.datum.month, m.datum.bucket),
        onHover: (m, at) =>
          cb.current.show(
            at,
            <TipBody
              title={`${m.datum.bucket} · ${monthLabel(m.datum.month)}`}
              rows={[
                [<><Swatch cls={m.cls} /> Spending</>, formatMoney(m.datum.value, currency)],
                ['Share of month', m.datum.total > 0 ? formatPct(m.datum.value / m.datum.total) : '–'],
                ['Month total', formatMoney(m.datum.total, currency)],
              ]}
              hint="Click to drill in · right-click for transactions"
            />,
          ),
        onLeave: () => cb.current.hide(),
        ariaLabel: (m) => `${m.datum.bucket}, ${monthLabel(m.datum.month, 'long')}: ${formatMoney(m.datum.value, currency)}`,
      },
    });
  }, [layout, currency, cb]);

  return (
    <div ref={wrapRef} className="chart-wrap">
      {!months.length ? (
        <p className="empty">No spending for the current filters.</p>
      ) : (
        <svg className="chart" width="100%" height={HEIGHT} role="group" aria-label="Monthly spending by bucket">
          {layout && (
            <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
              <g ref={gridRef} className="axis axis-y grid" />
              <g ref={xAxisRef} className="axis axis-x" />
              <line ref={zeroRef} className="baseline" x1={0} />
              <g ref={barsRef} />
            </g>
          )}
        </svg>
      )}
      {tooltip}
    </div>
  );
}
