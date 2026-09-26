/**
 * Long-timeout HTTP dispatcher for streaming requests.
 *
 * Node's global `fetch` is undici, whose default `headersTimeout` and `bodyTimeout` are 300 s.
 * A streaming search keeps the body alive with heartbeat lines, but a server that predates the
 * NDJSON contract only sends headers after its whole scrape, and a full list-mode scrape can take
 * longer than that. So streaming requests get a dispatcher with raised timeouts.
 *
 * The dispatcher is built from **Node's bundled undici** `Agent` — the class behind the global
 * dispatcher that undici publishes under `Symbol.for("undici.globalDispatcher.1")` (the same
 * cross-version handshake the `undici` npm package uses to share a dispatcher with Node's `fetch`).
 * That keeps the dispatcher version-compatible with the global `fetch` by construction and adds no
 * dependency to the lockfile or the Next.js / Trigger.dev bundles. When the class cannot be
 * resolved (a non-Node runtime, a custom global dispatcher), `undefined` is returned and the
 * request simply runs with the default timeouts.
 */

export const UNDICI_GLOBAL_DISPATCHER = Symbol.for("undici.globalDispatcher.1");

type AgentCtor = new (options: Record<string, unknown>) => unknown;

export function createLongTimeoutDispatcher(
  timeoutMs: number,
  scope: Record<PropertyKey, unknown> = globalThis as unknown as Record<PropertyKey, unknown>,
): unknown | undefined {
  try {
    // Node loads its bundled undici lazily; constructing a Headers instance initialises it and
    // installs the default global dispatcher.
    if (scope[UNDICI_GLOBAL_DISPATCHER] === undefined && typeof Headers === "function") {
      void new Headers();
    }
    const current = scope[UNDICI_GLOBAL_DISPATCHER] as { constructor?: unknown } | undefined;
    const Ctor = current?.constructor as AgentCtor | undefined;
    if (typeof Ctor !== "function" || Ctor.name !== "Agent") return undefined;
    return new Ctor({
      headersTimeout: timeoutMs,
      bodyTimeout: timeoutMs,
    });
  } catch {
    return undefined;
  }
}

/**
 * The timeouts a long-timeout Agent is built with. A request's timeout is rounded UP to the next
 * one, so the process holds at most one Agent per bucket, whatever timeouts its callers pass: the
 * sync opens every Ever Jobs stream with the time left before its deadline, a different value
 * almost every time, and one Agent per exact value was never evicted or closed (PR #106 review).
 *
 * Rounding up is safe: `headersTimeout` / `bodyTimeout` are the dispatcher's idle bounds (time to
 * the headers, time between two body chunks); a request's own overall timeout is its abort signal
 * (`openSearchStream`'s timer, `AbortSignal.timeout` in the route client), which is unchanged. A
 * timeout above the largest bucket gets the largest: 24 h without a single byte is no stream.
 */
export const LONG_TIMEOUT_BUCKETS_MS: readonly number[] = [
  5 * 60_000,
  10 * 60_000,
  30 * 60_000,
  60 * 60_000,
  2 * 60 * 60_000,
  6 * 60 * 60_000,
  24 * 60 * 60_000,
];

/** The bucket a request timeout is served by: the smallest bucket at least as long. */
export function longTimeoutBucketMs(timeoutMs: number): number {
  const largest = LONG_TIMEOUT_BUCKETS_MS[LONG_TIMEOUT_BUCKETS_MS.length - 1]!;
  if (Number.isNaN(timeoutMs)) return largest;
  return LONG_TIMEOUT_BUCKETS_MS.find((bucket) => bucket >= timeoutMs) ?? largest;
}

/** A memo of long-timeout Agents, one per {@link LONG_TIMEOUT_BUCKETS_MS} bucket. */
export interface LongTimeoutDispatcherCache {
  get(timeoutMs: number): unknown | undefined;
  /** Agents (or `undefined` answers) held: never more than the number of buckets. */
  readonly size: number;
}

export function createLongTimeoutDispatcherCache(
  scope?: Record<PropertyKey, unknown>,
): LongTimeoutDispatcherCache {
  const agents = new Map<number, unknown>();
  return {
    get(timeoutMs) {
      const bucket = longTimeoutBucketMs(timeoutMs);
      if (!agents.has(bucket)) agents.set(bucket, createLongTimeoutDispatcher(bucket, scope));
      return agents.get(bucket);
    },
    get size() {
      return agents.size;
    },
  };
}

const processCache = createLongTimeoutDispatcherCache();

/**
 * Process-wide memoised variant: the Agent of `timeoutMs`'s bucket (see
 * {@link LONG_TIMEOUT_BUCKETS_MS}), whose timeouts are at least `timeoutMs`.
 */
export function getLongTimeoutDispatcher(timeoutMs: number): unknown | undefined {
  return processCache.get(timeoutMs);
}

/** How many Agents the process-wide memo holds (at most `LONG_TIMEOUT_BUCKETS_MS.length`). */
export function longTimeoutDispatcherCount(): number {
  return processCache.size;
}
