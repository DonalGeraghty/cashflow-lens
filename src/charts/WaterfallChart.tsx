import { useLayoutEffect, useMemo, useRef, type ReactNode } from 'react';
import * as d3 from 'd3';
import { useElementWidth } from '../hooks/useElementWidth';
import { useLatest } from '../hooks/useLatest';
import type { WaterfallStep } from '../lib/waterfall';
import { joinBars, joinText, type BarMark, type TextMark } from './bars';
import { BAR_MAX, endRadii, motion, textWidth, truncate } from './core';
import { bindMarkEvents } from './interactions';
import { useTooltip } from './useTooltip';

interface Props {
  steps: WaterfallStep[];
  formatAxis: (v: number) => string;
  /** Short label for the few bars that get a direct value label. */
  formatLabel: (s: WaterfallStep) => string;
  tooltip: (s: WaterfallStep) => ReactNode;
  onSelect?: (s: WaterfallStep) => void;
  onPeek?: (s: WaterfallStep) => void;
  ariaLabel: string;
  /**
   * How many of the largest non-total steps get a direct value label (totals
   * always do). 'all' labels every step when the labels fit, else falls back to 5.
   */
  labelSteps?: number | 'all';
}

const HEIGHT = 380;
const MAX_LABEL = 120;

/** Colour says what a step is (income / spending / total); direction says which way it moved. */
function stepClass(s: WaterfallStep): string {
  if (s.kind === 'total') return 'fill-total';
  if (s.source?.kind === 'income') return 'fill-income';
  if (s.source?.kind === 'expense') return 'fill-spend';
  return s.kind === 'increase' ? 'fill-income' : 'fill-spend';
}

/** Gap between steps inside a group, and between groups, as a fraction of a bar slot. */
const GAP_IN_GROUP = 0.2;
const GAP_BETWEEN = { grouped: 0.9, single: 0.45 };
const PAD_OUTER = 0.3;

interface Group {
  id: string;
  label: string;
  steps: WaterfallStep[];
}

/**
 * Vertical waterfall: floating bars from each step's start to its end, with
 * hairline connectors carrying the running total across to the next bar.
 * New steps grow out of the level they start from.
 */
