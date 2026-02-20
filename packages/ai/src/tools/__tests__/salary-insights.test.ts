import { annualise, median } from "../salary-helpers";

// ---------------------------------------------------------------------------
// annualise()
// ---------------------------------------------------------------------------
describe("annualise", () => {
  describe("interval conversions", () => {
    it("should convert hourly salary to annual (*2080)", () => {
      expect(annualise(50, "hourly")).toBe(50 * 2080); // 104_000
    });

    it("should convert weekly salary to annual (*52)", () => {
      expect(annualise(1_500, "weekly")).toBe(1_500 * 52); // 78_000
    });

    it("should convert biweekly salary to annual (*26)", () => {
      expect(annualise(3_000, "biweekly")).toBe(3_000 * 26); // 78_000
    });

    it("should convert monthly salary to annual (*12)", () => {
      expect(annualise(8_000, "monthly")).toBe(8_000 * 12); // 96_000
    });

    it('should pass through yearly salary unchanged', () => {
      expect(annualise(120_000, "yearly")).toBe(120_000);
    });

    it('should pass through "annual" salary unchanged', () => {
      expect(annualise(110_000, "annual")).toBe(110_000);
    });

    it('should pass through "annually" salary unchanged', () => {
      expect(annualise(105_000, "annually")).toBe(105_000);
    });
  });

  describe("default / fallback behaviour", () => {
    it("should pass through when interval is null", () => {
      expect(annualise(100_000, null)).toBe(100_000);
    });

    it("should pass through when interval is an unknown string", () => {
      expect(annualise(90_000, "per-project")).toBe(90_000);
    });

    it("should pass through when interval is an empty string", () => {
      expect(annualise(85_000, "")).toBe(85_000);
    });
  });

  describe("case insensitivity", () => {
    it('should handle "HOURLY" (uppercase)', () => {
      expect(annualise(40, "HOURLY")).toBe(40 * 2080);
    });

    it('should handle "Monthly" (title case)', () => {
      expect(annualise(7_000, "Monthly")).toBe(7_000 * 12);
    });

    it('should handle "WEEKLY" (uppercase)', () => {
      expect(annualise(2_000, "WEEKLY")).toBe(2_000 * 52);
    });

    it('should handle "BiWeekly" (mixed case)', () => {
      expect(annualise(2_500, "BiWeekly")).toBe(2_500 * 26);
    });

    it('should handle "YEARLY" (uppercase)', () => {
      expect(annualise(130_000, "YEARLY")).toBe(130_000);
    });

    it('should handle "ANNUAL" (uppercase)', () => {
      expect(annualise(125_000, "ANNUAL")).toBe(125_000);
    });

    it('should handle "Annually" (title case)', () => {
      expect(annualise(115_000, "Annually")).toBe(115_000);
    });
  });

  describe("edge-case salary values", () => {
    it("should handle zero salary", () => {
      expect(annualise(0, "hourly")).toBe(0);
      expect(annualise(0, "monthly")).toBe(0);
      expect(annualise(0, null)).toBe(0);
    });

    it("should handle negative salary", () => {
      // While unusual, the function should still apply the multiplier
      expect(annualise(-50, "hourly")).toBe(-50 * 2080);
      expect(annualise(-1_000, "monthly")).toBe(-1_000 * 12);
    });

    it("should handle very large salary values", () => {
      expect(annualise(500, "hourly")).toBe(1_040_000);
      expect(annualise(100_000, "monthly")).toBe(1_200_000);
    });

    it("should handle fractional salary values", () => {
      expect(annualise(25.5, "hourly")).toBe(25.5 * 2080);
      expect(annualise(7_500.75, "monthly")).toBe(7_500.75 * 12);
    });
  });
});

