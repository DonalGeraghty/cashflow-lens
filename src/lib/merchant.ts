/** A leading '?' or "(est)" in the description marks a planned/estimated transaction. */
export function isEstimateDescription(description: string): boolean {
  return /^\s*\?/.test(description) || /\(\s*est(imated?)?\.?\s*\)/i.test(description);
}

/**
 * Turn a free-text description into a merchant/payee name so repeat spends group:
 *   "? booking com hotel delhi (est)" -> "Booking Com Hotel Delhi"
 *   "London - food (50%)"             -> "London"
 *   "Mom dad gift, conall"            -> "Mom Dad Gift"
 *   "tesco" / "Tesco"                 -> "Tesco"
 */
export function normaliseMerchant(description: string): string {
  let s = description
    .toLowerCase()
    .replace(/^\s*\?+\s*/, '')
    .replace(/\([^)]*\)/g, ' ');
  // Everything after " - ", " + " or a comma is a note, not the payee.
  s = s.split(/\s+[-–+]\s+|,/)[0];
  s = s
    .replace(/[^\p{L}\p{N}&'.+ ]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return s ? titleCase(s) : '(no description)';
}

function titleCase(s: string): string {
  return s.replace(/(^|[\s&])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase());
}
