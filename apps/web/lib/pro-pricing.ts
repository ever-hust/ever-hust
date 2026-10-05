/**
 * Pro prices for client components (the server-side source of truth is
 * PLANS in packages/stripe/src/plans.ts; a test pins the two together).
 * Owner 2026-10-05: $20/month, or $14/month billed $168 a year (30% off,
 * whole dollars); Cloud Pro starts with a 90-day free trial.
 */
export const PRO_PRICING = {
  monthlyUsd: 20,
  yearlyMonthlyUsd: 14,
  yearlyTotalUsd: 168,
  trialDays: 90,
} as const;