export function WaterfallChart({ steps, formatAxis, formatLabel, tooltip, onSelect, onPeek, ariaLabel, labelSteps = 5 }: Props) {
  const [wrapRef, width] = useElementWidth<HTMLDivElement>();
  const { show, hide, tooltip: tip } = useTooltip(wrapRef);
  const gridRef = useRef<SVGGElement>(null);
  const xAxisRef = useRef<SVGGElement>(null);
  const zeroRef = useRef<SVGLineElement>(null);
  const linksRef = useRef<SVGGElement>(null);
  const barsRef = useRef<SVGGElement>(null);
  const labelsRef = useRef<SVGGElement>(null);
  const hitRef = useRef<SVGGElement>(null);
  const cb = useLatest({ onSelect, onPeek, show, hide, tooltip, formatLabel });

  const layout = useMemo(() => {
    if (!width || !steps.length) return null;
    const left = 64;
    const right = 12;
    const innerW = Math.max(60, width - left - right);

    // Consecutive steps with the same group share a slot cluster and one label.
    const groups: Group[] = [];
    for (const s of steps) {
      const id = s.group ?? s.key;
      const last = groups[groups.length - 1];
      if (last && last.id === id) last.steps.push(s);
      else groups.push({ id, label: s.groupLabel ?? s.label, steps: [s] });
    }
    const grouped = groups.some((g) => g.steps.length > 1);
    const gapBetween = grouped ? GAP_BETWEEN.grouped : GAP_BETWEEN.single;
    const units = steps.length + (steps.length - groups.length) * GAP_IN_GROUP + (groups.length - 1) * gapBetween + 2 * PAD_OUTER;
    const slot = innerW / units;
    // Left edge of each step's slot, walking along the groups.
    const xOf = new Map<string, number>();
    const centre = new Map<string, number>();
    let cursor = PAD_OUTER * slot;
    groups.forEach((g, gi) => {
      if (gi > 0) cursor += gapBetween * slot;
      const startX = cursor;
      g.steps.forEach((s, si) => {
        if (si > 0) cursor += GAP_IN_GROUP * slot;
        xOf.set(s.key, cursor);
        cursor += slot;
      });
      centre.set(g.id, (startX + cursor) / 2);
    });
    const pitch = innerW / groups.length;

    // Rotate the labels only when they don't fit under their group.
    const longest = Math.min(MAX_LABEL, d3.max(groups, (g) => textWidth(g.label)) ?? 0);
    const rotate = longest > pitch - 6;
    const bottom = rotate ? Math.ceil(longest * Math.sin(Math.PI / 5)) + 24 : 28;
    const margin = { top: 22, right, bottom, left };
    const innerH = HEIGHT - margin.top - margin.bottom;

    const lo = Math.min(0, d3.min(steps, (s) => Math.min(s.start, s.end)) ?? 0);
    const hi = Math.max(0, d3.max(steps, (s) => Math.max(s.start, s.end)) ?? 0) || 1;
    const y = d3.scaleLinear([lo, hi], [innerH, 0]).nice();
    const thick = Math.min(BAR_MAX * 1.6, slot);

    const marks: BarMark<WaterfallStep>[] = steps.map((s) => {
      const bx = xOf.get(s.key)! + (slot - thick) / 2;
      const y0 = y(s.start);
      const y1 = y(s.end);
      // The "data end" is where the step lands, so that corner gets rounded.
      const up = s.end >= s.start;
      return {
        key: s.key,
        group: s.key,
        rect: { x: bx, y: Math.min(y0, y1), w: thick, h: Math.max(1, Math.abs(y1 - y0)) },
        base: { x: bx, y: y0, w: thick, h: 0 },
        radii: endRadii(up ? 'top' : 'bottom'),
        cls: stepClass(s),
        datum: s,
      };
    });

    const links = steps.slice(0, -1).map((s, i) => ({
      key: `${s.key}>${steps[i + 1].key}`,
      x1: xOf.get(s.key)! + (slot + thick) / 2,
      x2: xOf.get(steps[i + 1].key)! + (slot - thick) / 2,
      y: y(s.end),
    }));

    const widest = d3.max(steps, (s) => textWidth(formatLabel(s))) ?? 0;
    const howMany = labelSteps === 'all' ? (widest + 8 <= innerW / steps.length ? steps.length : 5) : labelSteps;
    const biggest = new Set(
      [...steps]
        .filter((s) => s.kind !== 'total')
        .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
        .slice(0, howMany)
        .map((s) => s.key),
    );
    const labelled = steps.filter((s) => s.kind === 'total' || biggest.has(s.key));

    const labels = groups.map((g) => ({ id: g.id, label: truncate(g.label, MAX_LABEL), x: centre.get(g.id)! }));
    return { margin, innerW, innerH, xOf, slot, y, marks, links, labelled, rotate, labels };
  }, [steps, width, labelSteps, formatLabel]);

  useLayoutEffect(() => {
    if (!layout) return;
    const { innerW, innerH, xOf, slot, y, marks, links, labelled, rotate, labels } = layout;
    const t = motion();

    d3.select(gridRef.current!)
      .transition(t)
      .call(d3.axisLeft(y).ticks(6).tickSize(-innerW).tickPadding(8).tickFormat((v) => formatAxis(Number(v))));

    // One label per group (a month's income + spending pair shares one), centred under it.
    d3.select(xAxisRef.current!)
      .attr('transform', `translate(0,${innerH})`)
      .selectAll<SVGTextElement, (typeof labels)[number]>('text')
      .data(labels, (d) => d.id)
      .join('text')
      .attr('transform', (d) => `translate(${d.x},12)${rotate ? ' rotate(-36)' : ''}`)
      .attr('dx', rotate ? '-0.3em' : null)
      .attr('dy', rotate ? '0.4em' : '0.71em')
      .style('text-anchor', rotate ? 'end' : 'middle')
      .text((d) => d.label);

    d3.select(zeroRef.current!).transition(t).attr('x2', innerW).attr('y1', y(0)).attr('y2', y(0));

    // Connectors: hairlines carrying each running total across to the next bar.
    d3.select(linksRef.current!)
      .selectAll<SVGLineElement, (typeof links)[number]>('line')
      .data(links, (d) => d.key)
      .join(
        (enter) => enter.append('line').attr('x1', (d) => d.x1).attr('x2', (d) => d.x1).attr('y1', (d) => d.y).attr('y2', (d) => d.y),
        (update) => update,
        (exit) => exit.transition(t).style('opacity', 0).remove(),
      )
      .attr('class', 'connector')
      .transition(t)
      .style('opacity', 1)
      .attr('x1', (d) => d.x1)
      .attr('x2', (d) => d.x2)
      .attr('y1', (d) => d.y)
      .attr('y2', (d) => d.y);

    joinBars(d3.select(barsRef.current!), marks, { intro: null, plot: { x: 0, y: 0, w: innerW, h: innerH }, transition: t, handlers: {} });

    const texts: TextMark[] = labelled.map((s) => {
      const above = s.end >= s.start || (s.kind === 'total' && s.end >= 0);
      const top = y(Math.max(s.start, s.end));
      const bottom = y(Math.min(s.start, s.end));
      return {
        key: s.key,
        x: xOf.get(s.key)! + slot / 2,
        y: above ? top - 10 : bottom + 12,
        text: cb.current.formatLabel(s),
        anchor: 'middle',
        cls: s.kind === 'total' ? 'value-label total-label' : 'value-label',
      };
    });
    joinText(d3.select(labelsRef.current!), texts, t);

    // Full-height hit areas: easier targets than thin or tiny bars.
    const hits = d3
      .select(hitRef.current!)
      .selectAll<SVGRectElement, WaterfallStep>('rect')
      .data(steps, (s) => s.key)
      .join('rect')
      .attr('class', 'hit')
      .classed('no-drill', (s) => !s.source || s.source.values.length !== 1)
      .attr('x', (s) => xOf.get(s.key)!)
      .attr('y', 0)
      .attr('width', slot)
      .attr('height', innerH);
    bindMarkEvents(hits, {
      onClick: (s) => cb.current.onSelect?.(s),
      onPeek: (s) => cb.current.onPeek?.(s),
      onHover: (s, at) => cb.current.show(at, cb.current.tooltip(s)),
      onLeave: () => cb.current.hide(),
      ariaLabel: (s) => `${s.label}: ${cb.current.formatLabel(s)}`,
    });
  }, [layout, steps, formatAxis, cb]);

  return (
    <div ref={wrapRef} className="chart-wrap">
      {!steps.length ? (
        <p className="empty">Nothing to show for the current filters.</p>
      ) : (
        <svg className="chart" width="100%" height={HEIGHT} role="group" aria-label={ariaLabel}>
          {layout && (
            <g transform={`translate(${layout.margin.left},${layout.margin.top})`}>
              <g ref={gridRef} className="axis axis-y grid" />
              <g ref={xAxisRef} className="axis axis-x axis-labels" />
              <line ref={zeroRef} className="baseline" x1={0} />
              <g ref={linksRef} />
              <g ref={barsRef} />
              <g ref={labelsRef} />
              <g ref={hitRef} />
            </g>
          )}
        </svg>
      )}
      {tip}
    </div>
  );
}
