/**
 * Every DB-touching Trigger task must be a thin HTTP caller: it POSTs to the right app endpoint
 * with Bearer CRON_SECRET and THROWS on a non-2xx so the run shows FAILED. The SDK is mocked so
 * `task()` / `schedules.task()` hand back their config ({ id, run, cron, retry }).
 */
jest.mock("@trigger.dev/sdk", () => ({
  task: (config: unknown) => config,
  schedules: { task: (config: unknown) => config },
}));

import * as fs from "node:fs";
import * as path from "node:path";
import { cleanupTask, cleanupSchedule } from "./cleanup";
import { cleanupExpiredJobsTask } from "./cleanup-expired-jobs";
import {
  sendJobAlertsTask,
  dailyAlertSchedule,
  eveningAlertSchedule,
  weeklyAlertSchedule,
} from "./send-job-alerts";
import { followUpNudgesTask, followUpNudgesSchedule } from "./follow-up-nudges";
import { funnelSnapshotsTask, funnelSnapshotsSchedule } from "./funnel-snapshots";
import { batchEvaluateTask } from "./batch-evaluate";
import { inboxSyncTask, inboxSyncSchedule } from "./inbox-sync";
import { APP_ENDPOINT_TASK_MAX_DURATION_S, CRON_ENDPOINTS, CRON_TIMEOUTS_MS } from "./cron-endpoints";

interface TaskConfig {
  id: string;
  cron?: string;
  maxDuration?: number;
  retry?: { maxAttempts?: number };
  run: (payload: unknown, params: { ctx: { run: { createdAt: Date } } }) => Promise<unknown>;
}
const asConfig = (t: unknown) => t as TaskConfig;

// One Trigger run: when it was created, and (for a schedule) the fire time in its payload.
const RUN_CREATED_AT = new Date("2026-09-25T08:00:01.234Z");
const FIRE_TIME = new Date("2026-09-25T08:00:00.000Z");
const ctxOf = (createdAt = RUN_CREATED_AT) => ({ ctx: { run: { createdAt } } });
const runTask = (t: unknown, payload?: unknown, createdAt?: Date) => asConfig(t).run(payload, ctxOf(createdAt));

const BASE = "http://hust-web.hust-test.svc.cluster.local:3000";
let fetchMock: jest.Mock;
const originalFetch = global.fetch;
const savedEnv = { ...process.env };

beforeEach(() => {
  process.env.NEXT_PUBLIC_APP_URL = BASE;
  process.env.CRON_SECRET = "test-secret";
  delete process.env.SCHEDULER;
  fetchMock = jest.fn(async () => new Response(JSON.stringify({ ok: true, result: {} }), { status: 200 }));
  global.fetch = fetchMock as unknown as typeof fetch;
});
afterEach(() => {
  global.fetch = originalFetch;
  process.env = { ...savedEnv };
});

function lastCall(): { url: string; init: RequestInit; body: unknown } {
  const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit];
  return { url, init, body: JSON.parse(String(init.body)) };
}

const cases: { name: string; task: unknown; payload?: unknown; path: string; body: unknown }[] = [
  { name: "cleanup", task: cleanupTask, path: CRON_ENDPOINTS.cleanup, body: {} },
  { name: "cleanup (dry-run request)", task: cleanupTask, payload: { mode: "dry-run" }, path: CRON_ENDPOINTS.cleanup, body: { mode: "dry-run" } },
  { name: "daily-cleanup", task: cleanupSchedule, path: CRON_ENDPOINTS.cleanup, body: {} },
  { name: "cleanup-expired-jobs", task: cleanupExpiredJobsTask, path: CRON_ENDPOINTS.cleanupExpiredJobs, body: {} },
  {
    name: "send-job-alerts",
    task: sendJobAlertsTask,
    payload: { frequency: "weekly" },
    path: CRON_ENDPOINTS.jobAlerts,
    body: { frequencies: ["weekly"], windowEnd: RUN_CREATED_AT.toISOString() },
  },
  {
    name: "daily-job-alerts",
    task: dailyAlertSchedule,
    payload: { timestamp: FIRE_TIME },
    path: CRON_ENDPOINTS.jobAlerts,
    body: { frequencies: ["daily", "twice_daily"], windowEnd: FIRE_TIME.toISOString() },
  },
  {
    name: "evening-job-alerts",
    task: eveningAlertSchedule,
    payload: { timestamp: FIRE_TIME },
    path: CRON_ENDPOINTS.jobAlerts,
    body: { frequencies: ["twice_daily"], windowEnd: FIRE_TIME.toISOString() },
  },
  {
    name: "weekly-job-alerts",
    task: weeklyAlertSchedule,
    payload: { timestamp: FIRE_TIME },
    path: CRON_ENDPOINTS.jobAlerts,
    body: { frequencies: ["weekly"], windowEnd: FIRE_TIME.toISOString() },
  },
  { name: "follow-up-nudges", task: followUpNudgesTask, path: CRON_ENDPOINTS.followUpNudges, body: {} },
  { name: "daily-follow-up-nudges", task: followUpNudgesSchedule, path: CRON_ENDPOINTS.followUpNudges, body: {} },
  { name: "funnel-snapshots", task: funnelSnapshotsTask, path: CRON_ENDPOINTS.funnelSnapshots, body: {} },
  { name: "daily-funnel-snapshots", task: funnelSnapshotsSchedule, path: CRON_ENDPOINTS.funnelSnapshots, body: {} },
  {
    name: "batch-evaluate",
    task: batchEvaluateTask,
    payload: { userId: "u1", jobIds: [1, 2], max: 2 },
    path: CRON_ENDPOINTS.batchEvaluate,
    body: { userId: "u1", jobIds: [1, 2], max: 2 },
  },
  { name: "inbox-sync", task: inboxSyncTask, path: CRON_ENDPOINTS.inboxSync, body: {} },
  { name: "inbox-sync-hourly", task: inboxSyncSchedule, path: CRON_ENDPOINTS.inboxSync, body: {} },
];

