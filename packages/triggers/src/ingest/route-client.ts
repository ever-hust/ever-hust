import {
  getLongTimeoutDispatcher,
  isNdjsonContentType,
  parseNdjsonObject,
  readNdjsonLines,
} from "@ever-hust/jobs-api";
import type { SyncMode } from "./config";
import type { SyncSummary } from "./run-sync";

/**
 * Trigger-side client of `POST /api/jobs/sync` (spec 01a FR-12).
 *
 * The sync itself runs in the app's runtime (which can reach an internal Ever Jobs service); the
 * scheduled task only calls the route, reads its NDJSON progress stream and returns the summary.
 * It THROWS whenever the run did not succeed, so a failure shows as a FAILED run:
 *   - non-2xx before streaming (401/400/502…),
 *   - a summary line with `ok: false`,
 *   - a stream that ends without a summary line (truncated),
 *   - a transport error / timeout.
 * A run that is `ok` on a PARTIAL upstream crawl (`complete: false`, spec 01a D21) is returned, not
 * thrown: what arrived is stored; the caller logs a warning.
 */

export class SyncRunFailedError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    /** The route's summary (or error body) when one was received. */
    public readonly summary?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "SyncRunFailedError";
  }
}

export interface RouteSyncOptions {
  mode: SyncMode;
  /** App base URL (default NEXT_PUBLIC_APP_URL, else http://localhost:8443). */
  baseUrl?: string;
  /** Bearer secret (default CRON_SECRET). */
  secret?: string;
  /**
   * Overall budget for the call; keep it below the task's maxDuration. The route is told a
   * slightly shorter budget (`deadlineMs`) so it stops Ever Jobs and sends its summary in time.
   */
  timeoutMs: number;
  /** Extra body fields (e.g. `searchTerms`). */
  body?: Record<string, unknown>;
  fetchImpl?: typeof fetch;
  /** Undici dispatcher; default a long-timeout Agent. `null` = global dispatcher. */
  dispatcher?: unknown | null;
  /** Every parsed non-summary line (start / progress / future types). */
  onLine?: (line: Record<string, unknown>) => void;
}

export type RouteSyncResult = SyncSummary & { legacyRoute?: boolean };

/** Headroom between the route's deadline and the caller's own timeout (flush + summary). */
export const ROUTE_DEADLINE_MARGIN_MS = 20_000;

/** The `deadlineMs` sent to the route for a call budget of `timeoutMs` (1 s .. 2 h). */
export function routeDeadlineMs(timeoutMs: number): number {
  return Math.min(Math.max(1_000, timeoutMs - ROUTE_DEADLINE_MARGIN_MS), 2 * 60 * 60 * 1000);
}

function summarise(summary: Record<string, unknown>): string {
  const pick = [
    "mode",
    "received",
    "inserted",
    "updated",
    "unchanged",
    "invalid",
    "duplicatesMerged",
    "mergedWrites",
    "errors",
    "truncated",
    "upstreamFailed",
    "complete",
    "stopReason",
  ];
  const parts = pick.filter((k) => k in summary).map((k) => `${k}=${String(summary[k])}`);
  const messages = Array.isArray(summary.errorMessages) ? summary.errorMessages.slice(0, 3) : [];
  const error = typeof summary.error === "string" ? [summary.error] : [];
  return [parts.join(" "), ...error, ...messages.map(String)].filter(Boolean).join(" | ");
}

