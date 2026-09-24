import { useLayoutEffect, useMemo, useRef, type ReactNode } from 'react';
import * as d3 from 'd3';
import { sankey, sankeyLinkHorizontal, type SankeyLink, type SankeyNode } from 'd3-sankey';
import { useElementWidth } from '../hooks/useElementWidth';
import { useLatest } from '../hooks/useLatest';
import type { FlowGraph, FlowLink, FlowNode } from '../lib/flow';
import { NO_BUCKET } from '../lib/filters';
import { bucketClass } from './BucketChart';
import { fillVar } from './colors';
import { motion, textWidth, truncate } from './core';
import { bindMarkEvents } from './interactions';
import { useTooltip } from './useTooltip';

type SNode = SankeyNode<FlowNode, FlowLink>;
type SLink = SankeyLink<FlowNode, FlowLink>;

interface Props {
  graph: FlowGraph;
  formatValue: (v: number) => string;
  nodeTooltip: (n: FlowNode, value: number) => ReactNode;
  linkTooltip: (l: FlowLink, from: FlowNode, to: FlowNode) => ReactNode;
  onSelectNode?: (n: FlowNode) => void;
  onSelectLink?: (l: FlowLink) => void;
  onPeekNode?: (n: FlowNode) => void;
  onPeekLink?: (l: FlowLink, from: FlowNode, to: FlowNode) => void;
  ariaLabel: string;
}

const NODE_W = 14;
const ROW = 34; // vertical room per node in the busiest column
const LABEL_GAP = 6;
const LABEL_H = 14; // a label needs this much vertical room (node + gap); thinner nodes rely on the tooltip

/**
 * Sankey diagram. d3-sankey does the maths (node positions, link widths);
 * a D3 data join draws and animates nodes, links and labels inside <g>s
 * that React never touches, same as every other chart here.
 */
