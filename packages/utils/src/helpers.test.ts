import { formatDate, truncate } from "./helpers";

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
