/**
 * The job-sync Trigger tasks (spec 01a D33): one shared queue, TTLs, late keyword ticks skipped,
 * and one full-sync schedule per environment at staggered hours. The SDK is mocked so `task()` /
 * `schedules.task()` / `queue()` hand back their config.
 */
jest.mock("@trigger.dev/sdk", () => ({
  task: (config: unknown) => config,
  schedules: { task: (config: unknown) => config },
  queue: (options: unknown) => options,
  logger: { info: jest.fn(), warn: jest.fn() },
}));

import { logger } from "@trigger.dev/sdk";
import {
  syncJobsFullSchedule,
  syncJobsFullScheduleDev,
  syncJobsFullScheduleStage,
  syncJobsQueue,
  syncJobsSchedule,
  syncJobsTask,
} from "./sync-jobs";
import {
  environmentSkip,
  FULL_SYNC_SCHEDULES,
  KEYWORD_TICK_MAX_LATENESS_MS,
  lateTickSkip,
  SYNC_JOBS_QUEUE,
} from "./sync-runner";

interface TaskConfig {
  id: string;
  cron?: string | { pattern: string; environments?: string[] };
  queue?: { name: string; concurrencyLimit?: number };
  ttl?: string | number;
  maxDuration?: number;
  retry?: { maxAttempts?: number };
  run: (payload: unknown, params: { ctx: { environment?: { type: string } } }) => Promise<unknown>;
}
const asConfig = (t: unknown) => t as TaskConfig;

const enc = new TextEncoder();
const OK_FULL = {
  type: "summary",
  ok: true,
  mode: "full",
  terms: [],
  received: 1,
  inserted: 1,
  updated: 0,
  unchanged: 0,
  invalid: 0,
  duplicatesMerged: 0,
  geocodeCalls: 0,
  geocodeReused: 0,
  errors: 0,
  durationMs: 1,
  truncated: false,
  upstreamFailed: false,
  legacyServer: false,
  upstreamTotal: 1,
  complete: true,
  stopReason: null,
  sourcesSkipped: 0,
  sourcesFailed: 0,
  errorMessages: [],
};

let fetchMock: jest.Mock;
const originalFetch = global.fetch;
const savedEnv = { ...process.env };
beforeEach(() => {
  process.env.NEXT_PUBLIC_APP_URL = "http://hust-web.hust-test.svc.cluster.local:3000";
  process.env.CRON_SECRET = "test-secret";
  delete process.env.SCHEDULER;
  fetchMock = jest.fn(async (_url: string, init: RequestInit) => {
    const mode = JSON.parse(String(init.body)).mode as string;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(enc.encode(`${JSON.stringify({ ...OK_FULL, mode })}\n`));
        controller.close();
      },
    });
    return new Response(body, { status: 200, headers: { "content-type": "application/x-ndjson" } });
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  (logger.warn as jest.Mock).mockClear();
});
afterEach(() => {
  global.fetch = originalFetch;
  process.env = { ...savedEnv };
});

const ALL = [syncJobsTask, syncJobsSchedule, syncJobsFullSchedule, syncJobsFullScheduleStage, syncJobsFullScheduleDev].map(asConfig);
const FULLS = [syncJobsFullSchedule, syncJobsFullScheduleStage, syncJobsFullScheduleDev].map(asConfig);

/** The hours a `M H * * *` cron fires at (enough of cron for these schedules: `*`, `*\/n`, `a-b/n`, a list). */
function hoursOf(cron: string): number[] {
  const [minute, hour, ...rest] = cron.split(" ");
  expect(minute).toBe("20");
  expect(rest).toEqual(["*", "*", "*"]);
  const out: number[] = [];
  for (const part of hour!.split(",")) {
    const [range, step = "1"] = part.split("/");
    const [lo, hi] = range === "*" ? [0, 23] : range!.includes("-") ? range!.split("-").map(Number) : [Number(range), Number(range)];
    for (let h = lo!; h <= hi!; h += Number(step)) out.push(h);
  }
  return out;
}

