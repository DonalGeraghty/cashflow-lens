import { useLayoutEffect, useMemo, useRef } from 'react';
import * as d3 from 'd3';
import { useElementWidth } from '../hooks/useElementWidth';
import { useLatest } from '../hooks/useLatest';
import type { RecurringItem } from '../lib/recurring';
import { MONTH_SHORT, monthLabel, parseMonthKey } from '../lib/dates';
import { formatMoney, formatPct } from '../lib/format';
import { motion, textWidth, truncate } from './core';
import { bindMarkEvents } from './interactions';
import { TipBody, useTooltip } from './useTooltip';

interface Props {
  items: RecurringItem[];
  /** The month columns to draw (the data range). */
  months: string[];
  currency: string;
  onSelect?: (item: RecurringItem) => void;
  onPeek?: (item: RecurringItem) => void;
}

const ROW = 28;
const MARGIN = { top: 22, bottom: 8 };

interface Dot {
  key: string;
  item: RecurringItem;
  month: string;
  amount: number;
}

/**
 * Dot matrix: one row per recurring payment, one column per month. Dot area
 * is proportional to that month's amount relative to the payment's typical
 * amount, so price rises show up as growing dots and gaps as missing ones.
 */
export function RecurringChart({ items, months, currency, onSelect, onPeek }: Props) {
  const [wrapRef, width] = useElementWidth<HTMLDivElement>();
  const { show, hide, tooltip } = useTooltip(wrapRef);
  const rowsRef = useRef<SVGGElement>(null);
  const dotsRef = useRef<SVGGElement>(null);
  const headRef = useRef<SVGGElement>(null);
  const cb = useLatest({ onSelect, onPeek, show, hide });

  const layout = useMemo(() => {
    if (!width || !items.length || !months.length) return null;
    const labelW = Math.min(Math.max(...items.map((i) => textWidth(i.merchant))) + 8, 150, width * 0.3);
    const statW = width < 520 ? 84 : 150;
    const innerW = Math.max(40, width - labelW - statW - 16);
    const x = d3.scaleBand(months, [labelW + 8, labelW + 8 + innerW]).padding(0.1);
    const y = (i: number) => MARGIN.top + i * ROW + ROW / 2;
    const r = d3.scaleSqrt([0, 2], [0, Math.min(8, x.bandwidth() / 2 + 1, ROW / 2 - 3)]).clamp(true);
    const dots: Dot[] = items.flatMap((item) =>
      item.months.filter((m) => x(m) !== undefined).map((month) => ({ key: `${item.kind}|${item.merchant}|${month}`, item, month, amount: item.amounts[month] })),
    );
    const every = Math.max(1, Math.ceil((months.length * 34) / innerW));
    return { labelW, statW, x, y, r, dots, every, height: MARGIN.top + items.length * ROW + MARGIN.bottom };
  }, [items, months, width]);

  useLayoutEffect(() => {
    if (!layout) return;
    const { labelW, statW, x, y, r, dots, every } = layout;
    const t = motion();
    const idx = new Map(items.map((it, i) => [`${it.kind}|${it.merchant}`, i]));
    const rowKey = (it: RecurringItem) => `${it.kind}|${it.merchant}`;

    // Month header
    d3.select(headRef.current!)
      .selectAll<SVGTextElement, string>('text')
      .data(months.filter((_, i) => i % every === 0), (m) => m)
      .join('text')
      .attr('class', 'axis-text')
      .attr('text-anchor', 'middle')
      .attr('y', 12)
      .attr('x', (m) => x(m)! + x.bandwidth() / 2)
      .text((m) => {
        const { year, month } = parseMonthKey(m);
        return month === 1 || m === months[0] ? `${MONTH_SHORT[month - 1]} ${String(year).slice(2)}` : MONTH_SHORT[month - 1];
      });

    // Rows: label, stats and a full-width hit area.
    const rows = d3
      .select(rowsRef.current!)
      .selectAll<SVGGElement, RecurringItem>('g.rec-row')
      .data(items, rowKey)
      .join(
        (enter) => {
          const g = enter.append('g').attr('class', 'rec-row').attr('transform', (d) => `translate(0,${y(idx.get(rowKey(d))!)})`).style('opacity', 0);
          g.append('rect').attr('class', 'row-bg');
          g.append('text').attr('class', 'row-label').attr('dominant-baseline', 'middle');
          g.append('text').attr('class', 'row-stat').attr('dominant-baseline', 'middle').attr('text-anchor', 'end');
          return g;
        },
        (update) => update,
        (exit) => exit.transition(t).style('opacity', 0).remove(),
      );
    rows
      .classed('inactive', (d) => !d.active)
      .transition(t)
      .attr('transform', (d) => `translate(0,${y(idx.get(rowKey(d))!)})`)
      .style('opacity', 1);
    rows.select('rect.row-bg').attr('x', 0).attr('y', -ROW / 2).attr('width', width).attr('height', ROW);
    rows.select('text.row-label').attr('x', 0).text((d) => truncate(d.merchant, labelW));
    rows
      .select('text.row-stat')
      .attr('x', width - 4)
      .text((d) => {
        const change = Math.abs(d.change) >= 0.05 ? ` ${d.change > 0 ? '↑' : '↓'}${formatPct(Math.abs(d.change))}` : '';
        return statW < 100 ? formatMoney(d.typical, currency, { compact: true }) : `${formatMoney(d.typical, currency)}/mo${change}`;
      });
    bindMarkEvents(rows, {
      onClick: (d) => cb.current.onSelect?.(d),
      onPeek: (d) => cb.current.onPeek?.(d),
      onHover: (d, at) =>
        cb.current.show(
          at,
          <TipBody
            title={d.merchant}
            rows={[
              ['Category', d.category],
              ['Typical / month', formatMoney(d.typical, currency)],
              ['Per year', formatMoney(d.annualised, currency)],
              ['Seen', `${d.months.length} months (${monthLabel(d.first)} – ${monthLabel(d.last)})`],
              ['Price change', Math.abs(d.change) >= 0.005 ? formatPct(d.change, { sign: true }) : 'none'],
              ['Status', d.active ? 'Active' : 'Stopped'],
            ]}
            hint="Click to drill in · right-click for transactions"
          />,
        ),
      onLeave: () => cb.current.hide(),
      ariaLabel: (d) => `${d.merchant}: ${formatMoney(d.typical, currency)} a month${d.active ? '' : ', stopped'}`,
    });

    d3.select(dotsRef.current!)
      .selectAll<SVGCircleElement, Dot>('circle')
      .data(dots, (d) => d.key)
      .join(
        (enter) => enter.append('circle').attr('r', 0).attr('cx', (d) => x(d.month)! + x.bandwidth() / 2).attr('cy', (d) => y(idx.get(rowKey(d.item))!)),
        (update) => update,
        (exit) => exit.transition(t).attr('r', 0).remove(),
      )
      .attr('class', (d) => (d.item.kind === 'income' ? 'dot fill-income' : 'dot fill-spend'))
      .transition(t)
      .attr('cx', (d) => x(d.month)! + x.bandwidth() / 2)
      .attr('cy', (d) => y(idx.get(rowKey(d.item))!))
      .attr('r', (d) => r(d.item.typical ? d.amount / d.item.typical : 1));
  }, [layout, items, months, width, currency, cb]);

  return (
    <div ref={wrapRef} className="chart-wrap">
      {!items.length ? (
        <p className="empty">No recurring payments detected (needs 3+ consecutive months with a steady amount).</p>
      ) : (
        <svg className="chart recurring" width="100%" style={{ height: layout?.height ?? items.length * ROW + 30 }} role="group" aria-label="Recurring payments by month">
          <g ref={headRef} />
          <g ref={rowsRef} />
          <g ref={dotsRef} style={{ pointerEvents: 'none' }} />
        </svg>
      )}
      {tooltip}
    </div>
  );
}
