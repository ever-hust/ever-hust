/**
 * /api/cron/* routes: guarded by CRON_SECRET, call their work function with the validated body,
 * answer 2xx only for a clean run and map every failure to a non-2xx (never "200 with errors").
 */
import * as fs from "node:fs";
import * as path from "node:path";

jest.mock("@ever-hust/triggers/work", () => {
  const errors = jest.requireActual("../../../../packages/triggers/src/work/errors");
  return {
    ...errors,
    runCleanup: jest.fn(),
    cleanupExpiredJobs: jest.fn(),
    runJobAlerts: jest.fn(),
    runFollowUpNudges: jest.fn(),
    processFunnelSnapshots: jest.fn(),
    runBatchEvaluate: jest.fn(),
  };
});

import {
  CronInputError,
  CronWorkError,
  cleanupExpiredJobs,
  processFunnelSnapshots,
  runBatchEvaluate,
  runCleanup,
  runFollowUpNudges,
  runJobAlerts,
} from "@ever-hust/triggers/work";
import { CRON_ENDPOINTS } from "../../../../packages/triggers/src/cron-endpoints";
import * as cleanupRoute from "../../app/api/cron/cleanup/route";
import * as cleanupExpiredJobsRoute from "../../app/api/cron/cleanup-expired-jobs/route";
import * as jobAlertsRoute from "../../app/api/cron/job-alerts/route";
import * as followUpNudgesRoute from "../../app/api/cron/follow-up-nudges/route";
import * as funnelSnapshotsRoute from "../../app/api/cron/funnel-snapshots/route";
import * as batchEvaluateRoute from "../../app/api/cron/batch-evaluate/route";

const env = process.env as Record<string, string | undefined>;
const saved = { CRON_SECRET: env.CRON_SECRET, NODE_ENV: env.NODE_ENV };
const SECRET = "route-test-secret";

