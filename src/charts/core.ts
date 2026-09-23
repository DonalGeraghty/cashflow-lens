import * as d3 from 'd3';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Corner radii: top-left, top-right, bottom-right, bottom-left. */
export type Radii = [number, number, number, number];
export const NO_RADII: Radii = [0, 0, 0, 0];

/** Max bar thickness; the rest of the band is left as air. */
export const BAR_MAX = 22;
/** Rounded data-end radius (the baseline end stays square). */
export const BAR_RADIUS = 4;

export function endRadii(end: 'top' | 'bottom' | 'left' | 'right', r = BAR_RADIUS): Radii {
  switch (end) {
    case 'top':
      return [r, r, 0, 0];
    case 'bottom':
      return [0, 0, r, r];
    case 'right':
      return [0, r, r, 0];
    case 'left':
      return [r, 0, 0, r];
  }
}

const f = (n: number) => Math.round(n * 100) / 100;

/**
 * A rectangle with individually rounded corners, as a path.
 *
 * Every bar in the app is drawn with this exact command sequence (M H Q V Q H
 * Q V Q Z, always 4 corners even when a radius is 0). Because the structure
 * never changes, d3's string interpolator can tween any bar into any other:
 * a vertical month column can morph into a horizontal category bar during
 * a drill transition, and radii animate smoothly too.
 */
export function roundedRect({ x, y, w, h }: Rect, radii: Radii = NO_RADII): string {
  w = Math.max(0, w);
  h = Math.max(0, h);
  const lim = Math.min(w / 2, h / 2);
  const [tl, tr, br, bl] = radii.map((r) => Math.max(0, Math.min(r, lim)));
  return (
    `M${f(x + tl)},${f(y)}H${f(x + w - tr)}Q${f(x + w)},${f(y)} ${f(x + w)},${f(y + tr)}` +
    `V${f(y + h - br)}Q${f(x + w)},${f(y + h)} ${f(x + w - br)},${f(y + h)}` +
    `H${f(x + bl)}Q${f(x)},${f(y + h)} ${f(x)},${f(y + h - bl)}` +
    `V${f(y + tl)}Q${f(x)},${f(y)} ${f(x + tl)},${f(y)}Z`
  );
}

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** A named transition that respects prefers-reduced-motion. */
export function motion(name = 'main', ms = 650) {
  return d3.transition(name).duration(prefersReducedMotion() ? 0 : ms).ease(d3.easeCubicInOut);
}

const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
/** Pixel width of a label in the chart font, for sizing margins. */
export function textWidth(s: string, font = '12px system-ui, -apple-system, "Segoe UI", sans-serif'): number {
  const ctx = canvas?.getContext('2d');
  if (!ctx) return s.length * 7;
  ctx.font = font;
  return ctx.measureText(s).width;
}

export function truncate(s: string, maxPx: number): string {
  if (textWidth(s) <= maxPx) return s;
  let lo = 0;
  let hi = s.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (textWidth(`${s.slice(0, mid)}…`) <= maxPx) lo = mid;
    else hi = mid - 1;
  }
  return `${s.slice(0, lo)}…`;
}

/** Union of DOM rects converted into coordinates relative to `container`. */
export function relativeRect(els: Element[], container: Element): Rect {
  const c = container.getBoundingClientRect();
  const rs = els.map((e) => e.getBoundingClientRect());
  const x0 = Math.min(...rs.map((r) => r.left));
  const y0 = Math.min(...rs.map((r) => r.top));
  const x1 = Math.max(...rs.map((r) => r.right));
  const y1 = Math.max(...rs.map((r) => r.bottom));
  return { x: x0 - c.left, y: y0 - c.top, w: x1 - x0, h: y1 - y0 };
}
