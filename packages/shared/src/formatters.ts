/**
 * Formats integer paise into a standard Indian Rupee string (e.g. 15000 paise -> "₹150.00").
 */
export function formatPaiseToInr(paise: number): string {
  const rupees = (paise / 100).toFixed(2);
  return `₹${rupees}`;
}

/**
 * Parses rupee float string or number to integer paise (e.g. 150.50 -> 15050).
 */
export function parseRupeesToPaise(rupees: number | string): number {
  const num = typeof rupees === 'string' ? parseFloat(rupees) : rupees;
  if (isNaN(num)) return 0;
  return Math.round(num * 100);
}
