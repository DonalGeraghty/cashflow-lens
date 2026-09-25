import type { CSSProperties } from 'react';
import type { ScalePower } from 'd3';
import { accValue, fieldLabel, type PivotNode, type PivotResult, type PivotRow } from '../../lib/pivot';

export interface BudgetCell {
  limit: number;
  spent: number;
  state: 'ok' | 'over';
}

const BUDGET_STATE = { ok: '✓', over: '✕' } as const;

interface Props {
  result: PivotResult;
  rows: PivotRow[];
  headerRows: { label: string; span: number }[][];
  format: (v: number | null) => string;
  /** Maps |value| to a 0–1 shading intensity, or null for no shading. */
  heat: ScalePower<number, number> | null;
  onToggle: (id: string) => void;
  onSort: (by: string) => void;
  onCell: (rowPath: string[], colPath: string[] | null) => void;
  /** When set, adds Budget and Used columns; returns null for rows without a budget. */
  budgetFor?: (node: PivotNode) => BudgetCell | null;
}

export function PivotTable({ result, rows, headerRows, format, heat, onToggle, onSort, onCell, budgetFor }: Props) {
  const { config, colKeys, colIds, root } = result;
  const hasCols = config.cols.length > 0;
  const sortMark = (by: string) => (config.sort.by === by ? (config.sort.dir === 'asc' ? ' ▲' : ' ▼') : '');
  const ariaSort = (by: string) => (config.sort.by === by ? (config.sort.dir === 'asc' ? 'ascending' : 'descending') : 'none');
  const rowHeader = config.rows.map(fieldLabel).join(' › ') || '';

  const valueCell = (node: PivotNode, colIdx: number | null, isTotal: boolean) => {
    const acc = colIdx === null ? node.total : node.cells.get(colIds[colIdx]);
    const v = accValue(acc, config.agg);
    const shade = heat && v !== null && !isTotal ? heat(Math.abs(v)) : 0;
    // The tint strength is a CSS variable so light/dark themes pick the colour.
    const style = shade ? ({ '--heat': `${Math.round(shade * 62)}%` } as CSSProperties) : undefined;
    return (
      <td
        key={colIdx ?? 'total'}
        className={`num${isTotal ? ' total' : ''}${shade ? (v! < 0 ? ' heat-neg' : ' heat') : ''}${v === null ? ' empty-cell' : ''}`}
        style={style}
      >
        {v === null ? (
          ''
        ) : (
          <button type="button" className="cell-btn" onClick={() => onCell(node.path, colIdx === null ? null : colKeys[colIdx])} title="Show transactions">
            {format(v)}
          </button>
        )}
      </td>
    );
  };

  const budgetCells = (node: PivotNode) => {
    if (!budgetFor) return null;
    const b = budgetFor(node);
    return (
      <>
        <td className="num budget-col">{b ? format(b.limit) : ''}</td>
        <td className={`num budget-col${b ? ` budget-cell state-${b.state}` : ''}`}>
          {b ? (
            <span title={b.state === 'over' ? `Over by ${format(b.spent - b.limit)}` : `${format(b.limit - b.spent)} left`}>
              <span aria-hidden="true">{BUDGET_STATE[b.state]} </span>
              {b.limit > 0 ? `${Math.round((b.spent / b.limit) * 100)}%` : '–'}
            </span>
          ) : (
            ''
          )}
        </td>
      </>
    );
  };

  if (!root.total.count) return <p className="empty">No values for this layout with the current filters.</p>;

  return (
    <div className="table-scroll pivot-scroll">
      <table className="pivot">
        <thead>
          {hasCols &&
            headerRows.slice(0, -1).map((hr, i) => (
              <tr key={i}>
                <th className="corner" />
                {hr.map((h, j) => (
                  <th key={j} colSpan={h.span} className="col-group">
                    {h.label}
                  </th>
                ))}
                <th className="total" />
                {budgetFor && <th colSpan={2} className="budget-col" />}
              </tr>
            ))}
          <tr>
            <th className="row-head" aria-sort={ariaSort('label')}>
              <button type="button" onClick={() => onSort('label')}>
                {rowHeader || 'Total'}
                {sortMark('label')}
              </button>
            </th>
            {hasCols &&
              headerRows[headerRows.length - 1].map((h, i) => (
                <th key={colIds[i]} className="num" aria-sort={ariaSort(colIds[i])}>
                  <button type="button" onClick={() => onSort(colIds[i])}>
                    {h.label}
                    {sortMark(colIds[i])}
                  </button>
                </th>
              ))}
            <th className="num total" aria-sort={ariaSort('total')}>
              <button type="button" onClick={() => onSort('total')}>
                Total{sortMark('total')}
              </button>
            </th>
            {budgetFor && (
              <>
                <th className="num budget-col">Budget</th>
                <th className="num budget-col">Used</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ node, isGroup, expanded }) => (
            <tr key={node.id} className={isGroup ? `group depth-${node.depth}` : `depth-${node.depth}`}>
              <th scope="row" className="row-label" style={{ paddingLeft: `${0.6 + (node.depth - 1) * 1.2}rem` }}>
                {isGroup ? (
                  <button type="button" className="toggle-btn" onClick={() => onToggle(node.id)} aria-expanded={expanded}>
                    <span aria-hidden="true">{expanded ? '▾' : '▸'}</span> {node.label}
                  </button>
                ) : (
                  <span className="leaf">{node.label}</span>
                )}
              </th>
              {hasCols && colIds.map((_, i) => valueCell(node, i, isGroup))}
              {valueCell(node, null, true)}
              {budgetCells(node)}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">Grand total</th>
            {hasCols && colIds.map((_, i) => valueCell(root, i, true))}
            {valueCell(root, null, true)}
            {budgetFor && <td colSpan={2} className="budget-col" />}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
