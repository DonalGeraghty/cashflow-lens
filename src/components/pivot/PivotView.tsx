import { useMemo, useState } from 'react';
import Papa from 'papaparse';
import * as d3 from 'd3';
import { useAppStore } from '../../store/useAppStore';
import { useData } from '../../store/DataContext';
import { usePeek } from '../../hooks/usePeek';
import {
  AGG_FNS,
  PIVOT_FIELDS,
  VALUE_FIELDS,
  type AggFn,
  type PivotField,
  type ValueField,
  accValue,
  cellTransactions,
  colHeaderRows,
  computePivot,
  fieldLabel,
  flattenPivot,
  groupIds,
  pivotFieldValues,
  pivotToRows,
  valueLabel,
} from '../../lib/pivot';
import { formatMoney, formatNumber } from '../../lib/format';
import { MultiSelect } from '../MultiSelect';
import { Panel } from '../Panel';
import { PivotTable } from './PivotTable';

export function PivotView() {
  const config = useAppStore((s) => s.pivot);
  const setPivot = useAppStore((s) => s.setPivot);
  const saved = useAppStore((s) => s.savedPivots);
  const savePivot = useAppStore((s) => s.savePivot);
  const loadPivot = useAppStore((s) => s.loadPivot);
  const deletePivot = useAppStore((s) => s.deletePivot);
  const { filtered, currency } = useData();
  const peek = usePeek();
  const [layoutName, setLayoutName] = useState('');
  const [selectedLayout, setSelectedLayout] = useState('');

  const result = useMemo(() => computePivot(filtered, config), [filtered, config]);
  const rows = useMemo(() => flattenPivot(result, config.collapsed), [result, config.collapsed]);

  const fmt = (v: number | null) =>
    v === null ? '' : config.agg === 'count' ? formatNumber(v, 0) : formatMoney(v, currency);

  // Heat shading: D3 maps each leaf cell's magnitude to a 0–1 intensity; CSS turns that into a tint.
  const heat = useMemo(() => {
    if (!config.heatmap || !config.cols.length) return null;
    const vals: number[] = [];
    for (const r of rows) if (!r.isGroup) for (const id of result.colIds) {
      const v = accValue(r.node.cells.get(id), config.agg);
      if (v !== null) vals.push(Math.abs(v));
    }
    const max = d3.max(vals) ?? 0;
    return max > 0 ? d3.scaleSqrt([0, max], [0, 1]).clamp(true) : null;
  }, [rows, result, config.heatmap, config.cols.length, config.agg]);

  const used = new Set<PivotField>([...config.rows, ...config.cols]);
  const addable = PIVOT_FIELDS.filter((f) => !used.has(f.id));
  const filterFields = Object.keys(config.filters) as PivotField[];

  const moveField = (axis: 'rows' | 'cols', i: number, delta: number) => {
    const list = [...config[axis]];
    const j = i + delta;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    setPivot({ [axis]: list, collapsed: [] });
  };
  const removeField = (axis: 'rows' | 'cols', f: PivotField) => setPivot({ [axis]: config[axis].filter((x) => x !== f), collapsed: [] });
  const swapAxes = () => setPivot({ rows: config.cols, cols: config.rows, collapsed: [], sort: { by: 'label', dir: 'asc' } });

  const exportCsv = () => {
    const csv = Papa.unparse(pivotToRows(result, config.collapsed));
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `pivot-${[...config.rows, ...config.cols].join('-') || 'total'}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const describe = (rowPath: string[], colPath: string[] | null) => {
    const parts = rowPath.map((v, i) => valueLabel(config.rows[i], v));
    if (colPath) parts.push(...colPath.map((v, i) => valueLabel(config.cols[i], v)));
    return parts.length ? parts.join(' › ') : 'All';
  };

  return (
    <Panel title="Pivot table" subtitle="Rows, columns and values of your choosing. Uses the global filters and drill path.">
      <div className="pivot-config">
        <FieldList
          title="Rows"
          fields={config.rows}
          addable={addable}
          onAdd={(f) => setPivot({ rows: [...config.rows, f], collapsed: [] })}
          onMove={(i, d) => moveField('rows', i, d)}
          onRemove={(f) => removeField('rows', f)}
        />
        <FieldList
          title="Columns"
          fields={config.cols}
          addable={addable}
          onAdd={(f) => setPivot({ cols: [...config.cols, f], collapsed: [] })}
          onMove={(i, d) => moveField('cols', i, d)}
          onRemove={(f) => removeField('cols', f)}
        />
        <div className="config-group">
          <h3>Values</h3>
          <div className="config-row">
            <select aria-label="Value field" value={config.value} onChange={(e) => setPivot({ value: e.target.value as ValueField })}>
              {VALUE_FIELDS.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>
            <select aria-label="Aggregation" value={config.agg} onChange={(e) => setPivot({ agg: e.target.value as AggFn })}>
              {AGG_FNS.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </div>
          <label className="toggle">
            <input type="checkbox" checked={config.heatmap} onChange={(e) => setPivot({ heatmap: e.target.checked })} />
            Colour shading
          </label>
        </div>
        <div className="config-group">
          <h3>Filters</h3>
          <div className="config-row wrap">
            {filterFields.map((f) => (
              <span key={f} className="filter-chip">
                <MultiSelect
                  label={fieldLabel(f)}
                  options={pivotFieldValues(filtered, f)}
                  selected={config.filters[f] ?? null}
                  format={(v) => valueLabel(f, v)}
                  onChange={(vals) => setPivot({ filters: { ...config.filters, [f]: vals } })}
                />
                <button
                  type="button"
                  className="icon"
                  aria-label={`Remove ${fieldLabel(f)} filter`}
                  onClick={() => {
                    const { [f]: _removed, ...rest } = config.filters;
                    setPivot({ filters: rest });
                  }}
                >
                  ✕
                </button>
              </span>
            ))}
            <select
              aria-label="Add filter"
              value=""
              onChange={(e) => e.target.value && setPivot({ filters: { ...config.filters, [e.target.value]: null } })}
            >
              <option value="">+ Filter…</option>
              {PIVOT_FIELDS.filter((f) => !filterFields.includes(f.id)).map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="pivot-toolbar">
        <button type="button" onClick={swapAxes} disabled={!config.rows.length && !config.cols.length}>
          ⇄ Swap rows/columns
        </button>
        <button type="button" onClick={() => setPivot({ collapsed: [] })} disabled={!config.collapsed.length}>
          Expand all
        </button>
        <button type="button" onClick={() => setPivot({ collapsed: groupIds(result) })} disabled={config.rows.length < 2}>
          Collapse all
        </button>
        <button type="button" onClick={exportCsv}>
          Export CSV
        </button>
        <span className="spacer" />
        <form
          className="layouts"
          onSubmit={(e) => {
            e.preventDefault();
            if (layoutName.trim()) {
              savePivot(layoutName.trim());
              setLayoutName('');
            }
          }}
        >
          <input value={layoutName} onChange={(e) => setLayoutName(e.target.value)} placeholder="Layout name" aria-label="Layout name" />
          <button type="submit" disabled={!layoutName.trim()}>
            Save layout
          </button>
          {saved.length > 0 && (
            <>
              <select
                aria-label="Saved layouts"
                value={selectedLayout}
                onChange={(e) => {
                  setSelectedLayout(e.target.value);
                  if (e.target.value) loadPivot(e.target.value);
                }}
              >
                <option value="">Load layout…</option>
                {saved.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={!selectedLayout}
                onClick={() => {
                  deletePivot(selectedLayout);
                  setSelectedLayout('');
                }}
              >
                Delete
              </button>
            </>
          )}
        </form>
      </div>

      <PivotTable
        result={result}
        rows={rows}
        headerRows={colHeaderRows(result)}
        format={fmt}
        heat={heat}
        onToggle={(id) =>
          setPivot({ collapsed: config.collapsed.includes(id) ? config.collapsed.filter((c) => c !== id) : [...config.collapsed, id] })
        }
        onSort={(by) => setPivot({ sort: { by, dir: config.sort.by === by && config.sort.dir === 'desc' ? 'asc' : 'desc' } })}
        onCell={(rowPath, colPath) => peek(describe(rowPath, colPath), cellTransactions(filtered, config, rowPath, colPath))}
      />
    </Panel>
  );
}

function FieldList({
  title,
  fields,
  addable,
  onAdd,
  onMove,
  onRemove,
}: {
  title: string;
  fields: PivotField[];
  addable: { id: PivotField; label: string }[];
  onAdd: (f: PivotField) => void;
  onMove: (i: number, delta: number) => void;
  onRemove: (f: PivotField) => void;
}) {
  return (
    <div className="config-group">
      <h3>{title}</h3>
      <ol className="field-list">
        {fields.map((f, i) => (
          <li key={f}>
            <span>{fieldLabel(f)}</span>
            <button type="button" className="icon" onClick={() => onMove(i, -1)} disabled={i === 0} aria-label={`Move ${fieldLabel(f)} up`}>
              ↑
            </button>
            <button type="button" className="icon" onClick={() => onMove(i, 1)} disabled={i === fields.length - 1} aria-label={`Move ${fieldLabel(f)} down`}>
              ↓
            </button>
            <button type="button" className="icon" onClick={() => onRemove(f)} aria-label={`Remove ${fieldLabel(f)}`}>
              ✕
            </button>
          </li>
        ))}
      </ol>
      <select aria-label={`Add ${title.toLowerCase()} field`} value="" onChange={(e) => e.target.value && onAdd(e.target.value as PivotField)}>
        <option value="">+ Add field…</option>
        {addable.map((f) => (
          <option key={f.id} value={f.id}>
            {f.label}
          </option>
        ))}
      </select>
    </div>
  );
}
