import { useCallback, useState, type ReactNode, type RefObject } from 'react';
import type { Point } from './interactions';

interface TipState {
  x: number;
  y: number;
  flip: boolean;
  content: ReactNode;
}

/**
 * Tooltip rendered by React, positioned from pointer coordinates that D3
 * event handlers pass in. The container must be position: relative.
 */
export function useTooltip(containerRef: RefObject<HTMLElement | null>) {
  const [tip, setTip] = useState<TipState | null>(null);

  const show = useCallback((at: Point, content: ReactNode) => {
    const el = containerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = at.clientX - r.left;
    setTip({ x, y: at.clientY - r.top, flip: x > r.width - 220, content });
  }, [containerRef]);
  const hide = useCallback(() => setTip(null), []);

  const tooltip = tip ? (
    <div
      className={`tooltip${tip.flip ? ' flip' : ''}`}
      style={{ left: tip.x, top: tip.y }}
      role="status"
      aria-live="polite"
    >
      {tip.content}
    </div>
  ) : null;

  return { show, hide, tooltip };
}

/** Standard tooltip body: a title and label/value rows. */
export function TipBody({ title, rows, hint }: { title: string; rows: [ReactNode, ReactNode][]; hint?: string }) {
  return (
    <>
      <div className="tip-title">{title}</div>
      <table>
        <tbody>
          {rows.map(([k, v], i) => (
            <tr key={i}>
              <th>{k}</th>
              <td>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {hint && <div className="tip-hint">{hint}</div>}
    </>
  );
}

export function Swatch({ cls, shape = 'square' }: { cls: string; shape?: 'square' | 'dot' | 'line' }) {
  return <span className={`swatch swatch-${shape} ${cls}`} aria-hidden="true" />;
}
