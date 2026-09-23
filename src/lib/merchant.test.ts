import { describe, expect, it } from 'vitest';
import { isEstimateDescription, normaliseMerchant } from './merchant';

describe('normaliseMerchant', () => {
  it.each([
    ['tesco', 'Tesco'],
    ['  TESCO ', 'Tesco'],
    ['London - food (50%)', 'London'],
    ['taxi - funeral', 'Taxi'],
    ['Irish Life (house life insurance)', 'Irish Life'],
    ['? booking com hotel delhi (est)', 'Booking Com Hotel Delhi'],
    ['Mom dad gift, conall', 'Mom Dad Gift'],
    ['mortgage + 10% overpayment', 'Mortgage'],
    ['M&S', 'M&S'],
    ['disney+', 'Disney+'],
    ['', '(no description)'],
  ])('%j -> %j', (input, expected) => {
    expect(normaliseMerchant(input)).toBe(expected);
  });
});

describe('isEstimateDescription', () => {
  it.each([
    ['? booking com hotel lucknow (est)', true],
    ['?flight', true],
    ['hotel (EST)', true],
    ['hotel (estimated)', true],
    ['tesco', false],
    ['what? no', false],
    ['estate agent', false],
  ])('%j -> %s', (input, expected) => {
    expect(isEstimateDescription(input)).toBe(expected);
  });
});
