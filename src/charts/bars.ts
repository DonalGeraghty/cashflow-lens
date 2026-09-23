import * as d3 from 'd3';
import { roundedRect, type Radii, type Rect } from './core';
import { bindMarkEvents, type MarkHandlers } from './interactions';

export interface BarMark<D = unknown> {
  /** Join key: marks with the same key tween between layouts. */
  key: string;
  /** Group used by drill-out intros (e.g. the month a column belongs to). */
  group: string;
  rect: Rect;
  /** Collapsed state at the baseline, used when entering/exiting without an intro. */
  base: Rect;
  radii: Radii;
  /** CSS class that sets the fill colour. */
  cls: string;
  datum: D;
}

/**
 * How a freshly mounted chart should animate in:
 *  - `from`: every mark grows out of this rect (drill-in: the bar you clicked).
 *  - `focus`: marks in this group start as the whole plot and shrink into
 *    place (drill-out: the view you left collapses back into its bar).
 */
export interface Intro {
  from?: Rect;
  focus?: string;
}

interface JoinOptions<D> {
  intro: Intro | null;
  plot: Rect;
  transition: d3.Transition<any, any, any, any>;
  handlers: MarkHandlers<BarMark<D>>;
}

/**
 * The one D3 data join every bar chart uses. React never renders inside the
 * <g> passed here; D3 owns those children, so enter/update/exit transitions
 * can run without fighting React's reconciliation.
 */
export function joinBars<D>(g: d3.Selection<SVGGElement, unknown, null, undefined>, marks: BarMark<D>[], opts: JoinOptions<D>) {
  const { intro, plot, transition: t, handlers } = opts;
  const startRect = (m: BarMark<D>): Rect => {
    if (intro?.from) return intro.from;
    if (intro?.focus !== undefined && m.group === intro.focus) return plot;
    return m.base;
  };

  const sel = g
    .selectAll<SVGPathElement, BarMark<D>>('path.bar')
    .data(marks, (d) => d.key)
    .join(
      (enter) =>
        enter
          .append('path')
          .attr('d', (d) => roundedRect(startRect(d), d.radii))
          .style('opacity', intro?.from ? 0.35 : 1)
          .call((e) =>
            e
              .transition(t)
              .attr('d', (d) => roundedRect(d.rect, d.radii))
              .style('opacity', 1),
          ),
      (update) =>
        update.call((u) =>
          u
            .transition(t)
            .attr('d', (d) => roundedRect(d.rect, d.radii))
            .style('opacity', 1),
        ),
      (exit) =>
        exit
          .style('pointer-events', 'none')
          .call((x) =>
            x
              .transition(t)
              .attr('d', (d) => roundedRect(d.base, d.radii))
              .style('opacity', 0)
              .remove(),
          ),
    )
    .attr('class', (d) => `bar ${d.cls}`);

  bindMarkEvents(sel, handlers);
  return sel;
}

export interface TextMark {
  key: string;
  x: number;
  y: number;
  text: string;
  anchor: 'start' | 'middle' | 'end';
  cls?: string;
}

/** Fading text join for value labels. */
export function joinText(g: d3.Selection<SVGGElement, unknown, null, undefined>, marks: TextMark[], t: d3.Transition<any, any, any, any>) {
  g.selectAll<SVGTextElement, TextMark>('text')
    .data(marks, (d) => d.key)
    .join(
      (enter) =>
        enter
          .append('text')
          .attr('x', (d) => d.x)
          .attr('y', (d) => d.y)
          .style('opacity', 0)
          .call((e) => e.transition(t).style('opacity', 1)),
      (update) => update.call((u) => u.transition(t).attr('x', (d) => d.x).attr('y', (d) => d.y).style('opacity', 1)),
      (exit) => exit.call((x) => x.transition(t).style('opacity', 0).remove()),
    )
    .attr('class', (d) => d.cls ?? 'value-label')
    .attr('text-anchor', (d) => d.anchor)
    .attr('dominant-baseline', 'middle')
    .text((d) => d.text);
}
