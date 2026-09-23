import { useCallback, useEffect, useMemo, useRef } from 'react';
import * as d3 from 'd3';
import { useAppStore } from '../store/useAppStore';
import { useData } from '../store/DataContext';
import { usePeek } from '../hooks/usePeek';
import { monthlyTotals, spendBy } from '../lib/aggregate';
import { dimValue, encodeDrill, explorerLevel, monthSteps, pushSteps, type DrillDim, type DrillStep } from '../lib/drill';
import { monthLabel } from '../lib/dates';
import { formatMoney, formatPct } from '../lib/format';
import { MonthlyChart } from '../charts/MonthlyChart';
import { HBarChart, type HBarItem } from '../charts/HBarChart';
import type { BarMark, Intro } from '../charts/bars';
import { relativeRect } from '../charts/core';
import { clearDrillOrigin, drillOriginFor, setDrillOrigin } from '../charts/drillMotion';
import { TipBody } from '../charts/useTooltip';
import { LegendItem, Panel } from './Panel';
import { TransactionTable } from './TransactionTable';

const MAX_MERCHANTS = 20;
/** Which drill dimension the items at each level represent. */
const LEVEL_DIM: Record<string, DrillDim> = { months: 'month', categories: 'category', merchants: 'merchant' };

const isPrefix = (a: DrillStep[], b: DrillStep[]) =>
  a.length < b.length && a.every((s, i) => s.dim === b[i].dim && s.value === b[i].value);

/**
 * The main drill-down view: months -> categories -> merchants -> transactions.
 * Each level is a separate chart mounted in the same "stage", and the
 * transition between them is choreographed with an Intro:
 *   drill in:  new bars grow out of the rectangle you clicked;
 *   drill out: the bar you came from starts full-size and shrinks into place.
 */
export function DrillExplorer() {
  const { filtered, currency } = useData();
  const drill = useAppStore((s) => s.drill);
  const drillInto = useAppStore((s) => s.drillInto);
  const peek = usePeek();
  const stageRef = useRef<HTMLDivElement>(null);
  const prevDrill = useRef(drill);
  const level = explorerLevel(drill);

  // Worked out while rendering so the chart gets it on its very first render.
  const intro = useMemo<Intro | null>(() => {
    const from = drillOriginFor(encodeDrill(drill));
    if (from) return { from };
    const prev = prevDrill.current;
    if (isPrefix(drill, prev)) {
      const focus = dimValue(prev, LEVEL_DIM[level]);
      if (focus) return { focus };
    }
    return null;
    // Only recomputed when the level changes; that's when a new chart mounts.
  }, [level]);

  useEffect(() => {
    prevDrill.current = drill;
    clearDrillOrigin();
  }, [drill]);

  /** Drill, remembering where the click happened so the next view can grow out of it. */
  const drillFrom = useCallback(
    (steps: DrillStep[], els: Element[]) => {
      if (stageRef.current && els.length) setDrillOrigin(relativeRect(els, stageRef.current), encodeDrill(pushSteps(drill, steps)));
      drillInto(steps);
    },
    [drill, drillInto],
  );

  const month = dimValue(drill, 'month');
  const category = dimValue(drill, 'category');
  const merchant = dimValue(drill, 'merchant');
  const scope = [category, month && monthLabel(month, 'long')].filter(Boolean).join(' · ');

  const months = useMemo(() => (level === 'months' ? monthlyTotals(filtered) : []), [level, filtered]);
  const bars = useMemo<HBarItem[]>(() => {
    if (level !== 'categories' && level !== 'merchants') return [];
    const key = level === 'categories' ? (t: (typeof filtered)[number]) => t.category : (t: (typeof filtered)[number]) => t.merchant;
    const all = spendBy(filtered, key);
    const total = all.reduce((s, g) => s + g.spend, 0);
    const head = level === 'merchants' ? all.slice(0, MAX_MERCHANTS) : all;
    const rest = all.slice(head.length);
    const items: HBarItem[] = head.map((g) => ({
      key: g.key,
      label: g.key,
      value: g.spend,
      cls: 'fill-spend',
      tooltip: (
        <TipBody
          title={g.key}
          rows={[
            ['Spending', formatMoney(g.spend, currency)],
            ['Share', total > 0 ? formatPct(g.spend / total) : '–'],
            ['Transactions', g.count],
          ]}
          hint="Click to drill in · right-click or long-press for transactions"
        />
      ),
    }));
    if (rest.length) {
      const spend = rest.reduce((s, g) => s + g.spend, 0);
      items.push({
        key: '__other__',
        label: `Other (${rest.length})`,
        value: Math.round(spend * 100) / 100,
        cls: 'fill-muted',
        clickable: false,
        tooltip: <TipBody title={`${rest.length} smaller merchants`} rows={[['Spending', formatMoney(spend, currency)]]} hint="Right-click for transactions" />,
      });
    }
    return items;
  }, [level, filtered, currency]);

  const fmt = useCallback((v: number) => formatMoney(v, currency), [currency]);
  const fmtAxis = useCallback((v: number) => formatMoney(v, currency, { compact: true }), [currency]);

  let title = 'Income vs spending';
  let subtitle = 'Monthly totals with net savings. Click a month to see where the money went.';
  if (level === 'categories') {
    title = `Spending by category`;
    subtitle = `${scope}. Click a category to see its merchants.`;
  } else if (level === 'merchants') {
    title = `Merchants`;
    subtitle = `${scope}. Click a merchant to see its transactions.`;
  } else if (level === 'transactions') {
    title = `Transactions · ${merchant}`;
    subtitle = scope || 'All matching transactions';
  }

  return (
    <Panel
      className="explorer"
      drillable
      title={title}
      subtitle={subtitle}
      legend={
        level === 'months' ? (
          <>
            <LegendItem cls="fill-income">Income</LegendItem>
            <LegendItem cls="fill-spend">Spending</LegendItem>
            <LegendItem cls="stroke-net" shape="line">
              Net savings
            </LegendItem>
          </>
        ) : undefined
      }
    >
      <div ref={stageRef} className="stage">
        {level === 'months' && (
          <MonthlyChart
            key="months"
            months={months}
            currency={currency}
            intro={intro}
            onSelect={(m, el) => {
              // Grow the next view out of this month's two bars, not the whole column.
              const bars = d3
                .select(stageRef.current)
                .selectAll<SVGPathElement, BarMark>('path.bar')
                .filter((d) => d.group === m)
                .nodes();
              drillFrom(monthSteps(m), bars.length ? bars : [el]);
            }}
            onPeek={(m) => peek(monthLabel(m, 'long'), filtered.filter((t) => t.month === m))}
          />
        )}
        {(level === 'categories' || level === 'merchants') && (
          <HBarChart
            key={level}
            items={bars}
            format={fmt}
            formatAxis={fmtAxis}
            intro={intro}
            ariaLabel={title}
            onSelect={(item, el) => drillFrom([{ dim: LEVEL_DIM[level], value: item.key }], [el])}
            onPeek={(item) => {
              const dim = LEVEL_DIM[level] as 'category' | 'merchant';
              const inTop = new Set(bars.map((b) => b.key));
              const rows = item.key === '__other__' ? filtered.filter((t) => t.kind === 'expense' && !inTop.has(t[dim])) : filtered.filter((t) => t[dim] === item.key);
              peek(`${item.label}${scope ? ` · ${scope}` : ''}`, rows);
            }}
          />
        )}
        {level === 'transactions' && <TransactionTable key="transactions" rows={filtered} currency={currency} />}
      </div>
    </Panel>
  );
}
