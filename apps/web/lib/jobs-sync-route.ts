import { z } from "zod";
import { SITE_CATEGORIES } from "@ever-hust/jobs-api";
import {
  buildSyncPlan,
  createDefaultSyncDeps,
  emptyCounters,
  MAX_RESULTS_PER_SOURCE,
  processUpstreamContract,
  readSyncEnv,
  runJobsSync,
  type RunSyncDeps,
  type SyncMode,
  type SyncProgress,
  type SyncSummary,
  type UpstreamContractTracker,
  type UpstreamStream,
} from "@ever-hust/triggers/ingest";
import { generateRequestId } from "./api-response";
import { verifyCronRequest } from "./cron-auth";

/**
 * `POST /api/jobs/sync` — the job-corpus sync endpoint (spec 01a FR-11).
 *
 * Called by the Trigger.dev schedules (keywords every 15 min, full every 6 h) or any external
 * scheduler. Guarded like every other cron endpoint by {@link verifyCronRequest}
 * (`apps/web/lib/cron-auth.ts`): `CRON_SECRET` as `Authorization: Bearer …` or `x-cron-secret`,
 * compared in constant time; when the secret is unset it FAILS CLOSED (503) in production and is
 * open only outside production (local development). Every call fans out to the whole Ever Jobs
 * source catalogue and writes the shared database.
 *
 * Response contract:
 * - **Non-2xx before streaming**: 401 (secret), 503 (no `CRON_SECRET` in production), 400 (body),
 *   409 (a run of the same mode is still in flight in this process), 502 (the first upstream
 *   stream could not be opened). Body:
 *   `{"type":"summary","ok":false,"error":…}`.
 * - **200 `application/x-ndjson`** otherwise: a `start` line, `progress` lines at least every
 *   `heartbeatMs` (so no proxy/header/body timeout fires on long runs), then exactly one final
 *   `summary` line with the counters. `ok` is never true when an upstream failed or a stream was
 *   truncated. A stream without a summary line must be treated as failed by the caller. The
 *   summary also says whether the upstream crawl was complete (`complete`, `stopReason`,
 *   `sourcesSkipped`, `sourcesFailed`; spec 01a D21): `ok: true, complete: false` is a partial
 *   crawl that was stored, not a failure.
 *
 * The run keeps going if the caller disconnects (the work — idempotent upserts — still lands and
 * the summary is logged), but never past its budget (the caller's `deadlineMs`, else
 * {@link MAX_SYNC_DEADLINE_MS}), and never twice at once for the same mode in this process: a
 * second request while one runs gets HTTP 409. A run still holding its slot
 * {@link STALE_RUN_GRACE_MS} after its deadline is treated as hung and no longer blocks its mode.
 */

/** Upper bound for the caller's budget (`deadlineMs`), and the budget of a run that sent none. */
export const MAX_SYNC_DEADLINE_MS = 2 * 60 * 60 * 1000;
/**
 * How long past its deadline a run may still hold its single-flight slot (the final flush and the
 * summary). After that the slot is stale: a hung run must not block its mode until the pod
 * restarts. Its late `release` is a no-op (the slot belongs to the next run by then).
 */
export const STALE_RUN_GRACE_MS = 10 * 60 * 1000;

export const syncRequestSchema = z
  .object({
    mode: z.enum(["keywords", "full"]).optional(),
    /** Keywords mode only; at most 5 are used. */
    searchTerms: z.array(z.string().max(200)).max(20).optional(),
    /** Per source, 1..1000 (spec 01a §7.2). */
    resultsWanted: z.number().int().positive().max(MAX_RESULTS_PER_SOURCE).optional(),
    /** Keywords mode only (full mode lists every source). */
    siteCategories: z.array(z.enum(SITE_CATEGORIES)).max(SITE_CATEGORIES.length).optional(),
    /**
     * The caller's budget: the run stops opening/reading Ever Jobs streams this many ms after the
     * request arrived (and reports what it got as `ok: false`, truncated). Default and maximum:
     * {@link MAX_SYNC_DEADLINE_MS}.
     */
    deadlineMs: z.number().int().min(1_000).max(MAX_SYNC_DEADLINE_MS).optional(),
  })
  .superRefine((body, ctx) => {
    if (body.mode !== "full") return;
    for (const field of ["searchTerms", "siteCategories"] as const) {
      if (body[field] !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [field],
          message: `${field} applies to keywords mode only; full mode lists every source`,
        });
      }
    }
  });

export type SyncRequestBody = z.infer<typeof syncRequestSchema>;

/** How long the route waits for the first upstream stream before committing to HTTP 200 (spec D8). */
export const DEFAULT_OPEN_GRACE_MS = 15_000;
/** Progress/heartbeat cadence on the route's own stream. */
export const DEFAULT_HEARTBEAT_MS = 10_000;

