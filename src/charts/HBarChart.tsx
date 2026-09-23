import { useLayoutEffect, useMemo, useRef, type ReactNode } from 'react';
import * as d3 from 'd3';
import { useElementWidth } from '../hooks/useElementWidth';
import { useLatest } from '../hooks/useLatest';
import { joinBars, joinText, type BarMark, type Intro, type TextMark } from './bars';
import { BAR_MAX, endRadii, motion, textWidth, truncate } from './core';
import { useTooltip } from './useTooltip';

export interface HBarItem {
  key: string;
  label: string;
  value: number;
  /** Fill class, e.g. "fill-spend" or "fill-up". */
  cls: string;
  tooltip: ReactNode;
  /** False for rows like "Other (12)" that can't be drilled into. */
  clickable?: boolean;
}

interface Props {
  items: HBarItem[];
  format: (v: number) => string;
  formatAxis?: (v: number) => string;
  ariaLabel: string;
  onSelect?: (item: HBarItem, el: Element) => void;
  onPeek?: (item: HBarItem) => void;
  /** Animation used when this chart first mounts (drill transitions). */
  intro?: Intro | null;
  /** Stage-relative offset of this chart, to map an intro rect into plot space. */
  emptyText?: string;
}

const ROW = 28;

/**
 * Horizontal bars. Pattern used by every chart in the app:
 *   - useMemo computes the layout with D3 scales (pure maths, no DOM);
 *   - React renders the static skeleton (<svg>, <g> containers, legend);
 *   - a layout effect hands the <g> refs to D3, which runs the data joins
 *     and transitions. React never renders children inside those <g>s.
 */
export function HBarChart({ items, format, formatAxis = format, ariaLabel, onSelect, onPeek, intro = null, emptyText }: Props) {
  const [wrapRef, width] = useElementWidth<HTMLDivElement>();
  const { show, hide, tooltip } = useTooltip(wrapRef);
  const barsRef = useRef<SVGGElement>(null);
  const labelsRef = useRef<SVGGElement>(null);
  const xAxisRef = useRef<SVGGElement>(null);
  const yAxisRef = useRef<SVGGElement>(null);
  const zeroRef = useRef<SVGLineElement>(null);
  // Intro only applies to the first render after mount.
  const introRef = useRef(intro);
  const cb = useLatest({ onSelect, onPeek, show, hide });

  const layout = useMemo(() => {
    if (!width || !items.length) return null;
    const labelW = Math.min(Math.max(40, d3.max(items, (d) => textWidth(d.label)) ?? 0), Math.min(180, width * 0.34));
    const valueW = Math.min(Math.max(44, (d3.max(items, (d) => textWidth(format(d.value))) ?? 0) + 12), 96);
    const hasNeg = items.some((d) => d.value < 0);
    const margin = { top: 4, right: valueW, bottom: 24, left: labelW + 10 + (hasNeg ? valueW * 0.6 : 0) };
    const innerW = Math.max(40, width - margin.left - margin.right);
    const innerH = items.length * ROW;
    const y = d3.scaleBand(items.map((d) => d.key), [0, innerH]).paddingInner(0.25).paddingOuter(0.1);
    const lo = Math.min(0, d3.min(items, (d) => d.value) ?? 0);
    const hi = Math.max(0, d3.max(items, (d) => d.value) ?? 0);
    const x = d3.scaleLinear([lo, hi || 1], [0, innerW]).nice();
    const thick = Math.min(BAR_MAX, y.bandwidth());
    const x0 = x(0);

    const marks: BarMark<HBarItem>[] = items.map((d) => {
      const x1 = x(d.value);
      const top = y(d.key)! + (y.bandwidth() - thick) / 2;
      return {
        key: d.key,
        group: d.key,
        rect: { x: Math.min(x0, x1), y: top, w: Math.abs(x1 - x0), h: thick },
        base: { x: x0, y: top, w: 0, h: thick },
        radii: endRadii(d.value < 0 ? 'left' : 'right'),
        cls: d.cls,
        datum: d,
      };
    });
    const texts: TextMark[] = items.map((d) => ({
      key: d.key,
      x: d.value < 0 ? x(d.value) - 6 : x(d.value) + 6,
      y: y(d.key)! + y.bandwidth() / 2,
      text: format(d.value),
      anchor: d.value < 0 ? 'end' : 'start',
    }));
    const labelOf = new Map(items.map((d) => [d.key, d.label]));
    return { margin, innerW, innerH, x, y, marks, texts, labelOf, labelW, hasNeg };
  }, [items, width, format]);

  useLayoutEffect(() => {
    if (!layout) return;
    const { innerW, innerH, x, y, marks, texts, labelOf, labelW, margin } = layout;
    const t = motion();

    joinBars(d3.select(barsRef.current!), marks, {
      intro: introRef.current && {
        from: introRef.current.from && { ...introRef.current.from, x: introRef.current.from.x - margin.left, y: introRef.current.from.y - margin.top },
        focus: introRef.current.focus,
      },
      plot: { x: 0, y: 0, w: innerW, h: innerH },
      transition: t,
      handlers: {
        onClick: (m, el) => m.datum.clickable !== false && cb.current.onSelect?.(m.datum, el),
        onPeek: (m) => cb.current.onPeek?.(m.datum),
        onHover: (m, at) => cb.current.show(at, m.datum.tooltip),
        onLeave: () => cb.current.hide(),
        ariaLabel: (m) => `${m.datum.label}: ${format(m.datum.value)}`,
      },
    });
    introRef.current = null;
    joinText(d3.select(labelsRef.current!), texts, t);

    // Vertical hairline gridlines come from the x axis with inner ticks spanning the plot.
    d3.select(xAxisRef.current!)
      .transition(t)
      .attr('transform', `translate(0,${innerH})`)
      .call(
        d3
          .axisBottom(x)
          .ticks(Math.max(2, Math.floor(innerW / 90)))
          .tickFormat((v) => formatAxis(Number(v)))
          .tickSize(-innerH)
          .tickPadding(8),
      );
    d3.select(yAxisRef.current!)
      .transition(t)
      .call(
        d3
          .axisLeft(y)
          .tickSize(0)
          .tickPadding(layout.hasNeg ? 10 + margin.left - labelW - 10 : 10)
          .tickFormat((k) => truncate(labelOf.get(k) ?? k, labelW)),
      );
    d3.select(zeroRef.current!).transition(t).attr('x1', x(0)).attr('x2', x(0)).attr('y2', innerH);
  }, [layout, formatAxis, format, cb]);

  if (!items.length) {
    return (
      <div ref={wrapRef} className="chart-wrap">
        <p className="empty">{emptyText ?? 'Nothing to show for the current filters.'}</p>
      </div>
    );
  }

  const height = layout ? layout.innerH + layout.margin.top + layout.margin.bottom : items.length * ROW + 28;
  return (
    <div ref={wrapRef} className="chart-wrap">
      <svg className="chart" width="100%" style={{ height }} role="group" aria-label={ariaLabel}>
        {layout && (
          <g transform={`translate(${layout.margin.left},${layout.margin.top})`}>
            <g ref={xAxisRef} className="axis axis-x grid" />
            <g ref={yAxisRef} className="axis axis-y axis-labels" />
            <line ref={zeroRef} className="baseline" y1={0} />
            <g ref={barsRef} />
            <g ref={labelsRef} />
          </g>
        )}
      </svg>
      {tooltip}
    </div>
  );
}
