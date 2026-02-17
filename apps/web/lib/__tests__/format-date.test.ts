/**
 * Tests for format-date utilities — timeAgo, formatDate, formatSessionDate, formatLocation.
 */
import { timeAgo, formatDate, formatSessionDate, formatLocation } from "../format-date";

describe("timeAgo", () => {
  it("returns null for null input", () => {
    expect(timeAgo(null)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(timeAgo(undefined)).toBeNull();
  });

  it('returns "Just now" for very recent dates', () => {
    const now = new Date();
    expect(timeAgo(now)).toBe("Just now");
  });

  it("returns minutes for dates within the hour", () => {
    const thirtyMinsAgo = new Date(Date.now() - 30 * 60_000);
    expect(timeAgo(thirtyMinsAgo)).toBe("30m ago");
  });

  it("returns hours for dates within the day", () => {
    const fiveHoursAgo = new Date(Date.now() - 5 * 60 * 60_000);
    expect(timeAgo(fiveHoursAgo)).toBe("5h ago");
  });

  it('returns "Yesterday" for dates ~1 day ago', () => {
    const oneDayAgo = new Date(Date.now() - 36 * 60 * 60_000); // 36h = definitely yesterday range
    const result = timeAgo(oneDayAgo);
    expect(result).toMatch(/Yesterday|1d ago/);
  });

  it("returns days for dates within the week", () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60_000);
    expect(timeAgo(threeDaysAgo)).toBe("3d ago");
  });

  it("returns weeks for dates within the month", () => {
    const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60_000);
    expect(timeAgo(twoWeeksAgo)).toBe("2w ago");
  });

  it("returns months for dates within the year", () => {
    const threeMonthsAgo = new Date(Date.now() - 90 * 24 * 60 * 60_000);
    expect(timeAgo(threeMonthsAgo)).toBe("3mo ago");
  });

  it("returns formatted date for very old dates", () => {
    const twoYearsAgo = new Date(Date.now() - 730 * 24 * 60 * 60_000);
    const result = timeAgo(twoYearsAgo);
    // Should fall through to formatDate which returns "Mon DD, YYYY"
    expect(result).toBeTruthy();
    expect(result).not.toContain("ago");
  });

  it("accepts string input", () => {
    const now = new Date().toISOString();
    expect(timeAgo(now)).toBe("Just now");
  });
});

describe("formatDate", () => {
  it("formats a date object", () => {
    const date = new Date("2025-01-15T12:00:00Z");
    const result = formatDate(date);
    // "Jan 15, 2025" in en-US locale
    expect(result).toContain("15");
    expect(result).toContain("2025");
  });

  it("formats a date string", () => {
    const result = formatDate("2025-06-20T00:00:00Z");
    expect(result).toContain("20");
    expect(result).toContain("2025");
  });
});

describe("formatSessionDate", () => {
  it('returns "Today at ..." for today\'s date', () => {
    // Use a date just 1 minute in the past so diffDays is always 0
    const recent = new Date(Date.now() - 60_000);
    const result = formatSessionDate(recent);
    expect(result).toMatch(/^Today at /);
  });

  it('returns "Yesterday at ..." for yesterday', () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60_000);
    yesterday.setHours(10, 30, 0);
    const result = formatSessionDate(yesterday);
    expect(result).toMatch(/^Yesterday at /);
  });

  it("returns day name for this week", () => {
    // Find a date 3 days ago (guaranteed to be within the week)
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60_000);
    threeDaysAgo.setHours(14, 0, 0);
    const result = formatSessionDate(threeDaysAgo);
    // Should contain a day name like "Monday at", "Tuesday at", etc.
    expect(result).toMatch(/at \d/);
  });

  it("returns month/day for older dates", () => {
    const oldDate = new Date("2024-03-15T12:00:00Z");
    const result = formatSessionDate(oldDate);
    // Should contain "Mar 15" or similar
    expect(result).toContain("15");
  });

  it("accepts string input", () => {
    const result = formatSessionDate(new Date().toISOString());
    expect(result).toMatch(/^Today at /);
  });
});

describe("formatLocation", () => {
  it("formats city and state", () => {
    expect(formatLocation("San Francisco", "CA")).toBe("San Francisco, CA");
  });

  it("formats city only", () => {
    expect(formatLocation("London", null)).toBe("London");
  });

  it("formats city, state, and country", () => {
    expect(formatLocation("Toronto", "ON", "Canada")).toBe("Toronto, ON, Canada");
  });

  it("returns null for no location", () => {
    expect(formatLocation(null, null)).toBeNull();
  });

  it('returns "Remote" for remote with no location', () => {
    expect(formatLocation(null, null, null, true)).toBe("Remote");
  });

  it('appends "(Remote)" when location is present', () => {
    expect(formatLocation("NYC", "NY", null, true)).toBe("NYC, NY (Remote)");
  });

  it("handles undefined inputs", () => {
    expect(formatLocation(undefined, undefined)).toBeNull();
  });

  it("returns null for empty strings", () => {
    expect(formatLocation("", "")).toBeNull();
  });
});