export interface JobsSyncRouteDeps {
  /**
   * The cron guard: `null` lets the request through, otherwise the refusal (401 / 503) whose
   * status the route answers with. Always {@link verifyCronRequest} in production.
   */
  authorize: (req: Request) => Response | null;
  /** Production wiring by default; tests inject fakes. */
  createRunDeps: (
    onProgress: (p: SyncProgress) => void,
    /** `deadlineAt`: the run's absolute deadline (epoch ms) — always set. */
    context: { mode: SyncMode; deadlineAt: number },
  ) => RunSyncDeps;
  openGraceMs: number;
  heartbeatMs: number;
  logger: Pick<Console, "error">;
  /**
   * What this process has seen of the Ever Jobs contract; gates full mode and the keyword
   * per-source count (spec 01a D18). Must be the tracker `createRunDeps` records into.
   */
  upstreamContract: UpstreamContractTracker;
  /** Runs in flight in this process, by mode (single-flight guard). */
  inFlight: Map<SyncMode, InFlightRun>;
}

export interface InFlightRun {
  startedAt: number;
  /** Past this (the run's deadline + {@link STALE_RUN_GRACE_MS}) the slot is stale. */
  expiresAt: number;
  token: symbol;
}

/** Process-wide: a slow Ever Jobs must not make scheduled runs pile up in the web pod. */
const IN_FLIGHT = new Map<SyncMode, InFlightRun>();

function positiveIntEnv(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

function defaultDeps(): JobsSyncRouteDeps {
  return {
    authorize: verifyCronRequest,
    createRunDeps: (onProgress, { mode, deadlineAt }) =>
      createDefaultSyncDeps({ onProgress, mode, deadlineAt }),
    openGraceMs: positiveIntEnv(process.env.JOBS_SYNC_OPEN_GRACE_MS, DEFAULT_OPEN_GRACE_MS),
    heartbeatMs: DEFAULT_HEARTBEAT_MS,
    logger: console,
    upstreamContract: processUpstreamContract,
    inFlight: IN_FLIGHT,
  };
}

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "private, no-cache, no-store, must-revalidate",
};

function failure(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify({ type: "summary", ok: false, ...body }), {
    status,
    headers: { ...JSON_HEADERS, "X-Request-Id": generateRequestId() },
  });
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * The guard's refusal in this route's own failure shape (spec 01a D10): same status, the guard's
 * `error` message, and nothing else from its body.
 */
async function refusal(denied: Response): Promise<Response> {
  let error = "Unauthorized";
  try {
    const body = (await denied.json()) as { error?: unknown };
    if (typeof body.error === "string" && body.error !== "") error = body.error;
  } catch {
    // keep the generic message
  }
  return failure(denied.status, { error });
}

async function readBody(req: Request): Promise<{ ok: true; body: SyncRequestBody } | { ok: false; error: string; details?: unknown }> {
  let text = "";
  try {
    text = await req.text();
  } catch {
    text = "";
  }
  if (text.trim() === "") return { ok: true, body: {} };
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, error: "Request body is not valid JSON" };
  }
  const parsed = syncRequestSchema.safeParse(json);
  if (!parsed.success) {
    return { ok: false, error: "Invalid sync request", details: parsed.error.flatten().fieldErrors };
  }
  return { ok: true, body: parsed.data };
}

export async function handleJobsSync(
  req: Request,
  overrides: Partial<JobsSyncRouteDeps> = {},
): Promise<Response> {
  const deps = { ...defaultDeps(), ...overrides };

  // The shared cron guard: constant-time comparison, fail closed without CRON_SECRET in production.
  const denied = deps.authorize(req);
  if (denied) return refusal(denied);

  const parsed = await readBody(req);
  if (!parsed.ok) {
    return failure(400, { error: parsed.error, ...(parsed.details ? { details: parsed.details } : {}) });
  }
  const receivedAt = Date.now();
  // Every run has a budget: the caller's, else the ceiling (a run without one used to be bounded
  // only by the per-stream timeout times the number of terms).
  const deadlineAt = receivedAt + (parsed.body.deadlineMs ?? MAX_SYNC_DEADLINE_MS);

  const plan = buildSyncPlan(
    {
      mode: parsed.body.mode,
      searchTerms: parsed.body.searchTerms,
      resultsWanted: parsed.body.resultsWanted,
      siteCategories: parsed.body.siteCategories,
    },
    readSyncEnv(),
    Date.now(),
    deps.upstreamContract.current,
  );

  // Single flight per mode: the previous run may outlive its caller (up to its deadline).
  const running = deps.inFlight.get(plan.mode);
  if (running && running.expiresAt > receivedAt) {
    return failure(409, {
      mode: plan.mode,
      terms: plan.terms,
      error: `a ${plan.mode} sync is already running in this process (since ${new Date(running.startedAt).toISOString()})`,
    });
  }
  if (running) {
    deps.logger.error(
      `[api/jobs/sync] the ${plan.mode} sync started ${new Date(running.startedAt).toISOString()} is still unfinished ${STALE_RUN_GRACE_MS / 60_000} min past its deadline; treating it as hung and starting a new run`,
    );
  }
  const token = Symbol(plan.mode);
  deps.inFlight.set(plan.mode, { startedAt: receivedAt, expiresAt: deadlineAt + STALE_RUN_GRACE_MS, token });
  const release = () => {
    if (deps.inFlight.get(plan.mode)?.token === token) deps.inFlight.delete(plan.mode);
  };

  try {
    return await startSync(plan, deadlineAt, deps, release);
  } catch (err) {
    release();
    throw err;
  }
}

