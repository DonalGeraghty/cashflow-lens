import { describe, expect, it } from 'vitest';
import { parseAmount } from './amount';

describe('parseAmount', () => {
  it.each([
    ['-€1,307.63', -1307.63, 'EUR'],
    ['€400.00', 400, 'EUR'],
    ['€0.00', 0, 'EUR'],
    ['£3.20', 3.2, 'GBP'],
    ['12.50', 12.5, null],
    ['(12.50)', -12.5, null],
    ['12,50 EUR', 12.5, 'EUR'],
    ['1.234,56', 1234.56, null],
    ['1,234', 1234, null],
    ['1,234,567.8', 1234567.8, null],
    ['  - € 5 ', -5, 'EUR'],
    ['€-5', -5, 'EUR'],
    ['5.00-', -5, null],
    ['−7.25', -7.25, null],
    ['+3', 3, null],
    ['$1 000.00', 1000, 'USD'],
  ])('%s -> %d', (input, value, currency) => {
    expect(parseAmount(input)).toEqual({ value, currency });
  });

  it.each(['', '   ', 'abc', '€', '1.2.3', '12,5,0', '--5'])('rejects %j', (input) => {
    expect(parseAmount(input)).toBeNull();
  });

  it('never returns negative zero', () => {
    expect(Object.is(parseAmount('-€0.00')!.value, -0)).toBe(false);
  });
});
