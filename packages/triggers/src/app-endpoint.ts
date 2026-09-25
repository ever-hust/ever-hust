/**
 * Trigger-side helper: call one of the app's own CRON_SECRET-guarded endpoints.
 *
 * The Trigger.dev environment carries only `CRON_SECRET` and `NEXT_PUBLIC_APP_URL` (the in-cluster
 * app URL). Every task that needs the database, email, or AI keys therefore POSTs to the app and
 * lets the work run in the app runtime — the same pattern as `inbox-sync` and `sync-jobs-schedule`.
 *
 * Contract: any non-2xx response, network error or timeout THROWS, so the Trigger run is marked
 * FAILED (and retried per the task's retry policy) instead of completing silently.
 */

/** Used when a task does not pass its own timeout. */
export const DEFAULT_APP_ENDPOINT_TIMEOUT_MS = 120_000;

/**
 * Upper bound for any call. Node's global fetch (undici) gives up on a response whose headers take
 * longer than 300 s regardless of our AbortSignal, so a longer timeout would be a lie. App-side work
 * budgets (240 s by default) stay below this.
 */
export const MAX_APP_ENDPOINT_TIMEOUT_MS = 290_000;

const DETAIL_LIMIT = 500;

export class AppEndpointError extends Error {
  /** HTTP status, or null when no response arrived (network error / timeout). */
  readonly status: number | null;
  readonly path: string;

  constructor(message: string, path: string, status: number | null) {
    super(message);
    this.name = "AppEndpointError";
    this.path = path;
    this.status = status;
  }
}

export interface CallAppEndpointOptions {
  timeoutMs?: number;
  /** Injection points for tests. */
  fetchImpl?: typeof fetch;
  env?: Record<string, string | undefined>;
}

function truncate(text: string, limit = DETAIL_LIMIT): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length > limit ? `${oneLine.slice(0, limit)}…` : oneLine;
}

/** Base URL of the app, without a trailing slash. */
export function appBaseUrl(env: Record<string, string | undefined> = process.env): string {
  return (env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:8443").replace(/\/+$/, "");
}

/**
 * POST `body` as JSON to `${NEXT_PUBLIC_APP_URL}${path}` with `Authorization: Bearer CRON_SECRET`
 * and return the parsed JSON response. Throws {@link AppEndpointError} on anything but a 2xx.
 */
export async function callAppEndpoint<T = unknown>(
  path: string,
  body: unknown = {},
  options: CallAppEndpointOptions = {},
): Promise<T> {
  if (!path.startsWith("/")) throw new Error(`callAppEndpoint: path must start with "/" (got "${path}")`);
  const env = options.env ?? process.env;
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = Math.min(
    Math.max(options.timeoutMs ?? DEFAULT_APP_ENDPOINT_TIMEOUT_MS, 1_000),
    MAX_APP_ENDPOINT_TIMEOUT_MS,
  );
  const secret = env.CRON_SECRET?.trim();
  if (!secret) {
    // The app decides: open in local dev, 503 (fail closed) in production.
    console.warn(`[app-endpoint] CRON_SECRET is not set; calling ${path} without credentials.`);
  }

  const url = `${appBaseUrl(env)}${path}`;
  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
      },
      body: JSON.stringify(body ?? {}),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    const message =
      name === "TimeoutError" || name === "AbortError"
        ? `POST ${path} timed out after ${timeoutMs} ms (${url})`
        : `POST ${path} failed before a response (${url}): ${err instanceof Error ? err.message : String(err)}`;
    throw new AppEndpointError(message, path, null);
  }

  const text = await res.text().catch(() => "");
  if (!res.ok) {
    const detail = text ? ` — ${truncate(text)}` : "";
    throw new AppEndpointError(`POST ${path} failed: HTTP ${res.status}${detail}`, path, res.status);
  }
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new AppEndpointError(
      `POST ${path} returned HTTP ${res.status} with a non-JSON body: ${truncate(text, 200)}`,
      path,
      res.status,
    );
  }
}
