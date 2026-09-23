import { useEffect, useId, useMemo, useRef, useState } from 'react';

interface Props {
  label: string;
  options: string[];
  /** null = everything (no restriction); [] = nothing selected. */
  selected: string[] | null;
  onChange: (next: string[] | null) => void;
  format?: (v: string) => string;
}

/** Checkbox dropdown with Select all / Select none. */
export function MultiSelect({ label, options, selected, onChange, format = (v) => v }: Props) {
  const ref = useRef<HTMLDetailsElement>(null);
  const [query, setQuery] = useState('');
  const id = useId();

  useEffect(() => {
    const close = (e: PointerEvent) => {
      if (ref.current?.open && !ref.current.contains(e.target as Node)) ref.current.open = false;
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);

  const set = new Set(selected ?? options);
  const shown = useMemo(
    () => options.filter((o) => format(o).toLowerCase().includes(query.trim().toLowerCase())),
    [options, query, format],
  );
  const summary =
    selected === null ? 'All' : selected.length === 0 ? 'None' : selected.length === 1 ? format(selected[0]) : `${selected.length} selected`;

  // Selecting every option is stored as null so newly loaded values are included too.
  const emit = (next: Set<string>) => onChange(options.every((o) => next.has(o)) ? null : options.filter((o) => next.has(o)));

  const toggle = (v: string) => {
    const next = new Set(set);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    emit(next);
  };

  return (
    <details ref={ref} className={`multiselect${selected !== null ? ' active' : ''}`}>
      <summary>
        <span className="ms-label">{label}</span> <span className="ms-value">{summary}</span>
      </summary>
      <div className="menu" role="group" aria-label={label}>
        {options.length > 8 && (
          <input type="search" placeholder="Search…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label={`Search ${label}`} />
        )}
        <div className="ms-actions">
          <button type="button" className="link" onClick={() => onChange(null)} disabled={selected === null}>
            Select all
          </button>
          <button type="button" className="link" onClick={() => onChange([])} disabled={selected?.length === 0}>
            Select none
          </button>
          {query.trim() && (
            <button type="button" className="link" onClick={() => emit(new Set(shown))} disabled={!shown.length}>
              Only matches
            </button>
          )}
        </div>
        <ul>
          {shown.map((o, i) => (
            <li key={o}>
              <label htmlFor={`${id}-${i}`}>
                <input id={`${id}-${i}`} type="checkbox" checked={set.has(o)} onChange={() => toggle(o)} />
                {format(o)}
              </label>
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}