describe("one queue for every job sync (H-4)", () => {
  it("every sync task runs on the shared concurrency-1 queue, none on a per-mode one", () => {
    expect(syncJobsQueue).toEqual({ name: SYNC_JOBS_QUEUE, concurrencyLimit: 1 });
    expect(SYNC_JOBS_QUEUE).toBe("sync-jobs");
    for (const t of ALL) expect(t.queue).toBe(syncJobsQueue);
    const names = new Set(ALL.map((t) => t.queue?.name));
    expect([...names]).toEqual(["sync-jobs"]);
    expect(names.has("sync-jobs-keywords")).toBe(false);
    expect(names.has("sync-jobs-full")).toBe(false);
  });

  it("keeps the budgets and the no-retry policy (spec D7)", () => {
    expect(asConfig(syncJobsSchedule).maxDuration).toBe(600);
    for (const t of [...FULLS, asConfig(syncJobsTask)]) expect(t.maxDuration).toBe(3600);
    for (const t of ALL) expect(t.retry).toEqual({ maxAttempts: 1 });
  });
});

describe("scheduled runs expire instead of piling up (T-3)", () => {
  it("the keyword schedule has a 10-minute TTL, every full schedule an hour; the on-demand task none", () => {
    expect(asConfig(syncJobsSchedule).ttl).toBe("10m");
    for (const t of FULLS) expect(t.ttl).toBe("1h");
    expect(asConfig(syncJobsTask).ttl).toBeUndefined();
  });
});

