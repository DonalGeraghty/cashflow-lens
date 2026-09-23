import Papa from 'papaparse';
import { MONTH_NAMES, WEEKDAYS, addMonths, monthKey, parseMonthKey, weekdayOf } from './dates';

/** Small deterministic PRNG so the demo data is the same on every load. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Row = [bank: string, month: string, day: string, desc: string, type: string, amount: string, bucket: string];

/**
 * A fake year of transactions in the same shape as the real spreadsheet
 * (Bank, Date (month), Bookmark Date, Description, Type, Amount, Spending Bucket).
 * Used by "Load demo data" so the app can be explored without real data.
 */
export function generateDemoCsv(today = new Date(), months = 14): string {
  const rnd = mulberry32(42);
  const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];
  const eur = (v: number) => `${v < 0 ? '-' : ''}€${Math.abs(v).toLocaleString('en-IE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const end = monthKey(today.getFullYear(), today.getMonth() + 1);
  const rows: Row[] = [];

  for (let i = months - 1; i >= 0; i--) {
    const key = addMonths(end, -i);
    const { year, month } = parseMonthKey(key);
    const label = `${MONTH_NAMES[month - 1]} ${year}`;
    const maxDay = key === end ? today.getDate() : 28;
    const dayCell = (d: number) => `${WEEKDAYS_LONG[WEEKDAYS.indexOf(weekdayOf(year, month, d))]}, ${d} ${MONTH_NAMES[month - 1]} `;
    const add = (bank: string, desc: string, type: string, amount: number, bucket: string, day?: number) =>
      rows.push([bank, label, i < 5 && day ? dayCell(Math.min(day, maxDay)) : '', desc, type, eur(amount), bucket]);

    add('Current', 'Paycheck', 'Income', 3200 + Math.round(rnd() * 300), 'Income', 25);
    if (i % 4 === 0) add('Current', 'Side project', 'Income', 250 + Math.round(rnd() * 200), 'Income', 12);
    add('Current', 'Rent', 'Rent', -1450, 'Fixed Essential', 1);
    add('Current', 'Electric', 'Bills', -(70 + Math.round(rnd() * 40)), 'Fixed Essential', 8);
    add('Current', 'Broadband', 'Bills', -45, 'Fixed Essential', 10);
    add('Card', 'Streamflix', 'Subscriptions', i > 6 ? -10.99 : -12.99, 'Discretionary', 3);
    add('Card', 'Tunes Plus', 'Subscriptions', -11.99, 'Discretionary', 14);
    if (i < 9) add('Card', 'Cloud Storage', 'Subscriptions', -2.99, 'Discretionary', 20);
    add('Card', 'Gym', 'Gym', -39, 'Discretionary', 2);

    const shops = 14 + Math.floor(rnd() * 8);
    for (let s = 0; s < shops; s++) {
      add('Card', pick(['Grocer One', 'Corner Shop', 'Big Market', 'Fresh Foods']), 'Supermarket', -(5 + Math.round(rnd() * 5500) / 100), 'Variable Essential', 1 + Math.floor(rnd() * 28));
    }
    const nights = 2 + Math.floor(rnd() * 4);
    for (let s = 0; s < nights; s++) {
      add('Card', pick(['Cafe Bean', 'The Local', 'Noodle Bar', 'Pizza Place']), 'Social', -(8 + Math.round(rnd() * 5000) / 100), 'Discretionary', 1 + Math.floor(rnd() * 28));
    }
    if (rnd() < 0.5) add('Card', pick(['Taxi', 'Rideshare']), 'Taxi', -(12 + Math.round(rnd() * 2000) / 100), 'Discretionary', 5);
    if (rnd() < 0.35) add('Card', 'Online Store', 'Technology', -(15 + Math.round(rnd() * 12000) / 100), 'Discretionary', 18);
    if (rnd() < 0.25) add('Card', 'Pharmacy', 'Healthcare', -(6 + Math.round(rnd() * 3000) / 100), 'Variable Essential', 9);
    if (month === 12) add('Card', 'Gift shop', 'Gifts', -180, 'Discretionary', 15);
    if (i === 3) add('Card', 'Online Store refund', 'Technology', 45, 'Discretionary', 22);
  }
  // One planned expense next month, which stays hidden until "Include future" is on.
  const next = addMonths(end, 1);
  const { year: ny, month: nm } = parseMonthKey(next);
  rows.push(['Card', `${MONTH_NAMES[nm - 1]} ${ny}`, '', '? hotel booking (est)', 'Holiday', eur(-320), 'Discretionary']);
  // And one blank template row, to show up in the skipped-rows report.
  rows.push(['Card', `${MONTH_NAMES[nm - 1]} ${ny}`, '', '', '', '', 'Other']);

  return Papa.unparse({
    fields: ['Bank', 'Date (month)', 'Bookmark Date', 'Description', 'Type', 'Amount', 'Spending Bucket'],
    data: rows,
  });
}

const WEEKDAYS_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