/** Everything after validation; `release` frees the single-flight slot when the run is over. */
async function startSync(
  plan: ReturnType<typeof buildSyncPlan>,
  deadlineAt: number,
  deps: JobsSyncRouteDeps,
  release: () => void,
): Promise<Response> {
  let latest: SyncProgress = { ...emptyCounters() };
  const runDeps = deps.createRunDeps(
    (p) => {
      latest = p;
    },
    { mode: plan.mode, deadlineAt },
  );

  // Nothing to run (full mode gated off, spec D18): a normal stream with an ok, skipped summary.
  if (plan.inputs.length === 0) {
    try {
      const summary = await runJobsSync(plan, runDeps);
      return ndjsonResponse([
        { type: "start", mode: plan.mode, terms: plan.terms, startedAt: new Date().toISOString() },
        { type: "summary", ...summary },
      ]);
    } finally {
      release();
    }
  }

  // Open the first upstream stream before committing to 200, so a refused upstream is a non-2xx
  // (spec D8). A pre-contract server only answers after its whole scrape, so the wait is bounded.
  const firstOpen: Promise<UpstreamStream> = runDeps.openStream(plan.inputs[0]!, 0);
  firstOpen.catch(() => undefined); // observed below; never an unhandled rejection
  let graceTimer: ReturnType<typeof setTimeout> | undefined;
  const early = await Promise.race([
    firstOpen.then(
      () => ({ state: "open" as const }),
      (err: unknown) => ({ state: "failed" as const, err }),
    ),
    new Promise<{ state: "pending" }>((resolve) => {
      graceTimer = setTimeout(() => resolve({ state: "pending" }), deps.openGraceMs);
    }),
  ]);
  clearTimeout(graceTimer);
  if (early.state === "failed") {
    release();
    deps.logger.error(`[api/jobs/sync] upstream open failed: ${messageOf(early.err)}`);
    return failure(502, {
      mode: plan.mode,
      terms: plan.terms,
      error: `Ever Jobs request failed: ${messageOf(early.err)}`,
    });
  }

  const openStream: RunSyncDeps["openStream"] = (input, index) =>
    index === 0 ? firstOpen : runDeps.openStream(input, index);

  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      let open = true;
      const write = (line: Record<string, unknown>) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(line)}\n`));
        } catch {
          open = false; // the caller went away; the run continues
        }
      };
      const finish = () => {
        if (!open) return;
        open = false;
        try {
          controller.close();
        } catch {
          // already closed / cancelled
        }
      };

      write({ type: "start", mode: plan.mode, terms: plan.terms, startedAt: new Date().toISOString() });
      const heartbeat = setInterval(() => write({ type: "progress", ...latest }), deps.heartbeatMs);

      runJobsSync(plan, { ...runDeps, openStream })
        .then((summary: SyncSummary) => write({ type: "summary", ...summary }))
        .catch((err: unknown) => {
          deps.logger.error(`[api/jobs/sync] sync crashed: ${messageOf(err)}`);
          write({
            type: "summary",
            ok: false,
            mode: plan.mode,
            terms: plan.terms,
            ...latest,
            complete: false,
            stopReason: "crashed",
            error: messageOf(err),
          });
        })
        .finally(() => {
          clearInterval(heartbeat);
          release();
          finish();
        });
    },
  });

  return new Response(body, { status: 200, headers: ndjsonHeaders() });
}

function ndjsonHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/x-ndjson; charset=utf-8",
    // no-transform: keeps the gzip middleware from buffering the heartbeat lines.
    "Cache-Control": "no-store, no-transform",
    "X-Accel-Buffering": "no",
    "X-Request-Id": generateRequestId(),
  };
}

function ndjsonResponse(lines: Array<Record<string, unknown>>): Response {
  return new Response(lines.map((l) => `${JSON.stringify(l)}\n`).join(""), {
    status: 200,
    headers: ndjsonHeaders(),
  });
}