describe("late keyword ticks skip themselves (H-4)", () => {
  const FIRE = new Date("2026-10-08T12:15:00.000Z");

  it("a tick that starts on time runs the keyword sync", async () => {
    const out = await asConfig(syncJobsSchedule).run({ timestamp: new Date(Date.now() - 30_000) }, { ctx: {} });
    expect(out).toMatchObject({ ok: true, mode: "keywords" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("a tick that starts more than 10 min late returns a late_tick skip, does not call the app and does not throw", async () => {
    const fire = new Date(Date.now() - 47 * 60_000);
    const out = (await asConfig(syncJobsSchedule).run({ timestamp: fire.toISOString() }, { ctx: {} })) as Record<string, unknown>;
    expect(out).toMatchObject({ ok: true, mode: "keywords", skipped: "late_tick", scheduledAt: fire.toISOString() });
    expect(out.lateByMs).toBeGreaterThanOrEqual(47 * 60_000);
    expect(out.lateByMs).toBeLessThan(48 * 60_000);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(expect.stringMatching(/keywords tick skipped: it started 28\d\d s after its scheduled time/), expect.anything());
  });

  it("lateTickSkip: the bound is inclusive, a missing or unreadable timestamp runs", () => {
    const at = FIRE.getTime();
    expect(lateTickSkip("keywords", FIRE, at + KEYWORD_TICK_MAX_LATENESS_MS)).toBeNull();
    expect(lateTickSkip("keywords", FIRE, at + KEYWORD_TICK_MAX_LATENESS_MS + 1)).toMatchObject({ skipped: "late_tick", lateByMs: KEYWORD_TICK_MAX_LATENESS_MS + 1 });
    expect(lateTickSkip("keywords", undefined, at + 3_600_000)).toBeNull();
    expect(lateTickSkip("keywords", "not a date", at + 3_600_000)).toBeNull();
    // Below one tick interval, so a tick never runs in the next tick's rotation slot.
    expect(KEYWORD_TICK_MAX_LATENESS_MS).toBeLessThan(15 * 60_000);
  });

  it("under SCHEDULER=cron the keyword schedule still no-ops first", async () => {
    process.env.SCHEDULER = "cron";
    await expect(asConfig(syncJobsSchedule).run({ timestamp: new Date(0) }, { ctx: {} })).resolves.toEqual({
      skipped: true,
      reason: "SCHEDULER!=trigger",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("one full-sync schedule per environment, staggered (FS-3 / H-1 step 4)", () => {
  it("keeps the production id and cron, and gives stage and the develop preview env their own", () => {
    const declared = Object.fromEntries(
      FULLS.map((t) => {
        const cron = t.cron as { pattern: string; environments?: string[] };
        return [t.id, { pattern: cron.pattern, environments: cron.environments }];
      }),
    );
    expect(declared).toEqual({
      "sync-jobs-full-schedule": { pattern: "20 */6 * * *", environments: ["PRODUCTION"] },
      "sync-jobs-full-schedule-stage": { pattern: "20 2-23/6 * * *", environments: ["STAGING"] },
      "sync-jobs-full-schedule-dev": { pattern: "20 4-23/6 * * *", environments: ["PREVIEW", "DEVELOPMENT"] },
    });
    // The keyword schedule stays in every environment.
    expect(asConfig(syncJobsSchedule).cron).toBe("*/15 * * * *");
  });

  it("fires at disjoint hours: prod 00/06/12/18, stage 02/08/14/20, dev 04/10/16/22 (all :20Z)", () => {
    const [prod, stage, dev] = FULL_SYNC_SCHEDULES.map((d) => hoursOf(d.cron));
    expect(prod).toEqual([0, 6, 12, 18]);
    expect(stage).toEqual([2, 8, 14, 20]);
    expect(dev).toEqual([4, 10, 16, 22]);
    expect(new Set([...prod!, ...stage!, ...dev!]).size).toBe(12);
    // Every environment type has exactly one full schedule.
    const envs = FULL_SYNC_SCHEDULES.flatMap((d) => [...d.environments]).sort();
    expect(envs).toEqual(["DEVELOPMENT", "PREVIEW", "PRODUCTION", "STAGING"]);
    // Task ids are unique in the project.
    expect(new Set(FULL_SYNC_SCHEDULES.map((d) => d.id)).size).toBe(3);
  });

  it.each([
    ["sync-jobs-full-schedule", syncJobsFullSchedule, "PRODUCTION"],
    ["sync-jobs-full-schedule-stage", syncJobsFullScheduleStage, "STAGING"],
    ["sync-jobs-full-schedule-dev", syncJobsFullScheduleDev, "PREVIEW"],
  ])("%s runs the full sync in %s", async (_id, t, env) => {
    const out = await asConfig(t).run({ timestamp: new Date() }, { ctx: { environment: { type: env } } });
    expect(out).toMatchObject({ ok: true, mode: "full" });
    expect(JSON.parse(String((fetchMock.mock.calls[0]![1] as RequestInit).body))).toMatchObject({ mode: "full" });
  });

  it("a schedule that fires in an environment it is not for skips (should the platform ignore the filter)", async () => {
    const out = await asConfig(syncJobsFullScheduleStage).run({ timestamp: new Date() }, { ctx: { environment: { type: "PRODUCTION" } } });
    expect(out).toEqual({
      ok: true,
      mode: "full",
      skipped: "wrong_environment",
      environment: "PRODUCTION",
      scheduledFor: ["STAGING"],
      taskId: "sync-jobs-full-schedule-stage",
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("sync-jobs-full-schedule-stage skipped: this is PRODUCTION"), expect.anything());
    // Unknown environment: runs (the platform's own filter is the primary mechanism).
    expect(environmentSkip(FULL_SYNC_SCHEDULES[1], undefined)).toBeNull();
    expect(environmentSkip(FULL_SYNC_SCHEDULES[2], "DEVELOPMENT")).toBeNull();
  });

  it("under SCHEDULER=cron every full schedule no-ops", async () => {
    process.env.SCHEDULER = "cron";
    for (const t of FULLS) {
      await expect(t.run({ timestamp: new Date() }, { ctx: { environment: { type: "PRODUCTION" } } })).resolves.toEqual({
        skipped: true,
        reason: "SCHEDULER!=trigger",
      });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
