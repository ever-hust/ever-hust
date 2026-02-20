import { annualise, median } from "./salary-helpers";

describe("annualise", () => {
  it("returns salary as-is for yearly/annual/annually", () => {
    expect(annualise(100_000, "yearly")).toBe(100_000);
    expect(annualise(100_000, "annual")).toBe(100_000);
    expect(annualise(100_000, "annually")).toBe(100_000);
  });

  it("converts hourly to annual (40h * 52w = 2080)", () => {
    expect(annualise(50, "hourly")).toBe(50 * 2080);
  });

  it("converts weekly to annual (* 52)", () => {
    expect(annualise(2000, "weekly")).toBe(2000 * 52);
  });

  it("converts biweekly to annual (* 26)", () => {
    expect(annualise(4000, "biweekly")).toBe(4000 * 26);
  });

  it("converts monthly to annual (* 12)", () => {
    expect(annualise(8000, "monthly")).toBe(8000 * 12);
  });

  it("is case-insensitive", () => {
    expect(annualise(50, "Hourly")).toBe(50 * 2080);
    expect(annualise(2000, "WEEKLY")).toBe(2000 * 52);
    expect(annualise(8000, "Monthly")).toBe(8000 * 12);
  });

  it("falls back to yearly for unknown intervals", () => {
    expect(annualise(100_000, "quarterly")).toBe(100_000);
    expect(annualise(100_000, "once")).toBe(100_000);
    expect(annualise(100_000, "")).toBe(100_000);
  });

  it("falls back to yearly for null interval", () => {
    expect(annualise(100_000, null)).toBe(100_000);
  });

  it("handles zero salary", () => {
    expect(annualise(0, "hourly")).toBe(0);
    expect(annualise(0, "monthly")).toBe(0);
  });

  it("handles fractional salaries", () => {
    expect(annualise(25.5, "hourly")).toBe(25.5 * 2080);
  });
});

describe("median", () => {
  it("returns 0 for empty array", () => {
    expect(median([])).toBe(0);
  });

  it("returns the single element for length-1 array", () => {
    expect(median([42])).toBe(42);
  });

  it("returns the middle element for odd-length array", () => {
    expect(median([10, 20, 30])).toBe(20);
    expect(median([1, 2, 3, 4, 5])).toBe(3);
  });

  it("returns the average of two middle elements for even-length array", () => {
    expect(median([10, 20])).toBe(15);
    expect(median([10, 20, 30, 40])).toBe(25);
  });

  it("rounds the average to 2 decimal places", () => {
    // (10 + 11) / 2 = 10.5 — rounds cleanly
    expect(median([10, 11])).toBe(10.5);
    // (1 + 2) / 2 = 1.5
    expect(median([1, 2])).toBe(1.5);
  });

  it("handles large arrays", () => {
    const sorted = Array.from({ length: 1001 }, (_, i) => i);
    expect(median(sorted)).toBe(500);
  });

  it("handles negative numbers", () => {
    expect(median([-30, -20, -10])).toBe(-20);
  });

  it("handles duplicate values", () => {
    expect(median([5, 5, 5, 5])).toBe(5);
  });
});