function post(route: { POST: (r: Request) => Promise<Response> }, body?: unknown, auth = `Bearer ${SECRET}`) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (auth) headers.Authorization = auth;
  return route.POST(
    new Request("http://localhost/api/cron/x", {
      method: "POST",
      headers,
      body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

const mocked = <T extends (...args: never[]) => unknown>(fn: T) => fn as unknown as jest.Mock;

let errSpy: jest.SpyInstance;
beforeEach(() => {
  env.CRON_SECRET = SECRET;
  env.NODE_ENV = "production";
  jest.clearAllMocks();
  errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  errSpy.mockRestore();
  env.CRON_SECRET = saved.CRON_SECRET;
  env.NODE_ENV = saved.NODE_ENV;
});

const routes = [
  { name: "cleanup", route: cleanupRoute, work: runCleanup, body: {}, expectArgs: [{ mode: undefined }] },
  { name: "cleanup-expired-jobs", route: cleanupExpiredJobsRoute, work: cleanupExpiredJobs, body: {}, expectArgs: [{ mode: undefined }] },
  { name: "job-alerts", route: jobAlertsRoute, work: runJobAlerts, body: { frequencies: ["daily", "twice_daily"] }, expectArgs: [["daily", "twice_daily"]] },
  { name: "follow-up-nudges", route: followUpNudgesRoute, work: runFollowUpNudges, body: {}, expectArgs: [] },
  { name: "funnel-snapshots", route: funnelSnapshotsRoute, work: processFunnelSnapshots, body: {}, expectArgs: [] },
  {
    name: "batch-evaluate",
    route: batchEvaluateRoute,
    work: runBatchEvaluate,
    body: { userId: "u1", jobIds: [3, 4], max: 2 },
    expectArgs: [{ userId: "u1", jobIds: [3, 4], max: 2 }],
  },
];

describe.each(routes)("POST /api/cron/$name", ({ route, work, body, expectArgs }) => {
  it("401s without the secret and never runs the work", async () => {
    const res = await post(route, body, "");
    expect(res.status).toBe(401);
    expect(work).not.toHaveBeenCalled();
  });

  it("401s with a wrong secret", async () => {
    expect((await post(route, body, "Bearer wrong")).status).toBe(401);
    expect(work).not.toHaveBeenCalled();
  });

  it("503s (fail closed) when CRON_SECRET is unset in production", async () => {
    delete env.CRON_SECRET;
    expect((await post(route, body)).status).toBe(503);
    expect(work).not.toHaveBeenCalled();
  });

  it("runs the work with the validated body and returns its counters", async () => {
    mocked(work).mockResolvedValue({ sent: 3 });
    const res = await post(route, body);
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toContain("no-store");
    expect(work).toHaveBeenCalledTimes(1);
    expect(mocked(work).mock.calls[0]).toEqual(expectArgs);
    const json = await res.json();
    expect(json).toMatchObject({ ok: true, result: { sent: 3 } });
    expect(typeof json.durationMs).toBe("number");
  });

  it("maps a partial failure (CronWorkError) to 500 with the counters in details", async () => {
    mocked(work).mockRejectedValue(new CronWorkError("2 failed", { sent: 1, failed: 2 }));
    const res = await post(route, body);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "2 failed", details: { sent: 1, failed: 2 } });
  });

  it("maps an unexpected error to 500", async () => {
    mocked(work).mockRejectedValue(new Error("DATABASE_URL environment variable is required"));
    const res = await post(route, body);
    expect(res.status).toBe(500);
    expect((await res.json()).error).toContain("DATABASE_URL environment variable is required");
  });
});

describe("request validation", () => {
  it("cleanup refuses a request to escalate to delete (only JOBS_CLEANUP_MODE can)", async () => {
    const res = await post(cleanupRoute, { mode: "delete" });
    expect(res.status).toBe(400);
    expect(runCleanup).not.toHaveBeenCalled();
  });

  it("cleanup passes a dry-run request through", async () => {
    mocked(runCleanup).mockResolvedValue({ mode: "dry-run" });
    expect((await post(cleanupRoute, { mode: "dry-run" })).status).toBe(200);
    expect(runCleanup).toHaveBeenCalledWith({ mode: "dry-run" });
  });

  it("cleanup accepts an empty body", async () => {
    mocked(runCleanup).mockResolvedValue({});
    expect((await post(cleanupRoute, undefined)).status).toBe(200);
  });

  it.each([
    [{ frequencies: [] }],
    [{ frequencies: ["hourly"] }],
    [{}],
    [{ frequencies: ["daily"], extra: true }],
  ])("job-alerts rejects %j with 400", async (b) => {
    expect((await post(jobAlertsRoute, b)).status).toBe(400);
    expect(runJobAlerts).not.toHaveBeenCalled();
  });

  it("rejects a non-JSON body with 400", async () => {
    expect((await post(jobAlertsRoute, "not json")).status).toBe(400);
  });

  it.each([
    [{ userId: "", jobIds: [1] }],
    [{ userId: "u", jobIds: [] }],
    [{ userId: "u", jobIds: [1.5] }],
    [{ userId: "u", jobIds: [1], max: 1000 }],
  ])("batch-evaluate rejects %j with 400", async (b) => {
    expect((await post(batchEvaluateRoute, b)).status).toBe(400);
    expect(runBatchEvaluate).not.toHaveBeenCalled();
  });

  it("batch-evaluate maps an unknown user (CronInputError 404) to 404", async () => {
    mocked(runBatchEvaluate).mockRejectedValue(new CronInputError("User not found.", 404));
    const res = await post(batchEvaluateRoute, { userId: "ghost", jobIds: [1] });
    expect(res.status).toBe(404);
  });
});

describe("route segment config", () => {
  it.each(routes)("$name is a dynamic Node route with a maxDuration", ({ route }) => {
    const r = route as { runtime?: string; dynamic?: string; maxDuration?: number };
    expect(r.runtime).toBe("nodejs");
    expect(r.dynamic).toBe("force-dynamic");
    expect(r.maxDuration).toBeGreaterThanOrEqual(120);
    expect(r.maxDuration).toBeLessThanOrEqual(300);
  });

  it("every endpoint a Trigger task calls has a route file", () => {
    const appDir = path.resolve(__dirname, "../../app");
    for (const endpoint of Object.values(CRON_ENDPOINTS)) {
      const file = path.join(appDir, ...endpoint.split("/").filter(Boolean), "route.ts");
      expect(`${endpoint}: ${fs.existsSync(file)}`).toBe(`${endpoint}: true`);
    }
  });
});
