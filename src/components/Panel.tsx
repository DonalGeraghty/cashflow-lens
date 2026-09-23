import type { ReactNode } from 'react';

interface Props {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Controls shown on the right of the header (toggles, selects). */
  controls?: ReactNode;
  legend?: ReactNode;
  className?: string;
  children: ReactNode;
}

export function Panel({ title, subtitle, controls, legend, className = '', children }: Props) {
  return (
    <section className={`panel ${className}`}>
      <header className="panel-head">
        <div>
          <h2>{title}</h2>
          {subtitle && <p className="sub">{subtitle}</p>}
        </div>
        {controls && <div className="panel-controls">{controls}</div>}
      </header>
      {legend && <div className="legend">{legend}</div>}
      {children}
    </section>
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
