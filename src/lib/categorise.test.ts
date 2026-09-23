import { describe, expect, it } from 'vitest';
import type { RawTransaction } from '../types';
import { type CategoryRule, UNCATEGORISED, compileRule, enrich, matchRules, ruleError } from './categorise';
import { defaultRules } from './defaultRules';

const raw = (p: Partial<RawTransaction>): RawTransaction => ({
  id: 'x',
  line: 1,
  account: 'BOI',
  month: '2026-08',
  day: null,
  description: 'something',
  merchant: 'Something',
  csvCategory: '',
  bucket: '',
  amount: -10,
  currency: 'EUR',
  estimate: false,
  ...p,
});

const rule = (pattern: string, category: string, match: CategoryRule['match'] = 'contains', enabled = true): CategoryRule => ({
  id: pattern,
  pattern,
  category,
  match,
  enabled,
});

const today = new Date(2026, 8, 23); // 23 Sep 2026, local time

describe('compileRule', () => {
  it('is case-insensitive for every match type', () => {
    expect(compileRule(rule('TESCO', 'x'))!('big tesco shop')).toBe(true);
    expect(compileRule(rule('tes', 'x', 'startsWith'))!('Tesco')).toBe(true);
    expect(compileRule(rule('tesco', 'x', 'exact'))!(' Tesco ')).toBe(true);
    expect(compileRule(rule('tesco', 'x', 'exact'))!('tesco express')).toBe(false);
    expect(compileRule(rule('^(spar|centra)$', 'x', 'regex'))!('SPAR')).toBe(true);
  });
  it('returns null for invalid regex or empty pattern', () => {
    expect(compileRule(rule('(', 'x', 'regex'))).toBeNull();
    expect(compileRule(rule('  ', 'x'))).toBeNull();
    expect(ruleError(rule('(', 'x', 'regex'))).toMatch(/Invalid/);
    expect(ruleError(rule('ok', ''))).toMatch(/Category/);
    expect(ruleError(rule('ok', 'x'))).toBeNull();
  });
});

describe('matchRules', () => {
  it('first enabled match wins', () => {
    const rules = [rule('amazon', 'Off', 'contains', false), rule('amazon prime', 'Subscriptions'), rule('amazon', 'Technology')];
    expect(matchRules('Amazon Prime', rules)!.category).toBe('Subscriptions');
    expect(matchRules('amazon', rules)!.category).toBe('Technology');
    expect(matchRules('tesco', rules)).toBeNull();
  });
});

describe('enrich', () => {
  const rules = [rule('tesco', 'Supermarket'), rule('paycheck', 'Income')];

  it('keeps CSV categories and only fills blanks by default', () => {
    const [a, b, c] = enrich(
      [raw({ description: 'tesco', csvCategory: 'Groceries' }), raw({ description: 'tesco' }), raw({ description: 'mystery' })],
      rules,
      { override: false, today },
    );
    expect([a.category, a.categorySource]).toEqual(['Groceries', 'csv']);
    expect([b.category, b.categorySource]).toEqual(['Supermarket', 'rule']);
    expect([c.category, c.categorySource]).toEqual([UNCATEGORISED, 'none']);
  });

  it('override applies rules over CSV categories', () => {
    const [a] = enrich([raw({ description: 'tesco', csvCategory: 'Groceries' })], rules, { override: true, today });
    expect(a.category).toBe('Supermarket');
  });

  it('classifies income by category/bucket; positive spending rows are refunds', () => {
    const [salary, bucketIncome, refund, unknownIn, unknownOut] = enrich(
      [
        raw({ description: 'paycheck', amount: 3000 }),
        raw({ description: 'dad', csvCategory: 'Gift', bucket: 'Income', amount: 400 }),
        raw({ description: 'pharmacy', csvCategory: 'Healthcare', amount: 9.97 }),
        raw({ description: '???', amount: 50 }),
        raw({ description: '???', amount: -50 }),
      ],
      rules,
      { override: false, today },
    );
    expect(salary.kind).toBe('income');
    expect(bucketIncome.kind).toBe('income');
    expect(refund.kind).toBe('expense');
    expect(unknownIn.kind).toBe('income');
    expect(unknownOut.kind).toBe('expense');
  });

  it('marks future-dated and estimated rows', () => {
    const out = enrich(
      [
        raw({ month: '2026-10' }),
        raw({ month: '2026-09', day: 24 }),
        raw({ month: '2026-09', day: 23 }),
        raw({ month: '2026-09' }),
        raw({ month: '2026-08', estimate: true }),
      ],
      [],
      { override: false, today },
    );
    expect(out.map((t) => t.future)).toEqual([true, true, false, false, true]);
    expect(out[0].year).toBe(2026);
  });

  it('default rules categorise common merchants', () => {
    const d = defaultRules();
    expect(matchRules('Tesco Express', d)!.category).toBe('Supermarket');
    expect(matchRules('netflix', d)!.category).toBe('Subscriptions');
    expect(matchRules('Free Now', d)!.category).toBe('Taxi');
    expect(d.every((r) => ruleError(r) === null)).toBe(true);
  });
});
