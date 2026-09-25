import { useCallback, useMemo, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { useData } from '../store/DataContext';
import { usePeek } from '../hooks/usePeek';
import { buildFlow, flowDrillSteps, matchesFlow, type FlowLink, type FlowMatch, type FlowNode } from '../lib/flow';
import { formatMoney, formatPct } from '../lib/format';
import { SankeyChart } from '../charts/SankeyChart';
import { TipBody } from '../charts/useTooltip';
import { findBudget, monthsSpanned } from '../lib/budget';
import { NO_BUCKET } from '../lib/filters';
import { Panel, Segmented } from './Panel';

type Detail = 'categories' | 'buckets';
type Sources = 'split' | 'combined';

/** Money flow tab: a Sankey from income, through spending buckets, to categories. */
export function FlowView() {
  const { filtered, currency } = useData();
  const drillInto = useAppStore((s) => s.drillInto);
  const peek = usePeek();
  const [detail, setDetail] = useState<Detail>('categories');
  const [sources, setSources] = useState<Sources>('split');

  const graph = useMemo(
    () => buildFlow(filtered, { categories: detail === 'categories', incomeSources: sources === 'split', maxIncome: 5 }),
    [filtered, detail, sources],
  );

  const money = useCallback((v: number) => formatMoney(v, currency), [currency]);
  const compact = useCallback((v: number) => formatMoney(v, currency, { compact: true }), [currency]);
  const budgets = useAppStore((s) => s.budgets);
  // A monthly budget scales to the number of months in view.
  const monthsInView = useMemo(() => monthsSpanned(filtered.filter((t) => !t.future)), [filtered]);

  const rowsFor = useCallback((m: FlowMatch) => filtered.filter((t) => matchesFlow(t, m)), [filtered]);

  // Percentages are of income when there is some, else of spending.
  const base = graph.income > 0 ? graph.income : graph.spend;
  const baseName = graph.income > 0 ? 'Share of income' : 'Share of spending';
  const hint = (m: FlowMatch | null) =>
    flowDrillSteps(m) ? 'Click to drill in · right-click for transactions' : m ? 'Right-click for transactions' : undefined;

  const nodeTooltip = useCallback(
    (n: FlowNode, value: number) => {
      const rows: [string, string][] = [['Amount', money(value)]];
      if (base > 0 && n.role !== 'hub') rows.push([baseName, formatPct(value / base)]);
      if (n.role === 'saved' && graph.income > 0) rows.splice(1, 1, ['Savings rate', formatPct(value / graph.income)]);
      if (n.role === 'deficit') rows.push(['Why', 'Spending was more than income, so this came from savings']);
      if (n.match?.merchants) rows.push(['Includes', n.match.merchants.slice(0, 6).join(', ') + (n.match.merchants.length > 6 ? '…' : '')]);
      const budget =
        n.role === 'category'
          ? findBudget(budgets, 'category', n.label)
          : n.role === 'bucket' && n.bucket && n.bucket !== NO_BUCKET
            ? findBudget(budgets, 'bucket', n.bucket)
            : undefined;
      if (budget && monthsInView > 0) {
        const limit = budget.amount * monthsInView;
        rows.push(['Budget', monthsInView > 1 ? `${money(limit)} (${money(budget.amount)}/mo × ${monthsInView})` : money(limit)]);
        rows.push(['Budget used', `${formatPct(value / limit)}${value > limit ? ` · over by ${money(value - limit)}` : ''}`]);
      }
      return <TipBody title={n.label} rows={rows} hint={hint(n.match)} />;
    },
    [money, base, baseName, graph.income, budgets, monthsInView],
  );

  const linkTooltip = useCallback(
    (l: FlowLink, from: FlowNode & { value?: number }, to: FlowNode) => {
      const rows: [string, string][] = [['Amount', money(l.value)]];
      if (from.value) rows.push([`Share of ${from.label}`, formatPct(l.value / from.value)]);
      if (base > 0) rows.push([baseName, formatPct(l.value / base)]);
      return <TipBody title={`${from.label} → ${to.label}`} rows={rows} hint={hint(l.match)} />;
    },
    [money, base, baseName],
  );

  const drill = (m: FlowMatch | null) => {
    const steps = flowDrillSteps(m);
    if (steps) drillInto(steps);
  };

  const summary =
    graph.income > 0
      ? graph.deficit > 0
        ? `Income ${money(graph.income)}, spending ${money(graph.spend)}: ${money(graph.deficit)} more than came in.`
        : `Income ${money(graph.income)}, spending ${money(graph.spend)}, saved ${money(graph.saved)} (${formatPct(graph.saved / graph.income)}).`
      : graph.spend > 0
        ? `Spending ${money(graph.spend)} (no income in this selection).`
        : '';

  return (
    <Panel
      title="Money flow"
      drillable
      subtitle={
        <>
          Where the money comes from and where it goes: income → spending buckets → categories. Flow widths show the money.
          {summary && (
            <>
              <br />
              <strong>{summary}</strong>
            </>
          )}
        </>
      }
      controls={
        <>
          <Segmented<Sources>
            label="Income sources"
            value={sources}
            onChange={setSources}
            options={[
              { value: 'split', label: 'Income by source' },
              { value: 'combined', label: 'Combined' },
            ]}
          />
          <Segmented<Detail>
            label="Detail"
            value={detail}
            onChange={setDetail}
            options={[
              { value: 'categories', label: 'Buckets + categories' },
              { value: 'buckets', label: 'Buckets only' },
            ]}
          />
        </>
      }
    >
      <SankeyChart
        graph={graph}
        formatValue={compact}
        nodeTooltip={nodeTooltip}
        linkTooltip={linkTooltip}
        onSelectNode={(n) => drill(n.match)}
        onSelectLink={(l) => drill(l.match)}
        onPeekNode={(n) => n.match && peek(n.label, rowsFor(n.match))}
        onPeekLink={(l, from, to) => l.match && peek(`${from.label} → ${to.label}`, rowsFor(l.match))}
        ariaLabel="Sankey diagram of income flowing to spending buckets and categories"
      />
      <p className="footnote">
        Refunds are netted within each category. A category where refunds were bigger than spending has no outgoing flow, so it isn't drawn.
      </p>
    </Panel>
  );
}
