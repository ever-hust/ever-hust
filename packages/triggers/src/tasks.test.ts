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
  run: (payload?: unknown) => Promise<unknown>;
}
const asConfig = (t: unknown) => t as TaskConfig;

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
  { name: "send-job-alerts", task: sendJobAlertsTask, payload: { frequency: "weekly" }, path: CRON_ENDPOINTS.jobAlerts, body: { frequencies: ["weekly"] } },
  { name: "daily-job-alerts", task: dailyAlertSchedule, path: CRON_ENDPOINTS.jobAlerts, body: { frequencies: ["daily", "twice_daily"] } },
  { name: "evening-job-alerts", task: eveningAlertSchedule, path: CRON_ENDPOINTS.jobAlerts, body: { frequencies: ["twice_daily"] } },
  { name: "weekly-job-alerts", task: weeklyAlertSchedule, path: CRON_ENDPOINTS.jobAlerts, body: { frequencies: ["weekly"] } },
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
    const out = await asConfig(task).run(payload);
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
    await expect(asConfig(task).run(payload)).rejects.toThrow("HTTP 500");
  });

  it.each(cases.filter((c) => asConfig(c.task).cron))(
    "$name no-ops (no HTTP call) when SCHEDULER=cron",
    async ({ task }) => {
      process.env.SCHEDULER = "cron";
      await expect(asConfig(task).run()).resolves.toEqual({ skipped: true, reason: "SCHEDULER!=trigger" });
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