describe("Trigger tasks delegate to the app over authenticated HTTP", () => {
  it.each(cases)("$name POSTs to $path with Bearer CRON_SECRET", async ({ task, payload, path: p, body }) => {
    const out = await runTask(task, payload);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = lastCall();
    expect(call.url).toBe(`${BASE}${p}`);
    expect(call.init.method).toBe("POST");
    expect((call.init.headers as Record<string, string>).Authorization).toBe("Bearer test-secret");
    expect(call.body).toEqual(body);
    expect(out).toEqual({ ok: true, result: {} });
  });

  it.each(cases)("$name throws (run FAILED) on a non-2xx", async ({ task, payload }) => {
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ error: "boom" }), { status: 500 }));
    await expect(runTask(task, payload)).rejects.toThrow("HTTP 500");
  });

  it.each(cases.filter((c) => asConfig(c.task).cron))(
    "$name no-ops (no HTTP call) when SCHEDULER=cron",
    async ({ task }) => {
      process.env.SCHEDULER = "cron";
      await expect(runTask(task)).resolves.toEqual({ skipped: true, reason: "SCHEDULER!=trigger" });
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it("keeps the task ids and cron expressions the deployed schedules use", () => {
    const ids = Object.fromEntries(cases.map((c) => [asConfig(c.task).id, asConfig(c.task).cron ?? null]));
    expect(ids).toEqual({
      cleanup: null,
      "daily-cleanup": "0 3 * * *",
      "cleanup-expired-jobs": null,
      "send-job-alerts": null,
      "daily-job-alerts": "0 8 * * *",
      "evening-job-alerts": "0 18 * * *",
      "weekly-job-alerts": "0 8 * * 1",
      "follow-up-nudges": null,
      "daily-follow-up-nudges": "0 9 * * *",
      "funnel-snapshots": null,
      "daily-funnel-snapshots": "0 2 * * *",
      "batch-evaluate": null,
      "inbox-sync": null,
      "inbox-sync-hourly": "0 * * * *",
    });
  });
});

describe("job alerts send a window end that is the same on every attempt of a run", () => {
  const bodies = () => fetchMock.mock.calls.map(([, init]) => JSON.parse(String((init as RequestInit).body)));

  it.each([
    ["daily-job-alerts", dailyAlertSchedule],
    ["evening-job-alerts", eveningAlertSchedule],
    ["weekly-job-alerts", weeklyAlertSchedule],
  ])("%s: windowEnd is the schedule fire time (payload.timestamp), on every attempt", async (_name, t) => {
    // Two attempts of one run: same payload and ctx, but the clock has moved on.
    await runTask(t, { timestamp: FIRE_TIME });
    jest.useFakeTimers().setSystemTime(new Date(FIRE_TIME.getTime() + 5 * 60_000));
    try {
      await runTask(t, { timestamp: FIRE_TIME });
    } finally {
      jest.useRealTimers();
    }
    const [first, retry] = bodies();
    expect(first.windowEnd).toBe(FIRE_TIME.toISOString());
    expect(retry).toEqual(first);
  });

  it("send-job-alerts (on demand): windowEnd is the run creation time (ctx.run.createdAt), on every attempt", async () => {
    await runTask(sendJobAlertsTask, { frequency: "daily" });
    await runTask(sendJobAlertsTask, { frequency: "daily" });
    const [first, retry] = bodies();
    expect(first).toEqual({ frequencies: ["daily"], windowEnd: RUN_CREATED_AT.toISOString() });
    expect(retry).toEqual(first);
  });

  it("two different runs send different window ends (so the app never gives them one key)", async () => {
    await runTask(dailyAlertSchedule, { timestamp: FIRE_TIME });
    await runTask(dailyAlertSchedule, { timestamp: new Date("2026-09-26T08:00:00.000Z") });
    await runTask(sendJobAlertsTask, { frequency: "daily" }, new Date("2026-09-25T09:30:00.000Z"));
    const ends = bodies().map((b) => b.windowEnd);
    expect(new Set(ends).size).toBe(3);
  });

  it("a schedule payload whose timestamp arrives serialised is normalised; a missing one falls back to the run creation time", async () => {
    await runTask(eveningAlertSchedule, { timestamp: "2026-09-25T18:00:00Z" });
    await runTask(eveningAlertSchedule, {});
    expect(bodies().map((b) => b.windowEnd)).toEqual(["2026-09-25T18:00:00.000Z", RUN_CREATED_AT.toISOString()]);
  });
});

