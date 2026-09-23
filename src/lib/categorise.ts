import type { CategorySource, Kind, RawTransaction, Transaction } from '../types';
import { monthKey } from './dates';

export type MatchType = 'contains' | 'startsWith' | 'exact' | 'regex';

export interface CategoryRule {
  id: string;
  /** Text (or regex source) matched case-insensitively against the description. */
  pattern: string;
  match: MatchType;
  category: string;
  enabled: boolean;
}

export const UNCATEGORISED = 'Uncategorised';
const INCOME_RE = /^(income|salary|wages)$/i;

/** Returns a matcher, or null when the rule is empty or its regex is invalid. */
export function compileRule(rule: Pick<CategoryRule, 'pattern' | 'match'>): ((text: string) => boolean) | null {
  const p = rule.pattern.trim();
  if (!p) return null;
  const needle = p.toLowerCase();
  switch (rule.match) {
    case 'contains':
      return (t) => t.toLowerCase().includes(needle);
    case 'startsWith':
      return (t) => t.trim().toLowerCase().startsWith(needle);
    case 'exact':
      return (t) => t.trim().toLowerCase() === needle;
    case 'regex':
      try {
        const re = new RegExp(p, 'i');
        return (t) => re.test(t);
      } catch {
        return null;
      }
  }
}

export function ruleError(rule: CategoryRule): string | null {
  if (!rule.pattern.trim()) return 'Pattern is empty';
  if (!rule.category.trim()) return 'Category is empty';
  if (rule.match === 'regex' && !compileRule(rule)) return 'Invalid regular expression';
  return null;
}

/** First enabled rule matching the description wins. */
export function matchRules(description: string, rules: CategoryRule[]): CategoryRule | null {
  for (const rule of rules) {
    if (!rule.enabled || !rule.category.trim()) continue;
    const test = compileRule(rule);
    if (test?.(description)) return rule;
  }
  return null;
}

export interface EnrichOptions {
  /** Apply rules even when the CSV already has a category. */
  override: boolean;
  today: Date;
}

/**
 * Apply categorisation rules and derive kind/year/future for every row.
 *
 * Income vs expense: rows categorised "Income" (or bucket "Income" from the CSV)
 * are income; everything else is spending, so a positive amount in a spending
 * category is a refund that nets against that category.
 */
export function enrich(raw: RawTransaction[], rules: CategoryRule[], { override, today }: EnrichOptions): Transaction[] {
  const compiled = rules
    .filter((r) => r.enabled && r.category.trim())
    .map((r) => ({ rule: r, test: compileRule(r) }))
    .filter((c): c is { rule: CategoryRule; test: (t: string) => boolean } => c.test !== null);

  const todayMonth = monthKey(today.getFullYear(), today.getMonth() + 1);
  const todayDay = today.getDate();

  return raw.map((t) => {
    let category = t.csvCategory.trim();
    let source: CategorySource = category ? 'csv' : 'none';
    if (override || !category) {
      const hit = compiled.find((c) => c.test(t.description));
      if (hit) {
        category = hit.rule.category.trim();
        source = 'rule';
      }
    }
    if (!category) category = UNCATEGORISED;

    let kind: Kind = 'expense';
    if (INCOME_RE.test(category)) kind = 'income';
    else if (source === 'csv' && INCOME_RE.test(t.bucket)) kind = 'income';
    else if (source === 'none' && (INCOME_RE.test(t.bucket) || t.amount > 0)) kind = 'income';

    const future =
      t.estimate || t.month > todayMonth || (t.month === todayMonth && t.day !== null && t.day > todayDay);

    return {
      ...t,
      category,
      categorySource: source,
      kind,
      year: Number(t.month.slice(0, 4)),
      future,
    };
  });
}
