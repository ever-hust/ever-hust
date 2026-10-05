import {
  PLANS,
  FREE_LIMITS,
  GATED_PLANS,
  CLOUD_TRIAL_DAYS,
  PRO_MONTHLY_USD,
  yearlyMonthlyUsd,
} from "./plans";

describe("PLANS (owner 2026-10-05: monthly $20, yearly $14/mo = $168, no quarterly)", () => {
  it("sells exactly Pro monthly and Pro yearly", () => {
    expect(PLANS.map((p) => p.id)).toEqual(["monthly", "annual"]);
  });

  it("has the owner's prices", () => {
    const monthly = PLANS.find((p) => p.id === "monthly")!;
    const annual = PLANS.find((p) => p.id === "annual")!;
    expect(PRO_MONTHLY_USD).toBe(20);
    expect(monthly.price).toBe(20);
    expect(monthly.pricePerMonth).toBe(20);
    expect(annual.price).toBe(168);
    expect(annual.pricePerMonth).toBe(14);
    expect(annual.interval).toBe("year");
  });

  it("yearly is 30% off with whole dollars, using integer maths", () => {
    expect(yearlyMonthlyUsd(20)).toBe(14);
    expect(yearlyMonthlyUsd(90)).toBe(63); // Math.floor(90 * 0.7) would say 62
    const annual = PLANS.find((p) => p.id === "annual")!;
    expect(annual.price).toBe(annual.pricePerMonth * 12);
  });

  it("offers no quarterly plan; it is gated, not deleted", () => {
    expect(PLANS.some((p) => p.id === "quarterly" || p.interval === "quarter")).toBe(false);
    expect(GATED_PLANS.map((p) => p.id)).toEqual(["quarterly"]);
    expect(GATED_PLANS[0]?.stripePriceId).toBe("");
  });

  it("the yearly period carries the same Pro features (not a separate tier)", () => {
    const annual = PLANS.find((p) => p.id === "annual")!;
    expect(annual.features).toContain("Everything in Monthly");
    expect(annual.features.join(" ")).not.toMatch(/early access|quarterly/i);
  });

  it("the Cloud trial is 90 days", () => {
    expect(CLOUD_TRIAL_DAYS).toBe(90);
  });

  it("exactly one plan is marked popular, and it is yearly", () => {
    const popular = PLANS.filter((p) => p.popular);
    expect(popular.map((p) => p.id)).toEqual(["annual"]);
  });

  it("all plans have a stripePriceId field, features, unique ids and positive prices", () => {
    const ids = PLANS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const plan of PLANS) {
      expect(typeof plan.stripePriceId).toBe("string");
      expect(plan.features.length).toBeGreaterThan(0);
      for (const f of plan.features) expect(f.trim().length).toBeGreaterThan(0);
      expect(plan.price).toBeGreaterThan(0);
      expect(plan.pricePerMonth).toBeGreaterThan(0);
      expect(["month", "year"]).toContain(plan.interval);
    }
  });

  it("yearly costs less per month than monthly", () => {
    const monthly = PLANS.find((p) => p.id === "monthly")!;
    const annual = PLANS.find((p) => p.id === "annual")!;
    expect(annual.pricePerMonth).toBeLessThan(monthly.pricePerMonth);
  });
});

describe("FREE_LIMITS", () => {
  it("should have correct limits", () => {
    expect(FREE_LIMITS.messagesPerDay).toBe(10);
    expect(FREE_LIMITS.searchesPerDay).toBe(5);
    expect(FREE_LIMITS.coverLettersPerWeek).toBe(1);
    expect(FREE_LIMITS.alerts).toBe(false);
    expect(FREE_LIMITS.agents).toBe(false);
  });

  it("all numeric limits should be positive integers", () => {
    expect(Number.isInteger(FREE_LIMITS.messagesPerDay)).toBe(true);
    expect(Number.isInteger(FREE_LIMITS.searchesPerDay)).toBe(true);
    expect(Number.isInteger(FREE_LIMITS.coverLettersPerWeek)).toBe(true);
    expect(FREE_LIMITS.messagesPerDay).toBeGreaterThan(0);
    expect(FREE_LIMITS.searchesPerDay).toBeGreaterThan(0);
    expect(FREE_LIMITS.coverLettersPerWeek).toBeGreaterThan(0);
  });

  it("premium features should be disabled for free tier", () => {
    expect(FREE_LIMITS.alerts).toBe(false);
    expect(FREE_LIMITS.agents).toBe(false);
  });
});
