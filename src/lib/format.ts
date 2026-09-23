const cache = new Map<string, Intl.NumberFormat>();
function fmt(key: string, make: () => Intl.NumberFormat) {
  let f = cache.get(key);
  if (!f) cache.set(key, (f = make()));
  return f;
}

export function formatMoney(v: number, currency = 'EUR', opts: { compact?: boolean; sign?: boolean } = {}): string {
  const key = `m|${currency}|${opts.compact}|${opts.sign}`;
  const f = fmt(key, () =>
    new Intl.NumberFormat('en-IE', {
      style: 'currency',
      currency,
      notation: opts.compact ? 'compact' : 'standard',
      maximumFractionDigits: opts.compact ? 1 : 2,
      minimumFractionDigits: opts.compact ? 0 : 2,
      signDisplay: opts.sign ? 'exceptZero' : 'auto',
    }),
  );
  return f.format(v);
}

export function formatNumber(v: number, digits = 2): string {
  return fmt(`n|${digits}`, () =>
    new Intl.NumberFormat('en-IE', { maximumFractionDigits: digits, minimumFractionDigits: 0 }),
  ).format(v);
}

export function formatPct(v: number, opts: { sign?: boolean } = {}): string {
  return fmt(`p|${opts.sign}`, () =>
    new Intl.NumberFormat('en-IE', {
      style: 'percent',
      maximumFractionDigits: 1,
      signDisplay: opts.sign ? 'exceptZero' : 'auto',
    }),
  ).format(v);
}
