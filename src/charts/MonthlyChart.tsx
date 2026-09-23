import { useLayoutEffect, useMemo, useRef } from 'react';
import * as d3 from 'd3';
import { useElementWidth } from '../hooks/useElementWidth';
import { useLatest } from '../hooks/useLatest';
import type { MonthTotals } from '../lib/aggregate';
import { monthLabel, parseMonthKey, MONTH_SHORT } from '../lib/dates';
import { formatMoney, formatPct } from '../lib/format';
import { joinBars, type BarMark, type Intro } from './bars';
import { BAR_MAX, endRadii, motion } from './core';
import { bindMarkEvents } from './interactions';
import { Swatch, TipBody, useTooltip } from './useTooltip';

interface Props {
  months: MonthTotals[];
  currency: string;
  onSelect?: (month: string, el: Element) => void;
  onPeek?: (month: string) => void;
  intro?: Intro | null;
  /** Month to outline (e.g. the one currently drilled into elsewhere). */
  highlight?: string | null;
}

const HEIGHT = 300;
const MARGIN = { top: 16, right: 12, bottom: 28, left: 56 };
type Series = 'income' | 'spend';

/** Grouped income/spending columns per month, with net savings as a line on the same € axis. */
export function MonthlyChart({ months, currency, onSelect, onPeek, intro = null, highlight = null }: Props) {
  const [wrapRef, width] = useElementWidth<HTMLDivElement>();
  const { show, hide, tooltip } = useTooltip(wrapRef);
  const gridRef = useRef<SVGGElement>(null);
  const xAxisRef = useRef<SVGGElement>(null);
  const barsRef = useRef<SVGGElement>(null);
  const lineRef = useRef<SVGPathElement>(null);
  const dotsRef = useRef<SVGGElement>(null);
  const hitRef = useRef<SVGGElement>(null);
  const zeroRef = useRef<SVGLineElement>(null);
  const introRef = useRef(intro);
  const cb = useLatest({ onSelect, onPeek, show, hide });

  const layout = useMemo(() => {
    if (!width || !months.length) return null;
    const innerW = Math.max(60, width - MARGIN.left - MARGIN.right);
    const innerH = HEIGHT - MARGIN.top - MARGIN.bottom;
    const x = d3.scaleBand(months.map((m) => m.month), [0, innerW]).paddingInner(0.2).paddingOuter(0.1);
    const sub = d3.scaleBand<Series>(['income', 'spend'], [0, x.bandwidth()]).padding(0.1);
    const lo = Math.min(0, d3.min(months, (m) => m.net) ?? 0);
    const hi = d3.max(months, (m) => Math.max(m.income, m.spend, m.net)) || 1;
    const y = d3.scaleLinear([lo, hi], [innerH, 0]).nice();
    const thick = Math.min(BAR_MAX / 1.5, sub.bandwidth());
    const y0 = y(0);

    const marks: BarMark<{ month: MonthTotals; series: Series }>[] = months.flatMap((m) =>
      (['income', 'spend'] as Series[]).map((series) => {
        const v = m[series];
        const left = x(m.month)! + sub(series)! + (sub.bandwidth() - thick) / 2;
        const yv = y(v);
        return {
          key: `${m.month}|${series}`,
          group: m.month,
          rect: { x: left, y: Math.min(y0, yv), w: thick, h: Math.abs(y0 - yv) },
          base: { x: left, y: y0, w: thick, h: 0 },
          radii: endRadii(v < 0 ? 'bottom' : 'top'),
          cls: series === 'income' ? 'fill-income' : 'fill-spend',
          datum: { month: m, series },
        };
      }),
    );
    const points = months.map((m) => ({ m, x: x(m.month)! + x.bandwidth() / 2, y: y(m.net) }));
    // Thin the month labels so they never collide (~46px per label).
    const every = Math.max(1, Math.ceil((months.length * 46) / innerW));
    const ticks = months.map((m) => m.month).filter((_, i) => i % every === 0);
    return { innerW, innerH, x, y, marks, points, ticks };
  }, [months, width]);

  useLayoutEffect(() => {
    if (!layout) return;
    const { innerW, innerH, x, y, marks, points, ticks } = layout;
    const t = motion();
    const tipFor = (m: MonthTotals) => (
      <TipBody
        title={monthLabel(m.month, 'long')}
        rows={[
          [<><Swatch cls="fill-income" /> Income</>, formatMoney(m.income, currency)],
          [<><Swatch cls="fill-spend" /> Spending</>, formatMoney(m.spend, currency)],
          [<><Swatch cls="stroke-net" shape="line" /> Net</>, formatMoney(m.net, currency, { sign: true })],
          ['Savings rate', m.income > 0 ? formatPct(m.net / m.income) : '–'],
        ]}
        hint="Click to drill in · right-click or long-press for transactions"
      />
    );

    d3.select(gridRef.current!)
      .transition(t)
      .call(
        d3
          .axisLeft(y)
          .ticks(5)
          .tickSize(-innerW)
          .tickPadding(8)
          .tickFormat((v) => formatMoney(Number(v), currency, { compact: true })),
      );
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

    const intro = introRef.current;
    joinBars(d3.select(barsRef.current!), marks, {
      // Intro rects arrive in stage coordinates; the bars live inside the margins.
      intro: intro && { ...intro, from: intro.from && { ...intro.from, x: intro.from.x - MARGIN.left, y: intro.from.y - MARGIN.top } },
      plot: { x: 0, y: 0, w: innerW, h: innerH },
      transition: t,
      handlers: {}, // the per-month hit areas below handle interaction
    }).classed('highlight', (d) => d.group === highlight);
    introRef.current = null;

    // Net savings line: 2px, same € scale (never a second axis).
    const line = d3
      .line<(typeof points)[number]>()
      .x((p) => p.x)
      .y((p) => p.y)
      .curve(d3.curveMonotoneX);
    d3.select(lineRef.current!).transition(t).attr('d', line(points) ?? '');
    d3.select(dotsRef.current!)
      .selectAll<SVGCircleElement, (typeof points)[number]>('circle')
      .data(points, (p) => p.m.month)
      .join(
        (enter) => enter.append('circle').attr('r', 0).attr('cx', (p) => p.x).attr('cy', (p) => p.y),
        (update) => update,
        (exit) => exit.transition(t).attr('r', 0).remove(),
      )
      .attr('class', 'dot-net')
      .transition(t)
      .attr('cx', (p) => p.x)
      .attr('cy', (p) => p.y)
      .attr('r', 4);

    // Full-height transparent hit areas: bigger targets than the thin bars.
    const hits = d3
      .select(hitRef.current!)
      .selectAll<SVGRectElement, (typeof points)[number]>('rect')
      .data(points, (p) => p.m.month)
      .join('rect')
      .attr('class', 'hit')
      .attr('x', (p) => x(p.m.month)!)
      .attr('y', 0)
      .attr('width', x.bandwidth())
      .attr('height', innerH);
    bindMarkEvents(hits, {
      onClick: (p, el) => cb.current.onSelect?.(p.m.month, el),
      onPeek: (p) => cb.current.onPeek?.(p.m.month),
      onHover: (p, at) => cb.current.show(at, tipFor(p.m)),
      onLeave: () => cb.current.hide(),
      ariaLabel: (p) =>
        `${monthLabel(p.m.month, 'long')}: income ${formatMoney(p.m.income, currency)}, spending ${formatMoney(p.m.spend, currency)}, net ${formatMoney(p.m.net, currency)}`,
    });
  }, [layout, currency, highlight, cb]);

  return (
    <div ref={wrapRef} className="chart-wrap">
      {!months.length ? (
        <p className="empty">No transactions for the current filters.</p>
      ) : (
        <svg className="chart" width="100%" height={HEIGHT} role="group" aria-label="Monthly income, spending and net savings">
          {layout && (
            <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
              <g ref={gridRef} className="axis axis-y grid" />
              <g ref={xAxisRef} className="axis axis-x" />
              <line ref={zeroRef} className="baseline" x1={0} />
              <g ref={barsRef} />
              <path ref={lineRef} className="line-net" />
              <g ref={dotsRef} />
              <g ref={hitRef} />
            </g>
          )}
        </svg>
      )}
      {tooltip}
    </div>
  );
}
