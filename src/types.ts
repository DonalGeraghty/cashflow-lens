export type Kind = 'income' | 'expense';

/**
 * One transaction as parsed from the CSV, before categorisation rules run.
 * This is what gets persisted, so rule edits re-apply without re-importing.
 */
export interface RawTransaction {
  id: string;
  /** 1-based line in the source file (for the skipped-rows report and debugging). */
  line: number;
  account: string;
  /** Budget month, 'YYYY-MM'. Every row has one. */
  month: string;
  /** Day of month when the source provides it, else null. */
  day: number | null;
  description: string;
  /** Normalised payee derived from the description ("London - food (50%)" -> "London"). */
  merchant: string;
  /** Category from the CSV, '' when absent. */
  csvCategory: string;
  bucket: string;
  /** Signed amount; negative is money out. */
  amount: number;
  currency: string;
  /** Description marks this as an estimate (leading '?' or '(est)'). */
  estimate: boolean;
}

export type CategorySource = 'csv' | 'rule' | 'none';

/** A transaction after rules, income/expense classification and date enrichment. */
export interface Transaction extends RawTransaction {
  category: string;
  categorySource: CategorySource;
  kind: Kind;
  year: number;
  /** Dated after today, or flagged as an estimate. Hidden by default. */
  future: boolean;
}
