import { describe, it, expect } from "@jest/globals";
import {
  createLongTimeoutDispatcherCache,
  getLongTimeoutDispatcher,
  LONG_TIMEOUT_BUCKETS_MS,
  longTimeoutBucketMs,
  longTimeoutDispatcherCount,
  UNDICI_GLOBAL_DISPATCHER,
} from "./dispatcher";

// A stand-in for undici's Agent: records its options, counts instances.
class Agent {
  static created = 0;
  constructor(public readonly options: { headersTimeout: number; bodyTimeout: number }) {
    Agent.created++;
  }
}
const fakeScope = () => ({ [UNDICI_GLOBAL_DISPATCHER]: new Agent({ headersTimeout: 0, bodyTimeout: 0 }) }) as Record<PropertyKey, unknown>;

/** What the sync passes: the time left before its deadline, a different value on every open. */
const deadlineTimeouts = (n: number) => Array.from({ length: n }, (_, i) => 1 + i * 7_919);

describe("long-timeout dispatcher buckets (PR #106 review)", () => {
  it("rounds a timeout UP to the smallest bucket at least as long", () => {
    expect(longTimeoutBucketMs(1)).toBe(5 * 60_000);
    expect(longTimeoutBucketMs(5 * 60_000)).toBe(5 * 60_000);
    expect(longTimeoutBucketMs(5 * 60_000 + 1)).toBe(10 * 60_000);
    expect(longTimeoutBucketMs(570_000)).toBe(10 * 60_000); // the keyword task's route call
    expect(longTimeoutBucketMs(1_800_000)).toBe(30 * 60_000); // DEFAULT_STREAM_TIMEOUT_MS
    expect(longTimeoutBucketMs(3_570_000)).toBe(60 * 60_000); // the full task's route call
    expect(longTimeoutBucketMs(0)).toBe(5 * 60_000);
    // Above the largest bucket, or not a number: the largest (a 24 h idle bound).
    expect(longTimeoutBucketMs(48 * 60 * 60_000)).toBe(24 * 60 * 60_000);
    expect(longTimeoutBucketMs(Number.POSITIVE_INFINITY)).toBe(24 * 60 * 60_000);
    expect(longTimeoutBucketMs(Number.NaN)).toBe(24 * 60 * 60_000);
    // Every timeout up to the largest bucket gets idle bounds at least as long as itself.
    for (const t of deadlineTimeouts(2_000)) expect(longTimeoutBucketMs(t)).toBeGreaterThanOrEqual(t);
  });

  it("holds one Agent per bucket, whatever distinct timeouts the callers pass", () => {
    Agent.created = 0;
    const cache = createLongTimeoutDispatcherCache(fakeScope());
    const created0 = Agent.created;
    const seen = new Set<unknown>();
    const timeouts = [...deadlineTimeouts(5_000), 3 * 24 * 60 * 60_000];
    for (const t of timeouts) {
      const agent = cache.get(t) as Agent;
      expect(agent).toBeInstanceOf(Agent);
      expect(agent.options.headersTimeout).toBeGreaterThanOrEqual(Math.min(t, 24 * 60 * 60_000));
      expect(agent.options.bodyTimeout).toBe(agent.options.headersTimeout);
      seen.add(agent);
    }
    // 5 001 distinct timeouts spanning every bucket: exactly one Agent per bucket, none more.
    expect(cache.size).toBe(LONG_TIMEOUT_BUCKETS_MS.length);
    expect(seen.size).toBe(LONG_TIMEOUT_BUCKETS_MS.length);
    expect(Agent.created - created0).toBe(LONG_TIMEOUT_BUCKETS_MS.length);
    // The same bucket answers with the same Agent.
    expect(cache.get(570_000)).toBe(cache.get(420_000));
  });

  it("the process-wide memo stays within the bucket count too (Node's own undici)", () => {
    for (const t of deadlineTimeouts(3_000)) getLongTimeoutDispatcher(t);
    getLongTimeoutDispatcher(10 * 24 * 60 * 60_000);
    expect(longTimeoutDispatcherCount()).toBeLessThanOrEqual(LONG_TIMEOUT_BUCKETS_MS.length);
    expect(longTimeoutDispatcherCount()).toBeGreaterThan(0);
  });
});
