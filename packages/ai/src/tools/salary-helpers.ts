/**
 * Pure utility functions for salary data processing.
 *
 * Extracted from salary-insights.ts so they can be unit-tested independently
 * without needing to mock the database layer.
 */

/**
 * Normalise a salary value to an annual figure so comparisons are meaningful.
 * The jobs table stores salaryInterval as free-text (e.g. "yearly", "monthly",
 * "hourly", "weekly"). We convert everything to yearly for aggregation.
 *
 * Falls back to assuming yearly if the interval is unknown.
 */
export function annualise(salary: number, interval: string | null): number {
  switch (interval?.toLowerCase()) {
    case "hourly":
      return salary * 2080; // 40h * 52w
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
