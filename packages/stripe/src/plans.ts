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

export const PLANS: Plan[] = [
  {
    id: "monthly",
    name: "Monthly",
    price: 20,
    interval: "month",
    pricePerMonth: 20,
    stripePriceId: process.env.STRIPE_MONTHLY_PRICE_ID ?? "",
    features: [
      "Unlimited AI conversations",
      "Unlimited job searches",
      "Unlimited cover letters",
      "Job alerts (daily, weekly)",
      "Application agent",
      "Interview prep agent",
      "Priority support",
    ],
  },
  {
    id: "quarterly",
    name: "Quarterly",
    price: 36,
    interval: "quarter",
    pricePerMonth: 12,
    stripePriceId: process.env.STRIPE_QUARTERLY_PRICE_ID ?? "",
    features: [
      "Everything in Monthly",
      "40% savings",
      "Advanced analytics",
    ],
    popular: true,
  },
  {
    id: "annual",
    name: "Annual",
    price: 84,
    interval: "year",
    pricePerMonth: 7,
    stripePriceId: process.env.STRIPE_ANNUAL_PRICE_ID ?? "",
    features: [
      "Everything in Quarterly",
      "65% savings",
      "Early access to new features",
    ],
  },
];

export const FREE_LIMITS = {
  messagesPerDay: 10,
  searchesPerDay: 5,
  coverLettersPerWeek: 1,
  alerts: false,
  agents: false,
} as const;
