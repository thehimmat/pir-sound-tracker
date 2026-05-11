const DB_MIN = 40.0;
const DB_MAX = 150.0;

/**
 * Extract a dB float from raw Tesseract output.
 * Returns null if nothing valid is found.
 */
export function parseDbReading(raw: string): number | null {
  // Strip everything except digits, dot, minus
  const cleaned = raw.replace(/[^0-9.\-]/g, ' ').trim();

  // Find first token that looks like a number
  for (const token of cleaned.split(/\s+/)) {
    const n = parseFloat(token);
    if (!isNaN(n) && n >= DB_MIN && n <= DB_MAX) {
      return n;
    }
  }
  return null;
}
