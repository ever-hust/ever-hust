import { formatSalary, formatDate, truncate } from "./helpers";

describe("formatSalary", () => {
  it("should return empty string when both min and max are null", () => {
    expect(formatSalary(null, null)).toBe("");
  });

  it("should return empty string when both min and max are undefined", () => {
    expect(formatSalary(undefined, undefined)).toBe("");
  });

  it("should format with min only", () => {
    const result = formatSalary(50000, null);
    expect(result).toBe("$50,000+/yr");
  });

  it("should format with max only", () => {
    const result = formatSalary(null, 100000);
    expect(result).toBe("Up to $100,000/yr");
  });

  it("should format with both min and max", () => {
    const result = formatSalary(50000, 100000);
    expect(result).toBe("$50,000 - $100,000/yr");
  });

  it("should handle string inputs", () => {
    const result = formatSalary("60000", "90000");
    expect(result).toBe("$60,000 - $90,000/yr");
  });

  it("should use EUR currency when specified", () => {
    const result = formatSalary(50000, 100000, "EUR");
    expect(result).toBe("€50,000 - €100,000/yr");
  });

  it("should use GBP currency when specified", () => {
    const result = formatSalary(50000, null, "GBP");
    expect(result).toBe("£50,000+/yr");
  });

  it("should use hourly interval", () => {
    const result = formatSalary(25, 50, "USD", "hourly");
    expect(result).toBe("$25 - $50/hourly");
  });

  it("should use monthly interval", () => {
    const result = formatSalary(5000, 8000, "USD", "monthly");
    expect(result).toBe("$5,000 - $8,000/monthly");
  });

  it("should handle large numbers without decimal places", () => {
    const result = formatSalary(150000, 250000);
    expect(result).not.toContain(".");
    expect(result).toBe("$150,000 - $250,000/yr");
  });
});

describe("formatDate", () => {
  beforeEach(() => {
    // Mock the current date to ensure consistent tests
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2024-02-15T12:00:00Z"));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("should return empty string for null", () => {
    expect(formatDate(null)).toBe("");
  });

  it("should return empty string for undefined", () => {
    expect(formatDate(undefined)).toBe("");
  });

  it("should return 'Today' for today's date", () => {
    const today = new Date("2024-02-15T10:00:00Z");
    expect(formatDate(today)).toBe("Today");
  });

  it("should return 'Yesterday' for yesterday's date", () => {
    const yesterday = new Date("2024-02-14T10:00:00Z");
    expect(formatDate(yesterday)).toBe("Yesterday");
  });

  it("should return 'Xd ago' for dates within last week", () => {
    const threeDaysAgo = new Date("2024-02-12T10:00:00Z");
    expect(formatDate(threeDaysAgo)).toBe("3d ago");

    const fiveDaysAgo = new Date("2024-02-10T10:00:00Z");
    expect(formatDate(fiveDaysAgo)).toBe("5d ago");
  });

  it("should return 'Xw ago' for dates within last month", () => {
    const oneWeekAgo = new Date("2024-02-08T10:00:00Z");
    expect(formatDate(oneWeekAgo)).toBe("1w ago");

    const twoWeeksAgo = new Date("2024-02-01T10:00:00Z");
    expect(formatDate(twoWeeksAgo)).toBe("2w ago");
  });

  it("should return formatted date for older dates", () => {
    const oldDate = new Date("2024-01-10T10:00:00Z");
    const result = formatDate(oldDate);
    expect(result).toMatch(/Jan 10/);
  });

  it("should handle string date input", () => {
    const dateString = "2024-02-14T10:00:00Z";
    expect(formatDate(dateString)).toBe("Yesterday");
  });

  it("should handle Date object input", () => {
    const dateObj = new Date("2024-02-14T10:00:00Z");
    expect(formatDate(dateObj)).toBe("Yesterday");
  });
});

describe("truncate", () => {
  it("should return string as-is if shorter than limit", () => {
    const str = "Hello";
    expect(truncate(str, 10)).toBe("Hello");
  });

  it("should return string as-is if equal to limit", () => {
    const str = "Hello";
    expect(truncate(str, 5)).toBe("Hello");
  });

  it("should truncate string longer than limit", () => {
    const str = "Hello World";
    expect(truncate(str, 5)).toBe("Hello...");
  });

  it("should truncate long text correctly", () => {
    const str = "This is a very long string that needs to be truncated";
    const result = truncate(str, 20);
    expect(result).toBe("This is a very long ...");
    expect(result.length).toBe(23); // 20 chars + "..."
  });

  it("should handle empty string", () => {
    expect(truncate("", 5)).toBe("");
  });

  it("should handle zero length limit", () => {
    const str = "Hello";
    expect(truncate(str, 0)).toBe("...");
  });

  it("should handle single character truncation", () => {
    const str = "Hello";
    expect(truncate(str, 1)).toBe("H...");
  });
});
