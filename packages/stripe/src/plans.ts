export interface Plan {
  id: string;
  name: string;
  price: number;
  interval: "month" | "quarter" | "year";
  pricePerMonth: number;
  stripePriceId: string;
  features: string[];
  popular?: boolean;
}

/**
 * Pro pricing (owner, 2026-10-05; Terms 1.1.0):
 *   - monthly $20, or yearly at 30% off with whole dollars: $14/mo = $168/yr;
 *   - no quarterly plan;
 *   - "Pro Annual" is Pro's yearly billing period, not a separate tier;
 *   - Cloud Pro starts with a 90-day free trial (CLOUD_TRIAL_DAYS). Self-hosted
 *     Pro costs the same and is sold on the ever.co shared checkout, charged at
 *     purchase, never here.
 */
export const PRO_MONTHLY_USD = 20;

/** Free-trial days on a Cloud Pro subscription. */
export const CLOUD_TRIAL_DAYS = 90;

/**
 * The yearly price per month for a whole-dollar monthly price: 30% off,
 * rounded down, with integer maths (`Math.floor(m * 0.7)` is wrong for some
 * values, e.g. 90 -> 62 instead of 63).
 */
export function yearlyMonthlyUsd(monthlyUsd: number): number {
  return Math.floor((monthlyUsd * 7) / 10);
}

const PRO_YEARLY_MONTHLY_USD = yearlyMonthlyUsd(PRO_MONTHLY_USD); // 14
const PRO_YEARLY_TOTAL_USD = PRO_YEARLY_MONTHLY_USD * 12; // 168

const PRO_FEATURES = [
  "Unlimited AI conversations",
  "Unlimited job searches",
  "Unlimited cover letters",
  "Job alerts (daily, weekly)",
  "Application agent",
  "Interview prep agent",
  "Priority support",
];

/** The plans on sale: Pro, billed monthly or yearly. */
export const PLANS: Plan[] = [
  {
    id: "monthly",
    name: "Monthly",
    price: PRO_MONTHLY_USD,
    interval: "month",
    pricePerMonth: PRO_MONTHLY_USD,
    stripePriceId: process.env.STRIPE_MONTHLY_PRICE_ID ?? "",
    features: PRO_FEATURES,
  },
  {
    id: "annual",
    name: "Annual",
    price: PRO_YEARLY_TOTAL_USD,
    interval: "year",
    pricePerMonth: PRO_YEARLY_MONTHLY_USD,
    stripePriceId: process.env.STRIPE_ANNUAL_PRICE_ID ?? "",
    features: ["Everything in Monthly", "30% savings vs monthly"],
    popular: true,
  },
];

/**
 * GATED, not deleted (owner 2026-10-05: "no quarterly"). Never offered and
 * never checked out — it is not in PLANS. Kept so a record that names it
 * still has a name and price. No quarterly price exists in Stripe.
 */
export const GATED_PLANS: Plan[] = [
  {
    id: "quarterly",
    name: "Quarterly",
    price: 36,
    interval: "quarter",
    pricePerMonth: 12,
    stripePriceId: "",
    features: ["Everything in Monthly"],
  },
];

export const FREE_LIMITS = {
  messagesPerDay: 10,
  searchesPerDay: 5,
  coverLettersPerWeek: 1,
  alerts: false,
  agents: false,
} as const;
