import { describe, expect, it } from 'vitest';
import { addMonths, monthFromName, monthLabel, monthRange, parseDateCell, parseMonthCell, weekdayOf } from './dates';

describe('parseMonthCell', () => {
  it.each([
    ['May 2025', { year: 2025, month: 5 }],
    ['September 2026', { year: 2026, month: 9 }],
    ['Sep-25', { year: 2025, month: 9 }],
    ['2025-05', { year: 2025, month: 5 }],
    ['05/2025', { year: 2025, month: 5 }],
    ['14/08/2026', { year: 2026, month: 8 }],
  ])('%s', (input, expected) => {
    expect(parseMonthCell(input)).toEqual(expected);
  });

  it.each(['', 'Smarch 2025', '13/2025', 'May'])('rejects %j', (input) => {
    expect(parseMonthCell(input)).toBeNull();
  });
});

describe('parseDateCell', () => {
  it('reads weekday + day + month with a fallback year (the Bookmark Date column)', () => {
    expect(parseDateCell('Thursday, 9 July ', 2026)).toEqual({ year: 2026, month: 7, day: 9 });
  });
  it('needs a year from somewhere for text dates', () => {
    expect(parseDateCell('Thursday, 9 July ')).toBeNull();
  });
  it('reads DD/MM/YYYY, not MM/DD', () => {
    expect(parseDateCell('03/04/2026')).toEqual({ year: 2026, month: 4, day: 3 });
  });
  it('reads ISO dates and ignores a time part', () => {
    expect(parseDateCell('2026-02-28 13:45:00')).toEqual({ year: 2026, month: 2, day: 28 });
  });
  it('reads "July 9, 2026" and ordinal suffixes', () => {
    expect(parseDateCell('July 9, 2026')).toEqual({ year: 2026, month: 7, day: 9 });
    expect(parseDateCell('1st March 2026')).toEqual({ year: 2026, month: 3, day: 1 });
  });
  it('rejects impossible days', () => {
    expect(parseDateCell('31/02/2026')).toBeNull();
    expect(parseDateCell('29/02/2025')).toBeNull();
    expect(parseDateCell('29/02/2024')).toEqual({ year: 2024, month: 2, day: 29 });
  });
});

describe('month helpers', () => {
  it('addMonths crosses year boundaries both ways', () => {
    expect(addMonths('2025-12', 1)).toBe('2026-01');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(addMonths('2026-03', -15)).toBe('2024-12');
  });
  it('monthRange is inclusive', () => {
    expect(monthRange('2025-11', '2026-02')).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
  });
  it('labels', () => {
    expect(monthLabel('2026-08')).toBe('Aug 2026');
    expect(monthLabel('2026-08', 'long')).toBe('August 2026');
    expect(monthLabel('2026-08', 'name')).toBe('August');
  });
  it('monthFromName accepts abbreviations but not nonsense', () => {
    expect(monthFromName('Sept')).toBe(9);
    expect(monthFromName('sep')).toBe(9);
    expect(monthFromName('Septembre')).toBe(-1);
    expect(monthFromName('Ju')).toBe(-1);
  });
  it('weekdayOf', () => {
    expect(weekdayOf(2026, 7, 9)).toBe('Thu');
    expect(weekdayOf(2026, 9, 20)).toBe('Sun');
  });
});