export async function runSyncViaRoute(options: RouteSyncOptions): Promise<RouteSyncResult> {
  const base = (options.baseUrl ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:8443").replace(
    /\/+$/,
    "",
  );
  const secret = options.secret ?? process.env.CRON_SECRET;
  const fetchImpl = options.fetchImpl ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const dispatcher =
    options.dispatcher === null
      ? undefined
      : (options.dispatcher ?? getLongTimeoutDispatcher(options.timeoutMs));

  let res: Response;
  try {
    res = await fetchImpl(`${base}/api/jobs/sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/x-ndjson, application/json;q=0.9",
        // Never let a compression layer buffer the progress stream.
        "Accept-Encoding": "identity",
        ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
      },
      body: JSON.stringify({ deadlineMs: routeDeadlineMs(options.timeoutMs), ...options.body, mode: options.mode }),
      signal: AbortSignal.timeout(options.timeoutMs),
      ...(dispatcher ? { dispatcher } : {}),
    } as RequestInit);
  } catch (err) {
    throw new SyncRunFailedError(
      `sync route request failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const parsed = parseNdjsonObject(text.trim());
    throw new SyncRunFailedError(
      `sync route answered HTTP ${res.status}${parsed ? `: ${summarise(parsed)}` : text ? `: ${text.slice(0, 300)}` : ""}`,
      res.status,
      parsed,
    );
  }

  // An app that predates the streaming route answers one JSON document
  // ({ searchTerms, totalUpserted, errors? }) — accept it, but fail on reported errors.
  if (!isNdjsonContentType(res.headers.get("content-type"))) {
    const body = (await res.json().catch(() => undefined)) as
      | { searchTerms?: string[]; totalUpserted?: number; errors?: string[] }
      | undefined;
    if (!body) throw new SyncRunFailedError("sync route returned an unreadable body", res.status);
    const errors = Array.isArray(body.errors) ? body.errors : [];
    const legacy: RouteSyncResult = {
      ok: errors.length === 0,
      legacyRoute: true,
      mode: options.mode,
      terms: body.searchTerms ?? [],
      received: body.totalUpserted ?? 0,
      inserted: 0,
      updated: 0,
      unchanged: 0,
      invalid: 0,
      duplicatesMerged: 0,
      mergedWrites: 0,
      geocodeCalls: 0,
      geocodeReused: 0,
      errors: errors.length,
      durationMs: 0,
      truncated: false,
      upstreamFailed: errors.length > 0,
      legacyServer: false,
      upstreamTotal: 0,
      // That route never reported crawl completeness.
      complete: false,
      stopReason: "not_reported",
      sourcesSkipped: 0,
      sourcesFailed: 0,
      errorMessages: errors.slice(0, 25),
    };
    if (!legacy.ok) {
      throw new SyncRunFailedError(
        `sync failed (legacy route): ${errors.slice(0, 3).join(" | ")}`,
        res.status,
        { ...legacy },
      );
    }
    return legacy;
  }

  let summary: Record<string, unknown> | undefined;
  try {
    if (!res.body) throw new Error("empty body");
    for await (const line of readNdjsonLines(res.body)) {
      const obj = parseNdjsonObject(line);
      if (!obj) continue;
      if (obj.type === "summary") {
        summary = obj;
        continue;
      }
      try {
        options.onLine?.(obj);
      } catch {
        // logging must never fail the run
      }
    }
  } catch (err) {
    throw new SyncRunFailedError(
      `sync route stream broke${summary ? " after the summary" : ""}: ${err instanceof Error ? err.message : String(err)}`,
      res.status,
      summary,
    );
  }

  if (!summary) {
    throw new SyncRunFailedError(
      "sync route stream ended without a summary line (truncated)",
      res.status,
    );
  }
  if (summary.ok !== true) {
    throw new SyncRunFailedError(`sync failed: ${summarise(summary)}`, res.status, summary);
  }
  const result: Record<string, unknown> = { ...summary, ...completenessOf(summary) };
  delete result.type;
  return result as unknown as RouteSyncResult;
}

/**
 * The summary's crawl completeness (spec 01a D21), normalised: only `complete === true` is
 * complete. A summary without the fields (an app that predates them) is "not known complete".
 * A partial crawl is NOT a failure: the caller logs it and returns it, it does not throw.
 */
export function completenessOf(
  summary: Record<string, unknown>,
): Pick<SyncSummary, "complete" | "stopReason" | "sourcesSkipped" | "sourcesFailed"> {
  const complete = summary.complete === true;
  const reason = typeof summary.stopReason === "string" && summary.stopReason.trim() !== "" ? summary.stopReason : null;
  const count = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : 0);
  return {
    complete,
    stopReason: complete ? null : (reason ?? "not_reported"),
    sourcesSkipped: count(summary.sourcesSkipped),
    sourcesFailed: count(summary.sourcesFailed),
  };
}
