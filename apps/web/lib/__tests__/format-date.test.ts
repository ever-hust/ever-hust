/**
 * Tests for format-date utilities — timeAgo, formatDate, formatShortDate,
 * formatSessionDate, formatLocation, formatSalary.
 */
import {
  timeAgo,
  formatDate,
  formatShortDate,
  formatSessionDate,
  formatLocation,
  formatSalary,
} from "../format-date";

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

  it("returns null for empty string (falsy)", () => {
    expect(timeAgo("")).toBeNull();
  });

  it("returns null for an invalid date string", () => {
    expect(timeAgo("not-a-real-date")).toBeNull();
    expect(timeAgo("0000-00-00")).toBeNull();
  });

  it("handles a future date (negative diff)", () => {
    const oneHourFromNow = new Date(Date.now() + 60 * 60_000);
    const result = timeAgo(oneHourFromNow);
    // mins will be negative, so it should return "Just now" or a string
    expect(typeof result).toBe("string");
  });

  it("returns exactly 1m ago for date exactly 1 minute old", () => {
    const oneMinAgo = new Date(Date.now() - 60_000);
    expect(timeAgo(oneMinAgo)).toBe("1m ago");
  });

  it("returns 1h ago for date exactly 60 minutes old", () => {
    const oneHourAgo = new Date(Date.now() - 60 * 60_000);
    expect(timeAgo(oneHourAgo)).toBe("1h ago");
  });

  it("returns 1w ago for date exactly 7 days old", () => {
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60_000);
    expect(timeAgo(oneWeekAgo)).toBe("1w ago");
  });

  it("handles a very old date (year 1970)", () => {
    const epoch = new Date(0);
    const result = timeAgo(epoch);
    // Should fall through to formatDate for dates older than 365 days
    expect(result).toBeTruthy();
    expect(result).toContain("1970");
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

  it("returns em-dash for an invalid date string", () => {
    expect(formatDate("not-a-date")).toBe("—");
    expect(formatDate("0000-00-00")).toBe("—");
  });

  it("formats a very old date (year 1900)", () => {
    // Use midday UTC to avoid timezone offset flipping to the previous day
    const result = formatDate("1900-06-15T12:00:00Z");
    expect(result).toContain("1900");
    expect(result).toContain("15");
  });

  it("formats a date far in the future (year 2099)", () => {
    // Use midday UTC to avoid timezone offset flipping to the next day
    const result = formatDate("2099-06-15T12:00:00Z");
    expect(result).toContain("2099");
    expect(result).toContain("15");
  });

  it("formats epoch date (1970-01-01)", () => {
    const result = formatDate(new Date(0));
    expect(result).toContain("1970");
  });

  it("formats a leap day date", () => {
    const result = formatDate("2024-02-29T12:00:00Z");
    expect(result).toContain("29");
    expect(result).toContain("2024");
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
    // Use 30 hours ago to guarantee diffDays=1 regardless of time-of-day
    const yesterday = new Date(Date.now() - 30 * 60 * 60_000);
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

  it("includes year for dates in a different year", () => {
    const oldDate = new Date("2020-07-04T15:00:00Z");
    const result = formatSessionDate(oldDate);
    // Should contain the year since it's not the current year
    expect(result).toContain("2020");
  });

  it("formats a very old date without crashing", () => {
    const ancient = new Date("1970-01-01T00:00:00Z");
    const result = formatSessionDate(ancient);
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("formats a future date without crashing", () => {
    const future = new Date("2099-12-31T23:59:59Z");
    const result = formatSessionDate(future);
    // diffDays will be negative, so it goes to the "older" branch
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
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

// =========================================================================
// formatShortDate
// =========================================================================

describe("formatShortDate", () => {
  it("formats a date object without year", () => {
    const date = new Date("2025-01-15T12:00:00Z");
    const result = formatShortDate(date);
    expect(result).toContain("15");
    // Should NOT contain the year
    expect(result).not.toContain("2025");
  });

  it("formats a date string without year", () => {
    const result = formatShortDate("2025-06-20T00:00:00Z");
    expect(result).toContain("20");
    expect(result).not.toContain("2025");
  });

  it("includes abbreviated month name", () => {
    const result = formatShortDate(new Date("2025-03-05T00:00:00Z"));
    expect(result).toContain("Mar");
  });

  it("returns a string", () => {
    expect(typeof formatShortDate(new Date())).toBe("string");
  });

  it("formats December correctly", () => {
    const result = formatShortDate(new Date("2025-12-25T00:00:00Z"));
    expect(result).toContain("Dec");
    expect(result).toContain("25");
  });

  it("does not include year for very old dates", () => {
    const result = formatShortDate(new Date("1999-06-15T00:00:00Z"));
    expect(result).not.toContain("1999");
  });

  it("returns em-dash for an invalid date string", () => {
    expect(formatShortDate("invalid-date")).toBe("—");
  });
});

// =========================================================================
// formatSalary
// =========================================================================

describe("formatSalary", () => {
  // --- null / empty inputs ---
  it("returns null when both min and max are null", () => {
    expect(formatSalary(null, null)).toBeNull();
  });

  it("returns null when both min and max are undefined", () => {
    expect(formatSalary(undefined, undefined)).toBeNull();
  });

  // --- compact mode (default) with range ---
  it("formats min-max range in compact mode", () => {
    expect(formatSalary("80000", "120000", "USD", "yearly")).toBe("$80k - $120k/yr");
  });

  it("formats min-only in compact mode", () => {
    expect(formatSalary("80000", null, "USD")).toBe("$80k+");
  });

  it("formats max-only in compact mode", () => {
    expect(formatSalary(null, "120000", "USD")).toBe("Up to $120k");
  });

  // --- full mode ---
  it("formats min-max range in full mode", () => {
    expect(formatSalary("80000", "120000", "USD", "yearly", "full")).toBe(
      "$80,000 - $120,000 /yearly"
    );
  });

  it("formats min-only in full mode", () => {
    expect(formatSalary("80000", null, "USD", null, "full")).toBe("$80,000+");
  });

  it("formats max-only in full mode", () => {
    expect(formatSalary(null, "120000", "USD", null, "full")).toBe("Up to $120,000");
  });

  // --- interval suffixes (compact) ---
  it("appends /yr for yearly interval in compact mode", () => {
    expect(formatSalary("100000", "150000", "USD", "yearly")).toBe("$100k - $150k/yr");
  });

  it("appends /mo for monthly interval in compact mode", () => {
    expect(formatSalary("5000", "8000", "USD", "monthly")).toBe("$5k - $8k/mo");
  });

  it("appends /hr for hourly interval in compact mode", () => {
    expect(formatSalary("50", "100", "USD", "hourly")).toBe("$50 - $100/hr");
  });

  it("appends /yr for 'year' synonym in compact mode", () => {
    expect(formatSalary("100000", "200000", "USD", "year")).toBe("$100k - $200k/yr");
  });

  it("appends /mo for 'month' synonym in compact mode", () => {
    expect(formatSalary("5000", "10000", "USD", "month")).toBe("$5k - $10k/mo");
  });

  it("appends /hr for 'hour' synonym in compact mode", () => {
    expect(formatSalary("25", "50", "USD", "hour")).toBe("$25 - $50/hr");
  });

  it("uses raw interval name as fallback for unknown intervals", () => {
    expect(formatSalary("1000", "2000", "USD", "biweekly")).toBe("$1k - $2k/biweekly");
  });

  // --- full mode interval suffix ---
  it("appends raw interval with space-slash in full mode", () => {
    expect(formatSalary("80000", "120000", "USD", "yearly", "full")).toBe(
      "$80,000 - $120,000 /yearly"
    );
  });

  // --- currency handling ---
  it("defaults to USD when currency is null", () => {
    expect(formatSalary("80000", "120000")).toBe("$80k - $120k");
  });

  it("defaults to USD when currency is undefined", () => {
    expect(formatSalary("80000", "120000", undefined)).toBe("$80k - $120k");
  });

  it("uses currency code as prefix for non-USD currencies", () => {
    expect(formatSalary("80000", "120000", "EUR")).toBe("EUR80k - EUR120k");
  });

  it("uses GBP prefix for British pounds", () => {
    expect(formatSalary("50000", "70000", "GBP")).toBe("GBP50k - GBP70k");
  });

  // --- compact mode threshold ---
  it("does not abbreviate values below 1000 in compact mode", () => {
    expect(formatSalary("500", "999", "USD")).toBe("$500 - $999");
  });

  it("abbreviates values at exactly 1000", () => {
    expect(formatSalary("1000", "2000", "USD")).toBe("$1k - $2k");
  });

  // --- non-numeric values ---
  it("passes through non-numeric values without currency symbol", () => {
    // NaN values bypass the formatting logic and return the raw string
    expect(formatSalary("competitive", null, "USD")).toBe("competitive+");
  });

  // --- no interval ---
  it("omits interval suffix when interval is null", () => {
    const result = formatSalary("80000", "120000", "USD", null);
    expect(result).toBe("$80k - $120k");
  });

  it("omits interval suffix when interval is undefined", () => {
    const result = formatSalary("80000", "120000", "USD", undefined);
    expect(result).toBe("$80k - $120k");
  });
});
