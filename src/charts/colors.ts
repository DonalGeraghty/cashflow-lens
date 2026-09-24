/**
 * Fill classes (styles.css `.fill-*`) and the CSS custom property each one
 * paints with. Used when a colour has to be set as a value (e.g. a Sankey
 * link's stroke) rather than via the class. Keep in sync with styles.css;
 * colors.test.ts checks every variable here is actually defined.
 */
export const FILL_VARS = {
  'fill-income': '--income',
  'fill-spend': '--spend',
  'fill-saved': '--saved',
  'fill-fixed': '--b-fixed',
  'fill-variable': '--b-variable',
  'fill-disc': '--b-disc',
  'fill-other-bucket': '--b-other',
  'fill-none': '--b-none',
  'fill-x1': '--b-x1',
  'fill-x2': '--b-x2',
  'fill-muted': '--other',
  'fill-up': '--up',
  'fill-down': '--down',
  'fill-total': '--total',
} as const;

export type FillClass = keyof typeof FILL_VARS;

/** `var(--…)` for a fill class; falls back to the neutral total colour for unknown classes. */
export function fillVar(cls: string): string {
  return `var(${FILL_VARS[cls as FillClass] ?? '--total'})`;
}