describe("retry policy", () => {
  it("batch-evaluate never retries automatically (each evaluation is a paid LLM call)", () => {
    expect(asConfig(batchEvaluateTask).retry).toEqual({ maxAttempts: 1 });
  });

  it("email tasks keep the default retries — safe because each period's sends share one idempotency key", () => {
    // Idempotency lives in work/job-alerts.ts + work/follow-up-nudges.ts (see their tests); a retry
    // is what finishes a run that failed or deferred part of its batch.
    for (const t of [sendJobAlertsTask, dailyAlertSchedule, eveningAlertSchedule, weeklyAlertSchedule, followUpNudgesTask, followUpNudgesSchedule]) {
      expect(asConfig(t).retry).toBeUndefined();
    }
  });
});

describe("maxDuration covers every attempt", () => {
  // trigger.config.ts: retries.default (maxAttempts 3, backoff capped at 30 s) and maxDuration 600.
  const DEFAULT_MAX_ATTEMPTS = 3;
  const MAX_BACKOFF_S = 30;
  const PROJECT_DEFAULT_MAX_DURATION_S = 600;
  const timeoutS = (c: (typeof cases)[number]) => {
    const t = asConfig(c.task);
    const key = (Object.keys(CRON_ENDPOINTS) as (keyof typeof CRON_ENDPOINTS)[]).find((k) => CRON_ENDPOINTS[k] === c.path)!;
    const ms = (CRON_TIMEOUTS_MS as Record<string, number>)[key === "cleanupExpiredJobs" ? "cleanup" : key]!;
    return { t, s: ms / 1000 };
  };

  it("the project default (600 s) would NOT cover three full 290 s attempts — the reason for the override", () => {
    expect(DEFAULT_MAX_ATTEMPTS * 290).toBeGreaterThan(PROJECT_DEFAULT_MAX_DURATION_S);
  });

  it.each(cases)("$name: maxDuration >= attempts x timeout + backoff, even if Trigger sums attempts", (c) => {
    const { t, s } = timeoutS(c);
    const attempts = t.retry?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    expect(t.maxDuration).toBe(APP_ENDPOINT_TASK_MAX_DURATION_S);
    expect(t.maxDuration!).toBeGreaterThanOrEqual(attempts * s + (attempts - 1) * MAX_BACKOFF_S);
  });
});

describe("task modules stay thin", () => {
  const dir = __dirname;
  const thinFiles = [
    "cleanup.ts",
    "cleanup-expired-jobs.ts",
    "send-job-alerts.ts",
    "follow-up-nudges.ts",
    "funnel-snapshots.ts",
    "batch-evaluate.ts",
    "inbox-sync.ts",
  ];
  it.each(thinFiles)("%s does not import the database, email or AI packages", (file) => {
    const src = fs.readFileSync(path.join(dir, file), "utf8");
    expect(src).not.toMatch(/from\s+["']@ever-hust\/(db|email|ai)/);
    expect(src).not.toMatch(/from\s+["']\.\/work/);
    expect(src).not.toMatch(/drizzle-orm/);
  });

  it("the work entry point never imports the Trigger SDK", () => {
    const workDir = path.join(dir, "work");
    for (const file of fs.readdirSync(workDir).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))) {
      const src = fs.readFileSync(path.join(workDir, file), "utf8");
      const importsSdk = /(from\s+|import\s*\(\s*|require\s*\(\s*)["']@trigger\.dev/.test(src);
      expect(`${file}: ${importsSdk}`).toBe(`${file}: false`);
    }
  });
});
