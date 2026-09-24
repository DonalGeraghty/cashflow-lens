import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FILL_VARS, fillVar } from './colors';
import { bucketClass } from './BucketChart';

const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
const defined = (name: string) => new RegExp(`${name}\\s*:`).test(css);

describe('chart colours', () => {
  it('every fill class maps to a CSS variable that styles.css defines', () => {
    for (const [cls, v] of Object.entries(FILL_VARS)) {
      expect(defined(v), `${cls} -> ${v}`).toBe(true);
      expect(css.includes(`.${cls} {`), `.${cls} rule`).toBe(true);
    }
  });

  it('fillVar resolves semantic classes (the Sankey "Spent" bug)', () => {
    expect(fillVar('fill-spend')).toBe('var(--spend)');
    expect(fillVar('fill-income')).toBe('var(--income)');
    expect(fillVar('fill-saved')).toBe('var(--saved)');
    expect(fillVar('fill-total')).toBe('var(--total)');
    expect(fillVar('fill-nonsense')).toBe('var(--total)');
  });

  it('every bucket colour class is known', () => {
    const buckets = ['Fixed Essential', 'Variable Essential', 'Discretionary', 'Other', '(none)', 'Savings', 'Zed'];
    for (const b of buckets) expect(Object.keys(FILL_VARS)).toContain(bucketClass(b, buckets));
  });
});
