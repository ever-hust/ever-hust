import {
  MAX_AI_STEPS_PER_TURN,
  AI_STREAM_MAX_DURATION_SECONDS,
  MAX_CHAT_PAYLOAD_CHARS,
  MAX_SINGLE_MESSAGE_CHARS,
  MAX_MESSAGES_PER_REQUEST,
  MAX_COMPARE_JOBS,
  FREE_TIER_DAILY_MESSAGES,
  FREE_TIER_DAILY_SEARCHES,
  FREE_TIER_WEEKLY_COVER_LETTERS,
  ONE_DAY_MS,
  ONE_WEEK_MS,
} from "../constants";

describe("AI / Chat constants", () => {
  it("MAX_AI_STEPS_PER_TURN is a positive integer", () => {
    expect(MAX_AI_STEPS_PER_TURN).toBeGreaterThan(0);
    expect(Number.isInteger(MAX_AI_STEPS_PER_TURN)).toBe(true);
  });

  it("AI_STREAM_MAX_DURATION_SECONDS is a positive number", () => {
    expect(AI_STREAM_MAX_DURATION_SECONDS).toBeGreaterThan(0);
  });

  it("MAX_CHAT_PAYLOAD_CHARS is greater than zero", () => {
    expect(MAX_CHAT_PAYLOAD_CHARS).toBeGreaterThan(0);
  });

  it("MAX_SINGLE_MESSAGE_CHARS is a positive number", () => {
    expect(MAX_SINGLE_MESSAGE_CHARS).toBeGreaterThan(0);
  });

  it("MAX_SINGLE_MESSAGE_CHARS is less than MAX_CHAT_PAYLOAD_CHARS", () => {
    expect(MAX_SINGLE_MESSAGE_CHARS).toBeLessThan(MAX_CHAT_PAYLOAD_CHARS);
  });

  it("MAX_MESSAGES_PER_REQUEST is a positive integer", () => {
    expect(MAX_MESSAGES_PER_REQUEST).toBeGreaterThan(0);
    expect(Number.isInteger(MAX_MESSAGES_PER_REQUEST)).toBe(true);
  });

  it("AI_STREAM_MAX_DURATION_SECONDS is reasonable for a serverless function (10-300s)", () => {
    expect(AI_STREAM_MAX_DURATION_SECONDS).toBeGreaterThanOrEqual(10);
    expect(AI_STREAM_MAX_DURATION_SECONDS).toBeLessThanOrEqual(300);
  });
});

describe("Jobs Canvas constants", () => {
  it("MAX_COMPARE_JOBS is at least 2", () => {
    expect(MAX_COMPARE_JOBS).toBeGreaterThanOrEqual(2);
  });

  it("MAX_COMPARE_JOBS is a positive integer", () => {
    expect(Number.isInteger(MAX_COMPARE_JOBS)).toBe(true);
  });
});

describe("Free-Tier Limits", () => {
  it("FREE_TIER_DAILY_MESSAGES is greater than zero", () => {
    expect(FREE_TIER_DAILY_MESSAGES).toBeGreaterThan(0);
  });

  it("FREE_TIER_DAILY_SEARCHES is greater than zero", () => {
    expect(FREE_TIER_DAILY_SEARCHES).toBeGreaterThan(0);
  });

  it("FREE_TIER_WEEKLY_COVER_LETTERS is greater than zero", () => {
    expect(FREE_TIER_WEEKLY_COVER_LETTERS).toBeGreaterThan(0);
  });

  it("all free-tier limits are positive integers", () => {
    expect(Number.isInteger(FREE_TIER_DAILY_MESSAGES)).toBe(true);
    expect(Number.isInteger(FREE_TIER_DAILY_SEARCHES)).toBe(true);
    expect(Number.isInteger(FREE_TIER_WEEKLY_COVER_LETTERS)).toBe(true);
  });

  it("daily messages limit is higher than daily searches limit", () => {
    // Users should be able to send more chat messages than search queries per day
    expect(FREE_TIER_DAILY_MESSAGES).toBeGreaterThanOrEqual(
      FREE_TIER_DAILY_SEARCHES,
    );
  });

  it("free-tier limits are restrictive enough to encourage upgrades", () => {
    // All free-tier limits should be under 100 per period
    expect(FREE_TIER_DAILY_MESSAGES).toBeLessThanOrEqual(100);
    expect(FREE_TIER_DAILY_SEARCHES).toBeLessThanOrEqual(100);
    expect(FREE_TIER_WEEKLY_COVER_LETTERS).toBeLessThanOrEqual(100);
  });
});

describe("Time constants", () => {
  it("ONE_DAY_MS is exactly 86,400,000 ms", () => {
    expect(ONE_DAY_MS).toBe(86_400_000);
  });

  it("ONE_WEEK_MS is exactly 7 days", () => {
    expect(ONE_WEEK_MS).toBe(7 * ONE_DAY_MS);
    expect(ONE_WEEK_MS).toBe(604_800_000);
  });
});

describe("constant snapshot values", () => {
  it("matches expected current values", () => {
    // Snapshot test to catch unintentional changes to critical constants
    expect({
      MAX_AI_STEPS_PER_TURN,
      AI_STREAM_MAX_DURATION_SECONDS,
      MAX_CHAT_PAYLOAD_CHARS,
      MAX_SINGLE_MESSAGE_CHARS,
      MAX_MESSAGES_PER_REQUEST,
      MAX_COMPARE_JOBS,
      FREE_TIER_DAILY_MESSAGES,
      FREE_TIER_DAILY_SEARCHES,
      FREE_TIER_WEEKLY_COVER_LETTERS,
    }).toEqual({
      MAX_AI_STEPS_PER_TURN: 5,
      AI_STREAM_MAX_DURATION_SECONDS: 60,
      MAX_CHAT_PAYLOAD_CHARS: 500_000,
      MAX_SINGLE_MESSAGE_CHARS: 50_000,
      MAX_MESSAGES_PER_REQUEST: 100,
      MAX_COMPARE_JOBS: 3,
      FREE_TIER_DAILY_MESSAGES: 10,
      FREE_TIER_DAILY_SEARCHES: 5,
      FREE_TIER_WEEKLY_COVER_LETTERS: 1,
    });
  });
});
