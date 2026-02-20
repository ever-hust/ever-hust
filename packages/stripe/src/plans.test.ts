import { PLANS, FREE_LIMITS } from "./plans";

describe("PLANS", () => {
  it("should have 3 plans", () => {
    expect(PLANS).toHaveLength(3);
  });

  it("should have monthly, quarterly, and annual plans", () => {
    const ids = PLANS.map((p) => p.id);
    expect(ids).toContain("monthly");
    expect(ids).toContain("quarterly");
    expect(ids).toContain("annual");
  });

  it("should have correct pricing", () => {
    const monthly = PLANS.find((p) => p.id === "monthly")!;
    const quarterly = PLANS.find((p) => p.id === "quarterly")!;
    const annual = PLANS.find((p) => p.id === "annual")!;

    expect(monthly.price).toBe(20);
    expect(monthly.pricePerMonth).toBe(20);

    expect(quarterly.price).toBe(36);
    expect(quarterly.pricePerMonth).toBe(12);

    expect(annual.price).toBe(84);
    expect(annual.pricePerMonth).toBe(7);
  });

  it("quarterly should be marked as popular", () => {
    const quarterly = PLANS.find((p) => p.id === "quarterly")!;
    expect(quarterly.popular).toBe(true);
  });

  it("monthly and annual should not be marked as popular", () => {
    const monthly = PLANS.find((p) => p.id === "monthly")!;
    const annual = PLANS.find((p) => p.id === "annual")!;
    expect(monthly.popular).toBeUndefined();
    expect(annual.popular).toBeUndefined();
  });

  it("all plans should have stripePriceId fields", () => {
    for (const plan of PLANS) {
      expect(plan.stripePriceId).toBeDefined();
      expect(typeof plan.stripePriceId).toBe("string");
    }
  });

  it("all plans should have features array", () => {
    for (const plan of PLANS) {
      expect(Array.isArray(plan.features)).toBe(true);
      expect(plan.features.length).toBeGreaterThan(0);
    }
  });

  it("all plans should have unique IDs", () => {
    const ids = PLANS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("all plans should have positive prices", () => {
    for (const plan of PLANS) {
      expect(plan.price).toBeGreaterThan(0);
      expect(plan.pricePerMonth).toBeGreaterThan(0);
    }
  });

  it("all plans should have valid interval values", () => {
    const validIntervals = ["month", "quarter", "year"];
    for (const plan of PLANS) {
      expect(validIntervals).toContain(plan.interval);
    }
  });

  it("pricePerMonth should be consistent with price and interval", () => {
    const monthly = PLANS.find((p) => p.id === "monthly")!;
    const quarterly = PLANS.find((p) => p.id === "quarterly")!;
    const annual = PLANS.find((p) => p.id === "annual")!;

    // Monthly: pricePerMonth should equal price
    expect(monthly.pricePerMonth).toBe(monthly.price);

    // Quarterly: pricePerMonth should equal price / 3
    expect(quarterly.pricePerMonth).toBe(quarterly.price / 3);

    // Annual: pricePerMonth should equal price / 12
    expect(annual.pricePerMonth).toBe(annual.price / 12);
  });

  it("longer plans should have lower pricePerMonth", () => {
    const monthly = PLANS.find((p) => p.id === "monthly")!;
    const quarterly = PLANS.find((p) => p.id === "quarterly")!;
    const annual = PLANS.find((p) => p.id === "annual")!;

    expect(quarterly.pricePerMonth).toBeLessThan(monthly.pricePerMonth);
    expect(annual.pricePerMonth).toBeLessThan(quarterly.pricePerMonth);
  });

  it("all feature strings should be non-empty", () => {
    for (const plan of PLANS) {
      for (const feature of plan.features) {
        expect(feature.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("exactly one plan should be marked as popular", () => {
    const popularPlans = PLANS.filter((p) => p.popular);
    expect(popularPlans).toHaveLength(1);
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
