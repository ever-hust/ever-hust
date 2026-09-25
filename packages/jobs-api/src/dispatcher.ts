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

const cache = new Map<number, unknown>();

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

/** Process-wide memoised variant (one Agent per timeout value). */
export function getLongTimeoutDispatcher(timeoutMs: number): unknown | undefined {
  if (!cache.has(timeoutMs)) cache.set(timeoutMs, createLongTimeoutDispatcher(timeoutMs));
  return cache.get(timeoutMs);
}
