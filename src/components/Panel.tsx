import type { ReactNode } from 'react';
import { useAppStore } from '../store/useAppStore';
import { stepLabel } from '../lib/drill';

interface Props {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Controls shown on the right of the header (toggles, selects). */
  controls?: ReactNode;
  legend?: ReactNode;
  /** The chart supports drill-down: show a "Back" button while drilled in. */
  drillable?: boolean;
  className?: string;
  children: ReactNode;
}

export function Panel({ title, subtitle, controls, legend, drillable = false, className = '', children }: Props) {
  return (
    <section className={`panel ${className}`}>
      <header className="panel-head">
        <div>
          <h2>{title}</h2>
          {subtitle && <p className="sub">{subtitle}</p>}
        </div>
        {(controls || drillable) && (
          <div className="panel-controls">
            {drillable && <DrillBackButton />}
            {controls}
          </div>
        )}
      </header>
      {legend && <div className="legend">{legend}</div>}
      {children}
    </section>
  );
}

/** Steps back one drill level. Renders nothing at the top level. */
export function DrillBackButton() {
  const drill = useAppStore((s) => s.drill);
  const drillBack = useAppStore((s) => s.drillBack);
  if (!drill.length) return null;
  const parent = drill.slice(0, -1);
  const target = parent.length ? stepLabel(parent[parent.length - 1], parent) : 'All';
  return (
    <button type="button" className="drill-back" onClick={drillBack} title="Go back one drill level">
      <span aria-hidden="true">←</span> Back to {target}
    </button>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          className={value === o.value ? 'on' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function LegendItem({ cls, shape = 'square', children }: { cls: string; shape?: 'square' | 'dot' | 'line'; children: ReactNode }) {
  return (
    <span className="legend-item">
      <span className={`swatch swatch-${shape} ${cls}`} aria-hidden="true" />
      {children}
    </span>
  );
}