// ---------------------------------------------------------------------------
// median()
// ---------------------------------------------------------------------------
describe("median", () => {
  describe("empty and single-element arrays", () => {
    it("should return 0 for an empty array", () => {
      expect(median([])).toBe(0);
    });

    it("should return the element for a single-element array", () => {
      expect(median([42_000])).toBe(42_000);
    });
  });

  describe("odd-length arrays", () => {
    it("should return the middle element for 3 elements", () => {
      expect(median([10, 20, 30])).toBe(20);
    });

    it("should return the middle element for 5 elements", () => {
      expect(median([50_000, 60_000, 70_000, 80_000, 90_000])).toBe(70_000);
    });

    it("should return the middle element for 7 elements", () => {
      expect(median([1, 2, 3, 4, 5, 6, 7])).toBe(4);
    });
  });

  describe("even-length arrays", () => {
    it("should return the average of two middle elements for 2 elements", () => {
      expect(median([10, 20])).toBe(15);
    });

    it("should return the average of two middle elements for 4 elements", () => {
      // middle elements: 60_000 and 80_000 => 70_000
      expect(median([50_000, 60_000, 80_000, 100_000])).toBe(70_000);
    });

    it("should return the average of two middle elements for 6 elements", () => {
      // middle elements: 30 and 40 => 35
      expect(median([10, 20, 30, 40, 50, 60])).toBe(35);
    });

    it("should round to 2 decimal places when average is not exact", () => {
      // middle elements: 10 and 21 => 15.5
      expect(median([10, 21])).toBe(15.5);

      // middle elements: 10 and 11 => 10.5
      expect(median([10, 11])).toBe(10.5);

      // middle elements: 1 and 2 => 1.5
      expect(median([1, 2])).toBe(1.5);
    });

    it("should round correctly for repeating decimals", () => {
      // middle elements: 10 and 13 => 11.5
      expect(median([10, 13])).toBe(11.5);

      // middle elements: 1 and 4 => 2.5
      expect(median([1, 4])).toBe(2.5);

      // 10 and 11 => 10.5
      expect(median([5, 10, 11, 20])).toBe(10.5);
    });
  });

  describe("arrays with identical values", () => {
    it("should return the value when all elements are the same (odd)", () => {
      expect(median([50_000, 50_000, 50_000])).toBe(50_000);
    });

    it("should return the value when all elements are the same (even)", () => {
      expect(median([75_000, 75_000, 75_000, 75_000])).toBe(75_000);
    });
  });

  describe("large arrays", () => {
    it("should compute correct median for a large odd-length array", () => {
      // 101 elements: 0, 1, 2, ..., 100. Median = 50
      const arr = Array.from({ length: 101 }, (_, i) => i);
      expect(median(arr)).toBe(50);
    });

    it("should compute correct median for a large even-length array", () => {
      // 100 elements: 0, 1, 2, ..., 99. Middle: 49 and 50 => 49.5
      const arr = Array.from({ length: 100 }, (_, i) => i);
      expect(median(arr)).toBe(49.5);
    });

    it("should compute correct median for 1000 elements", () => {
      // 1000 elements: 1, 2, ..., 1000. Middle: 500 and 501 => 500.5
      const arr = Array.from({ length: 1000 }, (_, i) => i + 1);
      expect(median(arr)).toBe(500.5);
    });
  });

  describe("edge-case values", () => {
    it("should handle an array containing zero", () => {
      expect(median([0])).toBe(0);
      expect(median([0, 0, 0])).toBe(0);
    });

    it("should handle negative numbers", () => {
      expect(median([-30, -20, -10])).toBe(-20);
    });

    it("should handle mixed negative and positive numbers", () => {
      // sorted: [-10, 0, 10] => median 0
      expect(median([-10, 0, 10])).toBe(0);
    });

    it("should handle very large numbers", () => {
      expect(median([1_000_000, 2_000_000, 3_000_000])).toBe(2_000_000);
    });

    it("should handle fractional numbers", () => {
      expect(median([1.5, 2.5, 3.5])).toBe(2.5);
    });

    it("should handle fractional even-length array with rounding", () => {
      // middle: 2.3 and 4.7 => 3.5
      expect(median([1.1, 2.3, 4.7, 5.9])).toBe(3.5);
    });
  });
});