export function SankeyChart({ graph, formatValue, nodeTooltip, linkTooltip, onSelectNode, onSelectLink, onPeekNode, onPeekLink, ariaLabel }: Props) {
  const [wrapRef, width] = useElementWidth<HTMLDivElement>();
  const { show, hide, tooltip } = useTooltip(wrapRef);
  const linksRef = useRef<SVGGElement>(null);
  const nodesRef = useRef<SVGGElement>(null);
  const labelsRef = useRef<SVGGElement>(null);
  const cb = useLatest({ show, hide, nodeTooltip, linkTooltip, onSelectNode, onSelectLink, onPeekNode, onPeekLink, formatValue });

  const layout = useMemo(() => {
    if (!width || !graph.nodes.length) return null;
    const layers = [...new Set(graph.nodes.map((n) => n.column))].sort((a, b) => a - b);
    const first = layers[0];
    const last = layers[layers.length - 1];
    // Room for "Name  €12.3K" beside a node.
    const labelW = (n: FlowNode) => textWidth(`${n.label}  ${formatValue(99_999)}`) + 12;
    // Labels on the first column sit to the left of their nodes; everything else to the right.
    const leftNodes = graph.nodes.filter((n) => n.column === first);
    const rightNodes = graph.nodes.filter((n) => n.column === last);
    const margin = {
      top: 8,
      bottom: 8,
      left: Math.min(Math.max(...leftNodes.map(labelW), 60), Math.max(90, width * 0.18)),
      right: Math.min(Math.max(...rightNodes.map(labelW), 60), Math.max(110, width * 0.22)),
    };
    const busiest = d3.max(d3.rollups(graph.nodes, (v) => v.length, (n) => n.column), ([, c]) => c) ?? 1;
    const height = Math.max(440, busiest * ROW + margin.top + margin.bottom);
    const innerW = Math.max(120, width - margin.left - margin.right);
    const innerH = height - margin.top - margin.bottom;

    // nodeSort/linkSort(null) keep the order buildFlow chose (buckets in their
    // usual order, categories grouped under their bucket) so flows don't cross.
    // Leave a full label's height between nodes (the chart is sized so this fits),
    // so even the thinnest category keeps a readable label.
    const padding = Math.min(LABEL_H, Math.max(4, innerH / busiest / 2));
    const generator = sankey<FlowNode, FlowLink>()
      .nodeId((d) => d.id)
      .nodeAlign((n) => layers.indexOf(n.column))
      .nodeWidth(NODE_W)
      .nodePadding(padding)
      .nodeSort(null)
      .linkSort(null)
      .extent([
        [0, 0],
        [innerW, innerH],
      ]);
    const { nodes, links } = generator({
      nodes: graph.nodes.map((n) => ({ ...n })),
      links: graph.links.map((l) => ({ ...l })),
    });

    const buckets = graph.nodes.filter((n) => n.role === 'bucket').map((n) => n.bucket!);
    // No bucket data at all: the lone "Spent" node takes the app's spending colour.
    const bucketFill = (b: string) => (buckets.length === 1 && b === NO_BUCKET ? 'fill-spend' : bucketClass(b, buckets));
    // Money coming in wears the income colour: sources, the Income node and the flows between them.
    const INCOME_FILL = 'fill-income';
    const nodeCls = (n: FlowNode): string => {
      switch (n.role) {
        case 'source':
          return INCOME_FILL;
        case 'hub':
          // The root is "Spending" (not income) when the selection has no income.
          return n.id === 'hub' ? INCOME_FILL : 'fill-total';
        case 'bucket':
        case 'category':
          return bucketFill(n.bucket!);
        case 'saved':
          return 'fill-saved';
        case 'deficit':
          return 'fill-up';
        default:
          return 'fill-total';
      }
    };
    // Links are tinted with their flow's colour (fill class -> CSS variable).
    const cssVar = fillVar;
    const linkColour = (l: SLink) => {
      const s = l.source as SNode;
      const t = l.target as SNode;
      if (l.bucket) return cssVar(bucketFill(l.bucket));
      if (t.role === 'saved') return cssVar('fill-saved');
      if (s.role === 'deficit') return cssVar('fill-up');
      if (s.role === 'source') return cssVar(INCOME_FILL);
      return cssVar('fill-total');
    };

    // First-column labels sit left of their nodes (in the left margin); all others to the right.
    const labelLeft = (n: FlowNode) => layers.length > 1 && n.column === first;
    const labelRoom = (n: FlowNode) => (labelLeft(n) ? margin.left : n.column === last ? margin.right : innerW / layers.length) - LABEL_GAP * 2;
    return { margin, height, innerW, nodes, links, nodeCls, linkColour, labelLeft, labelRoom, padding };
  }, [graph, width, formatValue]);

  useLayoutEffect(() => {
    if (!layout) return;
    const { nodes, links, nodeCls, linkColour, labelLeft, labelRoom, padding } = layout;
    const t = motion();
    const path = sankeyLinkHorizontal<FlowNode, FlowLink>();

    // ---- links
    const linkSel = d3
      .select(linksRef.current!)
      .selectAll<SVGPathElement, SLink>('path')
      .data(links, (d) => d.id)
      .join(
        (enter) =>
          enter
            .append('path')
            .attr('d', path)
            .style('opacity', 0)
            .attr('stroke-width', (d) => Math.max(1, d.width ?? 1)),
        (update) => update,
        (exit) => exit.style('pointer-events', 'none').call((x) => x.transition(t).style('opacity', 0).remove()),
      )
      .attr('class', 'flow-link')
      .style('stroke', linkColour);
    linkSel
      .transition(t)
      .style('opacity', 1)
      .attr('d', path)
      .attr('stroke-width', (d) => Math.max(1, d.width ?? 1));
    bindMarkEvents(linkSel, {
      onClick: (l) => cb.current.onSelectLink?.(l),
      onPeek: (l) => cb.current.onPeekLink?.(l, l.source as SNode, l.target as SNode),
      onHover: (l, at) => cb.current.show(at, cb.current.linkTooltip(l, l.source as SNode, l.target as SNode)),
      onLeave: () => cb.current.hide(),
      ariaLabel: (l) => `${(l.source as SNode).label} to ${(l.target as SNode).label}: ${cb.current.formatValue(l.value)}`,
    });

    // ---- nodes
    const nodeSel = d3
      .select(nodesRef.current!)
      .selectAll<SVGRectElement, SNode>('rect')
      .data(nodes, (d) => d.id)
      .join(
        (enter) =>
          enter
            .append('rect')
            .attr('x', (d) => d.x0!)
            .attr('y', (d) => d.y0!)
            .attr('width', (d) => d.x1! - d.x0!)
            .attr('height', (d) => Math.max(1, d.y1! - d.y0!))
            .attr('rx', 2)
            .style('opacity', 0),
        (update) => update,
        (exit) => exit.style('pointer-events', 'none').call((x) => x.transition(t).style('opacity', 0).remove()),
      )
      .attr('class', (d) => `flow-node ${nodeCls(d)}`);
    nodeSel
      .transition(t)
      .style('opacity', 1)
      .attr('x', (d) => d.x0!)
      .attr('y', (d) => d.y0!)
      .attr('width', (d) => d.x1! - d.x0!)
      .attr('height', (d) => Math.max(1, d.y1! - d.y0!));
    bindMarkEvents(nodeSel, {
      onClick: (n) => cb.current.onSelectNode?.(n),
      onPeek: (n) => cb.current.onPeekNode?.(n),
      onHover: (n, at) => cb.current.show(at, cb.current.nodeTooltip(n, n.value ?? 0)),
      onLeave: () => cb.current.hide(),
      ariaLabel: (n) => `${n.label}: ${cb.current.formatValue(n.value ?? 0)}`,
    });

    // ---- labels
    const labelled = nodes.filter((n) => n.y1! - n.y0! + padding >= LABEL_H || n.role === 'hub');
    const valueText = (n: SNode) => cb.current.formatValue(n.value ?? 0);
    d3.select(labelsRef.current!)
      .selectAll<SVGTextElement, SNode>('text')
      .data(labelled, (d) => d.id)
      .join(
        (enter) => {
          // New labels start at their final spot and fade in (rather than flying in from 0,0).
          const txt = enter
            .append('text')
            .style('opacity', 0)
            .attr('dominant-baseline', 'middle')
            .attr('x', (d) => (labelLeft(d) ? d.x0! - LABEL_GAP : d.x1! + LABEL_GAP))
            .attr('y', (d) => (d.y0! + d.y1!) / 2);
          txt.append('tspan').attr('class', 'flow-label-name');
          txt.append('tspan').attr('class', 'flow-label-value').attr('dx', '0.4em');
          return txt;
        },
        (update) => update,
        (exit) => exit.call((x) => x.transition(t).style('opacity', 0).remove()),
      )
      .attr('class', 'flow-label')
      .attr('text-anchor', (d) => (labelLeft(d) ? 'end' : 'start'))
      .call((sel) => {
        sel.select('tspan.flow-label-name').text((d) => truncate(d.label, Math.max(40, labelRoom(d) - textWidth(valueText(d)) - 8)));
        sel.select('tspan.flow-label-value').text(valueText);
      })
      .transition(t)
      .style('opacity', 1)
      .attr('x', (d) => (labelLeft(d) ? d.x0! - LABEL_GAP : d.x1! + LABEL_GAP))
      .attr('y', (d) => (d.y0! + d.y1!) / 2);
  }, [layout, cb]);

  return (
    <div ref={wrapRef} className="chart-wrap">
      {!graph.nodes.length ? (
        <p className="empty">Nothing to show for the current filters.</p>
      ) : (
        <svg className="chart sankey" width="100%" style={{ height: layout?.height ?? 360 }} role="group" aria-label={ariaLabel}>
          {layout && (
            <g transform={`translate(${layout.margin.left},${layout.margin.top})`}>
              <g ref={linksRef} />
              <g ref={nodesRef} />
              <g ref={labelsRef} style={{ pointerEvents: 'none' }} />
            </g>
          )}
        </svg>
      )}
      {tooltip}
    </div>
  );
}
