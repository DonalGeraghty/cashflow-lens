import type { Selection } from 'd3';

export interface Point {
  clientX: number;
  clientY: number;
}

export interface MarkHandlers<T> {
  /** Primary action (drill). */
  onClick?: (d: T, el: Element) => void;
  /** Right-click / long-press / Shift+F10: show raw transactions without drilling. */
  onPeek?: (d: T, el: Element) => void;
  onHover?: (d: T, at: Point) => void;
  onLeave?: () => void;
  ariaLabel?: (d: T) => string;
}

const LONG_PRESS_MS = 500;
const MOVE_TOLERANCE = 10;

/**
 * Wire click, right-click, touch long-press, hover and keyboard onto marks.
 *
 * Touch devices have no right-click, so a 500 ms press that doesn't move acts
 * as "peek". Some mobile browsers also fire `contextmenu` on long-press; the
 * `lastPeek` guard stops that opening the dialog twice, and `suppressClick`
 * swallows the click that can follow a long-press.
 */
export function bindMarkEvents<E extends Element, T>(sel: Selection<E, T, any, any>, h: MarkHandlers<T>) {
  let timer: number | undefined;
  let start: { x: number; y: number } | null = null;
  let lastPeek = 0;
  let suppressClick = false;

  const cancel = () => {
    window.clearTimeout(timer);
    start = null;
  };
  const peek = (d: T, el: Element) => {
    lastPeek = Date.now();
    h.onLeave?.();
    h.onPeek?.(d, el);
  };
  const interactive = Boolean(h.onClick || h.onPeek);

  sel
    .attr('tabindex', interactive ? 0 : null)
    .attr('role', interactive ? 'button' : null)
    .attr('aria-label', h.ariaLabel ? (d: T) => h.ariaLabel!(d) : null)
    .classed('interactive', Boolean(h.onClick))
    .on('click', function (_event: Event, d: T) {
      if (suppressClick) {
        suppressClick = false;
        return;
      }
      h.onClick?.(d, this);
    })
    .on('contextmenu', function (event: Event, d: T) {
      if (!h.onPeek) return;
      event.preventDefault();
      if (Date.now() - lastPeek < 800) return;
      peek(d, this);
    })
    .on('pointerdown', function (e: Event, d: T) {
      const event = e as PointerEvent;
      suppressClick = false;
      if (event.pointerType === 'mouse' || !h.onPeek) return;
      start = { x: event.clientX, y: event.clientY };
      const el = this;
      timer = window.setTimeout(() => {
        suppressClick = true;
        peek(d, el);
      }, LONG_PRESS_MS);
    })
    .on('pointermove', function (e: Event, d: T) {
      const event = e as PointerEvent;
      if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > MOVE_TOLERANCE) cancel();
      h.onHover?.(d, event);
    })
    .on('pointerup pointercancel', cancel)
    .on('pointerleave', () => {
      cancel();
      h.onLeave?.();
    })
    .on('focus', function (_event: Event, d: T) {
      const r = this.getBoundingClientRect();
      h.onHover?.(d, { clientX: r.left + r.width / 2, clientY: r.top });
    })
    .on('blur', () => h.onLeave?.())
    .on('keydown', function (e: Event, d: T) {
      const event = e as KeyboardEvent;
      if ((event.key === 'Enter' || event.key === ' ') && h.onClick) {
        event.preventDefault();
        h.onClick(d, this);
      } else if ((event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) && h.onPeek) {
        event.preventDefault();
        peek(d, this);
      }
    });
}
