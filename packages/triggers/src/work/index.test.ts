/**
 * `@ever-hust/triggers/work` is imported by the Next app's cron routes. It must load WITHOUT the
 * Trigger.dev SDK anywhere in its module graph (transitively), and it must not connect to the
 * database at import time.
 */
jest.mock("@trigger.dev/sdk", () => {
  throw new Error("@trigger.dev/sdk was loaded by the work entry point");
});

describe("@ever-hust/triggers/work entry point", () => {
  it("loads without the Trigger SDK and without DATABASE_URL", () => {
    const saved = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    try {
      let mod: Record<string, unknown> = {};
      jest.isolateModules(() => {
        mod = jest.requireActual("./index");
      });
      for (const name of [
        "runCleanup",
        "cleanupExpiredJobs",
        "runJobAlerts",
        "runFollowUpNudges",
        "processFollowUpNudges",
        "processFunnelSnapshots",
        "runBatchEvaluate",
        "CronWorkError",
        "CronInputError",
      ]) {
        expect(typeof mod[name]).toBe("function");
      }
    } finally {
      if (saved !== undefined) process.env.DATABASE_URL = saved;
    }
  });

  it("control: a Trigger task module DOES load the SDK, so the check above can fail", () => {
    expect(() =>
      jest.isolateModules(() => {
        jest.requireActual("../cleanup");
      }),
    ).toThrow("@trigger.dev/sdk was loaded");
  });
});
