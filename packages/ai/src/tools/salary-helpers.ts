/**
 * Pure utility functions for salary data processing.
 *
 * Extracted from salary-insights.ts so they can be unit-tested independently
 * without needing to mock the database layer.
 */

/**
 * Normalise a salary value to an annual figure so comparisons are meaningful.
 * The jobs table stores salaryInterval as free-text (the jobs API sends "yearly",
 * "monthly", "weekly", "daily" or "hourly"). We convert everything to yearly for
 * aggregation.
 *
 * Falls back to assuming yearly if the interval is unknown.
 */
export function annualise(salary: number, interval: string | null): number {
  switch (interval?.toLowerCase()) {
    case "hourly":
      return salary * 2080; // 40h * 52w
    case "daily":
      return salary * 260; // 5d * 52w
    case "weekly":
      return salary * 52;
    case "biweekly":
      return salary * 26;
    case "monthly":
      return salary * 12;
    case "yearly":
    case "annual":
    case "annually":
    default:
      return salary;
  }
}

/**
 * Compute the median of a sorted (ascending) array of numbers.
 * Returns 0 for an empty array.
 */
export function median(sorted: number[]): number {
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[mid]!;
  }
  return Math.round(((sorted[mid - 1]! + sorted[mid]!) / 2) * 100) / 100;
}

/**
 * Keep only the entries in the most common currency, so statistics never mix
 * currencies (averaging USD and INR figures gives a meaningless number).
 *
 * A null currency counts as USD. Codes are compared case-insensitively. On a
 * tie, the currency seen first wins. `excluded` is how many entries were in
 * another currency and left out.
 */
export function keepDominantCurrency<T extends { currency: string | null }>(
  entries: readonly T[],
): { currency: string; kept: T[]; excluded: number } {
  const codeOf = (entry: T) => entry.currency?.toUpperCase() ?? "USD";

  const counts = new Map<string, number>();
  for (const entry of entries) {
    const code = codeOf(entry);
    counts.set(code, (counts.get(code) ?? 0) + 1);
  }

  let currency = "USD";
  let maxCount = 0;
  for (const [code, count] of counts) {
    if (count > maxCount) {
      currency = code;
      maxCount = count;
    }
  }

  const kept = entries.filter((entry) => codeOf(entry) === currency);
  return { currency, kept, excluded: entries.length - kept.length };
}
