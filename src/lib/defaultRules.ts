import type { CategoryRule, MatchType } from './categorise';

// Starter keyword rules. They only fill in rows that have no category unless
// "Rules override CSV categories" is switched on. Edit them in Data & rules.
const seed: [pattern: string, category: string, match?: MatchType][] = [
  ['paycheck', 'Income'],
  ['salary', 'Income'],
  ['payroll', 'Income'],
  ['mortgage', 'Mortgage'],
  ['\\b(tesco|spar|centra|lidl|aldi|dunnes|supervalu|m&s|fresh|londis|mace|euro giant)\\b', 'Supermarket', 'regex'],
  ['\\b(netflix|disney|youtube|spotify|crunchyroll|paramount|prime|apple\\.com|icloud|chatgpt|openai|cursor)\\b', 'Subscriptions', 'regex'],
  ['\\b(electric|electricity|gas networks|bord gais|energia|internet|broadband|virgin media|sky|eir|vodafone|three|insurance)\\b', 'Bills', 'regex'],
  ['\\b(taxi|uber|free ?now|bolt)\\b', 'Taxi', 'regex'],
  ['\\b(bus|luas|dart|irish rail|leap|aircoach|train)\\b', 'Travel', 'regex'],
  ['\\b(pharmacy|chemist|boots|doctor|gp|vhi|laya|dentist|hospital)\\b', 'Healthcare', 'regex'],
  ['\\b(cinema|odeon|imc|omniplex|lighthouse)\\b', 'Cinema', 'regex'],
  ['\\b(ryanair|aer lingus|booking\\.?com|airbnb|hotel|flight)\\b', 'Holiday', 'regex'],
  ['\\b(amazon|currys|harvey norman|apple store)\\b', 'Technology', 'regex'],
  ['\\b(gym|flyefit|energie|anytime fitness)\\b', 'Gym', 'regex'],
  ['\\b(barber|hairdresser|salon)\\b', 'Personal Care', 'regex'],
  ['\\b(ikea|woodies|homestore|b&q)\\b', 'Home', 'regex'],
  ['\\b(penneys|pennies|zara|h&m|arnotts|brown thomas)\\b', 'Clothes', 'regex'],
  ['laundry', 'Laundry'],
  ['\\b(pub|bar|restaurant|cafe|coffee|burger|pizza|subway|boojum|chopped|nandos)\\b', 'Social', 'regex'],
  ['\\b(revenue|property tax|lpt)\\b', 'Tax', 'regex'],
  ['\\batm\\b', 'Cash', 'regex'],
];

export function defaultRules(): CategoryRule[] {
  return seed.map(([pattern, category, match = 'contains'], i) => ({
    id: `default-${i}`,
    pattern,
    match,
    category,
    enabled: true,
  }));
}
