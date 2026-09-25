jest.mock("@ever-hust/email", () => ({ sendJobAlertEmail: jest.fn() }));

import { getTableName, type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { CronWorkError } from "./errors";
import {
  ALERT_MIN_INTERVAL_MS,
  alertPeriodCutoff,
  processAlerts,
  runJobAlerts,
  type AlertFrequency,
} from "./job-alerts";

const dialect = new PgDialect();
const render = (w: unknown) => {
  const q = dialect.sqlToQuery(w as SQL);
  return { sql: q.sql.replace(/\s+/g, " "), params: q.params };
};

const HOUR = 60 * 60 * 1000;

interface Alert {
  id: number;
  userId: string;
  frequency: AlertFrequency;
  email: string;
  criteria: { keywords?: string[] } | null;
  isActive: boolean;
  lastSentAt: Date | null;
}

/**
 * Minimal Drizzle query-builder fake backed by an in-memory `user_alerts` store. The conditional
 * claim UPDATE is emulated atomically (JS is single-threaded), exactly like Postgres row locking
 * serialises two concurrent UPDATEs of the same row.
 */
function fakeDb(alerts: Alert[], opts: { matches?: number; subscription?: string } = {}) {
  const store = new Map(alerts.map((a) => [a.id, { ...a }]));
  const log: { op: string; table: string; where?: { sql: string; params: unknown[] }; set?: Record<string, unknown> }[] = [];

  function builder(op: string, table0?: unknown) {
    const st: { table?: unknown; where?: unknown; set?: Record<string, unknown>; returning?: boolean } = { table: table0 };
    const run = async (): Promise<unknown[]> => {
      const table = getTableName(st.table as never);
      const where = st.where ? render(st.where) : undefined;
      log.push({ op, table, where, set: st.set });
      if (op === "select" && table === "user_alerts") return [...store.values()].map((a) => ({ ...a }));
      if (op === "select" && table === "users") return [{ name: "Ada", subscriptionStatus: opts.subscription ?? "active" }];
      if (op === "select" && table === "jobs") {
        return Array.from({ length: opts.matches ?? 1 }, (_, i) => ({
          title: `Job ${i}`,
          companyName: "Acme",
          locationCity: null,
          isRemote: true,
          salaryMin: "100000",
          salaryMax: null,
          salaryCurrency: "USD",
          jobUrl: "https://example.com/j",
        }));
      }
      if (op === "update" && table === "user_alerts") {
        const id = where!.params.find((p) => typeof p === "number") as number;
        const row = store.get(id)!;
        const newValue = st.set!.lastSentAt as Date | null;
        if (st.returning) {
          // claim: last_sent_at IS NULL OR last_sent_at < cutoff (cutoff = the last param)
          const cutoff = new Date(where!.params.at(-1) as string);
          if (row.lastSentAt === null || row.lastSentAt < cutoff) {
            row.lastSentAt = newValue;
            return [{ id }];
          }
          return [];
        }
        // release: only if still holding our claim (last param = claimedAt)
        const claimedAt = new Date(where!.params.at(-1) as string);
        if (row.lastSentAt && row.lastSentAt.getTime() === claimedAt.getTime()) row.lastSentAt = newValue;
        return [];
      }
      throw new Error(`unexpected ${op} on ${table}`);
    };
    const b = {
      from: (t: unknown) => ((st.table = t), b),
      where: (w: unknown) => ((st.where = w), b),
      set: (v: Record<string, unknown>) => ((st.set = v), b),
      limit: () => b,
      returning: () => ((st.returning = true), b),
      then: (res: (v: unknown[]) => unknown, rej: (e: unknown) => unknown) => run().then(res, rej),
    };
    return b;
  }

  const db = {
    select: () => builder("select"),
    update: (t: unknown) => builder("update", t),
  };
  return { db: db as never, store, log };
}

const alert = (over: Partial<Alert> = {}): Alert => ({
  id: 1,
  userId: "u1",
  frequency: "daily",
  email: "ada@example.com",
  criteria: { keywords: ["rust"] },
  isActive: true,
  lastSentAt: null,
  ...over,
});

let errSpy: jest.SpyInstance;
beforeEach(() => {
  errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => errSpy.mockRestore());

describe("period windows", () => {
  it("are shorter than the real schedule gap and longer than any retry of the same slot", () => {
    expect(ALERT_MIN_INTERVAL_MS.daily).toBe(20 * HOUR); // runs every 24 h
    expect(ALERT_MIN_INTERVAL_MS.twice_daily).toBe(8 * HOUR); // 08:00 + 18:00 → gaps of 10 h / 14 h
    expect(ALERT_MIN_INTERVAL_MS.weekly).toBe(6 * 24 * HOUR); // every 7 days
  });

  it("alertPeriodCutoff subtracts the window", () => {
    const now = new Date("2026-09-25T08:00:00Z");
    expect(alertPeriodCutoff("daily", now).toISOString()).toBe("2026-09-24T12:00:00.000Z");
  });
});

describe("processAlerts idempotency", () => {
  const now = new Date("2026-09-25T08:00:05Z");
  const clock = () => now;

  it("sends once and records the claim", async () => {
    const { db, store } = fakeDb([alert()]);
    const send = jest.fn(async () => ({ id: "m1" }));
    const r = await processAlerts("daily", { db, sendEmail: send as never, now: clock });
    expect(r).toMatchObject({ candidates: 1, sent: 1, failed: 0, skippedAlreadyClaimed: 0 });
    expect(send).toHaveBeenCalledTimes(1);
    expect(store.get(1)!.lastSentAt).toEqual(now);
  });

  it("a re-run / Trigger retry of the same slot sends nothing", async () => {
    const { db } = fakeDb([alert()]);
    const send = jest.fn(async () => ({ id: "m1" }));
    await processAlerts("daily", { db, sendEmail: send as never, now: clock });
    const later = new Date(now.getTime() + 2 * HOUR);
    const second = await processAlerts("daily", { db, sendEmail: send as never, now: () => later });
    expect(second.sent).toBe(0);
    expect(second.skippedAlreadyClaimed).toBe(1);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("two overlapping runs send exactly one email", async () => {
    const { db } = fakeDb([alert()]);
    const send = jest.fn(async () => {
      await new Promise((r) => setTimeout(r, 5));
      return { id: "m1" };
    });
    const [a, b] = await Promise.all([
      processAlerts("daily", { db, sendEmail: send as never, now: clock }),
      processAlerts("daily", { db, sendEmail: send as never, now: clock }),
    ]);
    expect(a.sent + b.sent).toBe(1);
    expect(a.skippedAlreadyClaimed + b.skippedAlreadyClaimed).toBe(1);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("the next period sends again", async () => {
    const { db } = fakeDb([alert({ lastSentAt: new Date(now.getTime() - 24 * HOUR) })]);
    const send = jest.fn(async () => ({ id: "m1" }));
    const r = await processAlerts("daily", { db, sendEmail: send as never, now: clock });
    expect(r.sent).toBe(1);
  });

  it("a failed send releases the claim so the retry sends it (once)", async () => {
    const previous = new Date(now.getTime() - 24 * HOUR);
    const { db, store } = fakeDb([alert({ lastSentAt: previous })]);
    const failing = jest.fn(async () => {
      throw new Error("resend 503");
    });
    const first = await processAlerts("daily", { db, sendEmail: failing as never, now: clock });
    expect(first).toMatchObject({ sent: 0, failed: 1 });
    expect(store.get(1)!.lastSentAt).toEqual(previous);

    const ok = jest.fn(async () => ({ id: "m1" }));
    const retry = await processAlerts("daily", { db, sendEmail: ok as never, now: clock });
    expect(retry.sent).toBe(1);
    expect(ok).toHaveBeenCalledTimes(1);
  });

  it("claims with one conditional UPDATE ... RETURNING before sending", async () => {
    const { db, log } = fakeDb([alert()]);
    const order: string[] = [];
    const send = jest.fn(async () => {
      order.push(`send after ${log.filter((l) => l.op === "update").length} update(s)`);
      return { id: "m1" };
    });
    await processAlerts("twice_daily", { db, sendEmail: send as never, now: clock });
    const claim = log.find((l) => l.op === "update")!;
    expect(claim.where!.sql).toBe(
      '("user_alerts"."id" = $1 and ("user_alerts"."last_sent_at" is null or "user_alerts"."last_sent_at" < $2))',
    );
    expect(claim.where!.params[1]).toBe(alertPeriodCutoff("twice_daily", now).toISOString());
    expect(order).toEqual(["send after 1 update(s)"]);
  });

  it("the candidate query already excludes alerts sent in this period (so retries continue, not restart)", async () => {
    const { db, log } = fakeDb([alert({ frequency: "weekly" })]);
    await processAlerts("weekly", { db, sendEmail: jest.fn(async () => ({})) as never, now: clock });
    const select = log.find((l) => l.op === "select" && l.table === "user_alerts")!;
    expect(select.where!.sql).toContain('("user_alerts"."last_sent_at" is null or "user_alerts"."last_sent_at" < $');
    expect(select.where!.params).toContain(alertPeriodCutoff("weekly", now).toISOString());
  });

  it("never claims (or sends) when there is nothing to send", async () => {
    const { db, log, store } = fakeDb([alert()], { matches: 0 });
    const send = jest.fn();
    const r = await processAlerts("daily", { db, sendEmail: send as never, now: clock });
    expect(r.skippedNoMatches).toBe(1);
    expect(send).not.toHaveBeenCalled();
    expect(log.some((l) => l.op === "update")).toBe(false);
    expect(store.get(1)!.lastSentAt).toBeNull();
  });

  it("skips non-subscribers and criteria-less alerts without claiming", async () => {
    const send = jest.fn();
    const a = fakeDb([alert()], { subscription: "canceled" });
    expect((await processAlerts("daily", { db: a.db, sendEmail: send as never, now: clock })).skippedNotEligible).toBe(1);
    const b = fakeDb([alert({ criteria: {} })]);
    expect((await processAlerts("daily", { db: b.db, sendEmail: send as never, now: clock })).skippedNoCriteria).toBe(1);
    expect(send).not.toHaveBeenCalled();
  });
});

describe("runJobAlerts (route entry point)", () => {
  const now = new Date("2026-09-25T08:00:05Z");

  it("returns aggregate counters when everything went out", async () => {
    const { db } = fakeDb([alert(), alert({ id: 2, frequency: "twice_daily" })]);
    const out = await runJobAlerts(["daily", "twice_daily"], {
      db,
      sendEmail: jest.fn(async () => ({})) as never,
      now: () => now,
    });
    // The fake store ignores the frequency filter, so each frequency sees both alerts; what
    // matters is that no alert is sent twice across the two passes.
    expect(out.sent).toBe(2);
    expect(out.failed).toBe(0);
  });

  it("throws CronWorkError (→ non-2xx) with counters when a send failed", async () => {
    const { db } = fakeDb([alert()]);
    const err = (await runJobAlerts(["daily"], {
      db,
      sendEmail: jest.fn(async () => {
        throw new Error("bad address");
      }) as never,
      now: () => now,
    }).catch((e: unknown) => e)) as CronWorkError;
    expect(err).toBeInstanceOf(CronWorkError);
    expect(err.cronDetails).toMatchObject({ sent: 0, failed: 1, deferred: 0 });
  });

  it("defers (and throws) instead of running past its time budget", async () => {
    const { db } = fakeDb([alert(), alert({ id: 2 })]);
    const send = jest.fn();
    const err = (await runJobAlerts(["daily"], {
      db,
      sendEmail: send as never,
      now: () => now,
      deadline: now.getTime() - 1,
    }).catch((e: unknown) => e)) as CronWorkError;
    expect(err).toBeInstanceOf(CronWorkError);
    expect(err.cronDetails).toMatchObject({ deferred: 2, sent: 0 });
    expect(send).not.toHaveBeenCalled();
  });
});
