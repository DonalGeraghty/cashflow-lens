import type { Rect } from './core';

/**
 * A handoff between the chart you click and the view that mounts next.
 *
 * Right before the drill path changes, the clicked bar's rectangle (relative
 * to the explorer stage) is stored here together with the path it leads to.
 * The next view reads it while rendering that exact path and grows its bars
 * out of that rectangle; it's cleared after commit. Keying by path (instead
 * of "take once") keeps it correct under React StrictMode double renders.
 *
 * This is transient animation state, so it deliberately lives outside the
 * store and the URL.
 */
let pending: { rect: Rect; path: string } | null = null;

export function setDrillOrigin(rect: Rect, path: string) {
  pending = { rect, path };
}

export function drillOriginFor(path: string): Rect | null {
  return pending && pending.path === path ? pending.rect : null;
}

export function clearDrillOrigin() {
  pending = null;
}
