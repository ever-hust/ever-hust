import { PLANS, CLOUD_TRIAL_DAYS, GATED_PLANS } from "@ever-hust/stripe";
import { PRO_PRICING } from "../pro-pricing";

// The client-side copy must state exactly what the checkout charges.
describe("PRO_PRICING (client copy) matches the plans the checkout sells", () => {
  it("monthly and yearly prices and the trial agree with packages/stripe", () => {
    const monthly = PLANS.find((p) => p.id === "monthly")!;
    const annual = PLANS.find((p) => p.id === "annual")!;
    expect(PRO_PRICING.monthlyUsd).toBe(monthly.price);
    expect(PRO_PRICING.yearlyTotalUsd).toBe(annual.price);
    expect(PRO_PRICING.yearlyMonthlyUsd).toBe(annual.pricePerMonth);
    expect(PRO_PRICING.trialDays).toBe(CLOUD_TRIAL_DAYS);
  });

  it("the owner's numbers: $20/mo, $14/mo billed $168, 90 days", () => {
    expect(PRO_PRICING).toEqual({
      monthlyUsd: 20,
      yearlyMonthlyUsd: 14,
      yearlyTotalUsd: 168,
      trialDays: 90,
    });
  });

  it("the quarterly plan stays gated", () => {
    expect(PLANS.map((p) => p.id)).not.toContain("quarterly");
    expect(GATED_PLANS.map((p) => p.id)).toContain("quarterly");
  });
});
