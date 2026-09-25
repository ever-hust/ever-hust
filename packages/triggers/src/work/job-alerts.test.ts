jest.mock("@ever-hust/email", () => ({ sendJobAlertEmail: jest.fn() }));

import { JOBS_INSERT_MAX_LATENCY_MS as DB_JOBS_INSERT_MAX_LATENCY_MS } from "@ever-hust/db";
import { getTableName, type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import {
  ALERT_WINDOW_END_MAX_AGE_MS,
  ALERT_WINDOW_END_MAX_FUTURE_MS,
  alertWindowEndProblem,
  resolveAlertWindowEnd,
} from "./alert-window";
import { CronInputError, CronWorkError } from "./errors";
import {
  ALERT_DB_CLOCK_MAX_SKEW_MS,
  ALERT_FIRST_SEND_LOOKBACK_MS,
  ALERT_JOBS_SETTLE_MS,
  ALERT_MIN_INTERVAL_MS,
  JOBS_INSERT_MAX_LATENCY_MS,
  advanceAlertMarker,
  alertJobsWindow,
  alertPeriodCutoff,
  jobAlertIdempotencyKey,
  processAlerts,
  runJobAlerts,
  type AlertFrequency,
} from "./job-alerts";
import { classifySendOutcome } from "./send-outcome";

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

interface Job {
  id: number;
  createdAt: Date;
}

/** A row of the fake `jobs` table (`created_at` is what the period filter reads). */
const job = (id: number, createdAt: string | Date): Job => ({ id, createdAt: new Date(createdAt) });

/** Inside the period of every test run at 2026-09-25T08:00:05Z, with or without a marker. */
const DEFAULT_JOB_CREATED_AT = "2026-09-25T06:00:00Z";

/**
 * Minimal Drizzle query-builder fake backed by an in-memory `user_alerts` store and `jobs` table.
 *  - The candidate SELECT applies the same frequency / active / period filter as the real query.
 *  - The jobs SELECT applies every `"jobs"."created_at" <op> $n` bound it finds in the rendered SQL
 *    (keyword criteria are ignored: every job matches), then the ORDER BY and the LIMIT. Without an
 *    ORDER BY it returns the rows in a different order on each query, as Postgres may.
 *  - The advance UPDATE is emulated atomically (JS is single-threaded), exactly like Postgres row
 *    locking serialises two concurrent UPDATEs of the same row: it only applies while
 *    `last_sent_at IS NOT DISTINCT FROM <previous>`.
 *  - `state.failUpdates` makes the next N updates throw (the database, or the pod, died between
 *    the send and the advance); `state.jobs` is the committed jobs table (read at query time).
 */
function fakeDb(alerts: Alert[], init: { matches?: number; jobs?: Job[]; subscription?: string } = {}) {
  const store = new Map(alerts.map((a) => [a.id, { ...a }]));
  const state = {
    jobs: init.jobs ?? Array.from({ length: init.matches ?? 1 }, (_, i) => job(i + 1, DEFAULT_JOB_CREATED_AT)),
    failUpdates: 0,
    jobQueries: 0,
  };
  const log: {
    op: string;
    table: string;
    where?: { sql: string; params: unknown[] };
    orderBy?: string[];
    limit?: number;
    set?: Record<string, unknown>;
  }[] = [];

  function selectJobs(where: { sql: string; params: unknown[] }, orderBy: string[] | undefined, limit: number | undefined) {
    const bounds = [...where.sql.matchAll(/"jobs"\."created_at" (>=|>|<=|<) \$(\d+)/g)].map((m) => ({
      op: m[1]!,
      at: new Date(where.params[Number(m[2]) - 1] as string).getTime(),
    }));
    let rows = state.jobs.filter((j) =>
      bounds.every(({ op, at }) => {
        const t = j.createdAt.getTime();
        return op === ">=" ? t >= at : op === ">" ? t > at : op === "<=" ? t <= at : t < at;
      }),
    );
    if (orderBy) {
      const keys = orderBy.map((spec) => {
        const m = /^"jobs"\."(created_at|id)" (asc|desc)$/.exec(spec);
        if (!m) throw new Error(`fakeDb: unsupported ORDER BY ${spec}`);
        const get = (j: Job) => (m[1] === "id" ? j.id : j.createdAt.getTime());
        return (a: Job, b: Job) => (m[2] === "desc" ? get(b) - get(a) : get(a) - get(b));
      });
      rows = [...rows].sort((a, b) => keys.reduce((c, k) => c || k(a, b), 0));
    } else if (rows.length > 1) {
      const k = state.jobQueries % rows.length; // no ORDER BY: no guaranteed order
      rows = [...rows.slice(k), ...rows.slice(0, k)];
    }
    state.jobQueries++;
    return rows.slice(0, limit ?? rows.length).map((j) => ({
      title: `Job ${j.id}`,
      companyName: "Acme",
      locationCity: null,
      isRemote: true,
      salaryMin: "100000",
      salaryMax: null,
      salaryCurrency: "USD",
      jobUrl: `https://example.com/j/${j.id}`,
    }));
  }

  function builder(op: string, table0?: unknown) {
    const st: { table?: unknown; where?: unknown; set?: Record<string, unknown>; orderBy?: unknown[]; limit?: number } = {
      table: table0,
    };
    const run = async (): Promise<unknown[]> => {
      const table = getTableName(st.table as never);
      const where = st.where ? render(st.where) : undefined;
      const orderBy = st.orderBy?.map((o) => render(o).sql);
      log.push({ op, table, where, orderBy, limit: st.limit, set: st.set });
      if (op === "select" && table === "user_alerts") {
        const [frequency, isActive, cutoffIso] = where!.params as [string, boolean, string];
        const cutoff = new Date(cutoffIso);
        return [...store.values()]
          .filter((a) => a.frequency === frequency && a.isActive === isActive)
          .filter((a) => a.lastSentAt === null || a.lastSentAt < cutoff)
          .map((a) => ({ ...a }));
      }
      if (op === "select" && table === "users") return [{ name: "Ada", subscriptionStatus: init.subscription ?? "active" }];
      if (op === "select" && table === "jobs") return selectJobs(where!, orderBy, st.limit);
      if (op === "update" && table === "user_alerts") {
        if (state.failUpdates > 0) {
          state.failUpdates--;
          throw new Error("connection terminated unexpectedly");
        }
        const id = where!.params[0] as number;
        const row = store.get(id)!;
        const stillAtPrevious = where!.sql.includes('"last_sent_at" is null')
          ? row.lastSentAt === null
          : row.lastSentAt?.getTime() === new Date(where!.params[1] as string).getTime();
        if (!stillAtPrevious) return [];
        row.lastSentAt = st.set!.lastSentAt as Date;
        return [{ id }];
      }
      throw new Error(`unexpected ${op} on ${table}`);
    };
    const b = {
      from: (t: unknown) => ((st.table = t), b),
      where: (w: unknown) => ((st.where = w), b),
      set: (v: Record<string, unknown>) => ((st.set = v), b),
      orderBy: (...o: unknown[]) => ((st.orderBy = o), b),
      limit: (n: number) => ((st.limit = n), b),
      returning: () => b,
      then: (res: (v: unknown[]) => unknown, rej: (e: unknown) => unknown) => run().then(res, rej),
    };
    return b;
  }

  const db = {
    select: () => builder("select"),
    update: (t: unknown) => builder("update", t),
  };
  return { db: db as never, store, state, log };
}

type SendArgs = { idempotencyKey?: string } & Record<string, unknown>;

/**
 * Resend's idempotency semantics, in memory: the first request with a key is delivered; a repeat
 * with the same payload gets the original response (nothing new sent); a repeat with a different
 * payload gets the 409 `replayed` result; a repeat while the first is still being processed gets
 * the 409 `in_flight` result. `delivered` lists the keys of the emails that actually went out.
 */
function fakeResend(opts: { latencyMs?: number } = {}) {
  const accepted = new Map<string, { id: string; payload: string }>();
  const inFlight = new Set<string>();
  const delivered: string[] = [];
  /** The job titles of each email that actually went out, in delivery order. */
  const deliveredJobs: string[][] = [];
  let n = 0;
  const send = jest.fn(async (args: SendArgs) => {
    const key = args.idempotencyKey!;
    const payload = JSON.stringify({ ...args, idempotencyKey: undefined });
    if (inFlight.has(key)) return { id: null, deduplicated: true, reason: "in_flight" };
    const prior = accepted.get(key);
    if (prior) return prior.payload === payload ? { id: prior.id } : { id: null, deduplicated: true, reason: "replayed" };
    inFlight.add(key);
    try {
      if (opts.latencyMs) await new Promise((r) => setTimeout(r, opts.latencyMs));
      const id = `m${++n}`;
      accepted.set(key, { id, payload });
      delivered.push(key);
      deliveredJobs.push(((args.jobs as { title: string }[] | undefined) ?? []).map((j) => j.title));
      return { id };
    } finally {
      inFlight.delete(key);
    }
  });
  return { send, delivered, deliveredJobs };
}

const keysOf = (send: jest.Mock) => send.mock.calls.map((c) => (c[0] as SendArgs).idempotencyKey);

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

// The 08:00 UTC run of 2026-09-25: the schedule's fire time is the run's window end (W). Its
// attempts start a few seconds later (`now`). The day after's run ends at W2.
const W = new Date("2026-09-25T08:00:00.000Z");
const W2 = new Date("2026-09-26T08:00:00.000Z");
const now = new Date("2026-09-25T08:00:05Z");
const clock = () => now;
const at = (iso: string) => () => new Date(iso);
const SETTLE = ALERT_JOBS_SETTLE_MS;

describe("period windows", () => {
  it("are shorter than the real schedule gap and longer than any retry of the same slot", () => {
    expect(ALERT_MIN_INTERVAL_MS.daily).toBe(20 * HOUR); // runs every 24 h
    expect(ALERT_MIN_INTERVAL_MS.twice_daily).toBe(8 * HOUR); // 08:00 + 18:00 → gaps of 10 h / 14 h
    expect(ALERT_MIN_INTERVAL_MS.weekly).toBe(6 * 24 * HOUR); // every 7 days
  });

  it("alertPeriodCutoff subtracts the interval from the window end", () => {
    expect(alertPeriodCutoff("daily", W).toISOString()).toBe("2026-09-24T12:00:00.000Z");
    expect(alertPeriodCutoff("twice_daily", new Date("2026-09-25T18:00:00Z")).toISOString()).toBe(
      "2026-09-25T10:00:00.000Z",
    );
  });

  it("the jobs of a period are (previous, W] shifted back by the settle lag; a first send looks back 24 h", () => {
    const previous = new Date("2026-09-24T08:00:00.000Z");
    expect(alertJobsWindow(previous, W)).toEqual({
      after: new Date(previous.getTime() - SETTLE),
      through: new Date(W.getTime() - SETTLE),
    });
    expect(alertJobsWindow(null, W)).toEqual({
      after: new Date(W.getTime() - ALERT_FIRST_SEND_LOOKBACK_MS - SETTLE),
      through: new Date(W.getTime() - SETTLE),
    });
    expect(ALERT_FIRST_SEND_LOOKBACK_MS).toBe(24 * HOUR);
  });

  it("the settle lag exceeds the accepted clock skew, so an accepted window's jobs part has already closed", () => {
    expect(SETTLE).toBe(10 * 60_000);
    expect(ALERT_WINDOW_END_MAX_FUTURE_MS).toBe(5 * 60_000);
    // W may be up to MAX_FUTURE ahead of the app's clock; its jobs part still ended >= 5 min ago.
    expect(SETTLE - ALERT_WINDOW_END_MAX_FUTURE_MS).toBeGreaterThanOrEqual(5 * 60_000);
  });

  it("the settle lag exceeds the jobs-insert latency bound plus the accepted skews, so every job of a period has committed when it is read", () => {
    // The re-export is the writers' bound itself (packages/db/src/jobs-insert.ts).
    expect(JOBS_INSERT_MAX_LATENCY_MS).toBe(DB_JOBS_INSERT_MAX_LATENCY_MS);
    expect(JOBS_INSERT_MAX_LATENCY_MS).toBe(2 * 60_000);
    // The database/app clock difference the budget assumes (created_at is the database's clock).
    expect(ALERT_DB_CLOCK_MAX_SKEW_MS).toBe(60_000);
    expect(ALERT_JOBS_SETTLE_MS).toBeGreaterThan(
      JOBS_INSERT_MAX_LATENCY_MS + ALERT_WINDOW_END_MAX_FUTURE_MS + ALERT_DB_CLOCK_MAX_SKEW_MS,
    );

    // Worst case, spelled out, on the app's clock. W is as far ahead of the app's clock as the route
    // accepts, so the run reads no earlier than W - MAX_FUTURE. The latest job of the period has
    // created_at = through on the DATABASE's clock (the INSERT's statement_timestamp()), which may
    // run SKEW behind the app's, so that instant is through + SKEW on the app's clock; it commits at
    // most JOBS_INSERT_MAX_LATENCY_MS later, strictly before that read.
    const { through } = alertJobsWindow(new Date(W.getTime() - 24 * HOUR), W);
    const latestCommit = through.getTime() + ALERT_DB_CLOCK_MAX_SKEW_MS + JOBS_INSERT_MAX_LATENCY_MS;
    const earliestRead = W.getTime() - ALERT_WINDOW_END_MAX_FUTURE_MS;
    expect(latestCommit).toBeLessThan(earliestRead);
  });

  it("consecutive periods meet exactly: a job on the boundary goes out once, 1 ms later goes out next", async () => {
    const boundary = new Date(W.getTime() - SETTLE);
    const { db } = fakeDb([alert({ lastSentAt: new Date(W.getTime() - 24 * HOUR) })], {
      jobs: [job(1, boundary), job(2, new Date(boundary.getTime() + 1))],
    });
    const resend = fakeResend();
    await processAlerts("daily", { db, sendEmail: resend.send as never, now: clock, windowEnd: W });
    await processAlerts("daily", { db, sendEmail: resend.send as never, now: at("2026-09-26T08:00:05Z"), windowEnd: W2 });
    expect(resend.deliveredJobs).toEqual([["Job 1"], ["Job 2"]]);
  });
});

describe("send-then-advance", () => {
  it("sends once, then advances the marker to exactly the window end (not the clock)", async () => {
    const { db, store } = fakeDb([alert()]);
    const resend = fakeResend();
    const r = await processAlerts("daily", { db, sendEmail: resend.send as never, now: clock, windowEnd: W });
    expect(r).toMatchObject({ candidates: 1, sent: 1, deduplicated: 0, skippedInFlight: 0, failed: 0 });
    expect(resend.delivered).toEqual([`job-alert/1/first/${W.getTime()}`]);
    expect(store.get(1)!.lastSentAt).toEqual(W);
  });

  it("sends BEFORE the only UPDATE, which is conditional on the marker the key came from", async () => {
    const previous = new Date(W.getTime() - 24 * HOUR);
    const { db, log } = fakeDb([alert({ lastSentAt: previous })]);
    const order: string[] = [];
    const send = jest.fn(async () => {
      order.push(`send after ${log.filter((l) => l.op === "update").length} update(s)`);
      return { id: "m1" };
    });
    await processAlerts("daily", { db, sendEmail: send as never, now: clock, windowEnd: W });
    expect(order).toEqual(["send after 0 update(s)"]);
    const updates = log.filter((l) => l.op === "update");
    expect(updates).toHaveLength(1);
    expect(updates[0]!.where!.sql).toBe('("user_alerts"."id" = $1 and "user_alerts"."last_sent_at" = $2)');
    expect(updates[0]!.where!.params).toEqual([1, previous.toISOString()]);
    // The marker becomes the window end; updated_at records when the row was written.
    expect(updates[0]!.set).toEqual({ lastSentAt: W, updatedAt: now });
  });

  it("a never-sent alert advances with IS NULL (the IS NOT DISTINCT FROM null case)", async () => {
    const { db, log } = fakeDb([alert()]);
    await processAlerts("daily", { db, sendEmail: fakeResend().send as never, now: clock, windowEnd: W });
    const update = log.find((l) => l.op === "update")!;
    expect(update.where!.sql).toBe('("user_alerts"."id" = $1 and "user_alerts"."last_sent_at" is null)');
    expect(update.where!.params).toEqual([1]);
  });

  it("the jobs query reads the fixed period, newest first with an id tie-break, at most 20", async () => {
    const previous = new Date(W.getTime() - 24 * HOUR);
    const { db, log } = fakeDb([alert({ lastSentAt: previous })]);
    await processAlerts("daily", { db, sendEmail: fakeResend().send as never, now: clock, windowEnd: W });
    const select = log.find((l) => l.op === "select" && l.table === "jobs")!;
    expect(select.where!.sql).toMatch(/^\("jobs"\."created_at" > \$1 and "jobs"\."created_at" <= \$2 and /);
    expect(select.where!.params.slice(0, 2)).toEqual([
      new Date(previous.getTime() - SETTLE).toISOString(),
      new Date(W.getTime() - SETTLE).toISOString(),
    ]);
    expect(select.orderBy).toEqual(['"jobs"."created_at" desc', '"jobs"."id" desc']);
    expect(select.limit).toBe(20);
  });

  it("a retry of the same run does not even see the alert once it went out", async () => {
    const { db } = fakeDb([alert()]);
    const resend = fakeResend();
    await processAlerts("daily", { db, sendEmail: resend.send as never, now: clock, windowEnd: W });
    const second = await processAlerts("daily", {
      db,
      sendEmail: resend.send as never,
      now: () => new Date(now.getTime() + 2 * HOUR),
      windowEnd: W,
    });
    expect(second).toMatchObject({ candidates: 0, sent: 0 });
    expect(resend.send).toHaveBeenCalledTimes(1);
  });

  it("the next period sends again, with a new key", async () => {
    const { db, state } = fakeDb([alert()]);
    const resend = fakeResend();
    await processAlerts("daily", { db, sendEmail: resend.send as never, now: clock, windowEnd: W });
    state.jobs.push(job(2, "2026-09-25T20:00:00Z")); // a job for the next period
    const r = await processAlerts("daily", {
      db,
      sendEmail: resend.send as never,
      now: at("2026-09-26T08:00:05Z"),
      windowEnd: W2,
    });
    expect(r.sent).toBe(1);
    expect(resend.delivered).toEqual([`job-alert/1/first/${W.getTime()}`, `job-alert/1/${W.getTime()}/${W2.getTime()}`]);
    expect(resend.deliveredJobs).toEqual([["Job 1"], ["Job 2"]]);
  });

  it("a send failure leaves the marker untouched (no UPDATE at all), so the retry sends it", async () => {
    const previous = new Date(W.getTime() - 24 * HOUR);
    const { db, store, log } = fakeDb([alert({ lastSentAt: previous })]);
    const failing = jest.fn(async () => {
      throw new Error("resend 503");
    });
    const first = await processAlerts("daily", { db, sendEmail: failing as never, now: clock, windowEnd: W });
    expect(first).toMatchObject({ sent: 0, failed: 1 });
    expect(log.some((l) => l.op === "update")).toBe(false);
    expect(store.get(1)!.lastSentAt).toEqual(previous);

    const resend = fakeResend();
    const retry = await processAlerts("daily", {
      db,
      sendEmail: resend.send as never,
      now: () => new Date(now.getTime() + 30_000),
      windowEnd: W,
    });
    expect(retry.sent).toBe(1);
    expect(keysOf(resend.send)).toEqual(keysOf(failing));
    expect(resend.delivered).toHaveLength(1);
  });

  it("the candidate cutoff comes from the window end, not from when the attempt runs", async () => {
    const { db, log } = fakeDb([alert({ frequency: "weekly" })]);
    const late = () => new Date(W.getTime() + 3 * HOUR); // a retry hours after the fire time
    await processAlerts("weekly", { db, sendEmail: fakeResend().send as never, now: late, windowEnd: W });
    const select = log.find((l) => l.op === "select" && l.table === "user_alerts")!;
    expect(select.where!.sql).toContain('("user_alerts"."last_sent_at" is null or "user_alerts"."last_sent_at" < $');
    expect(select.where!.params).toContain(alertPeriodCutoff("weekly", W).toISOString());
  });

  it("never sends (or writes) when there is nothing to send", async () => {
    const { db, log, store } = fakeDb([alert()], { matches: 0 });
    const send = jest.fn();
    const r = await processAlerts("daily", { db, sendEmail: send as never, now: clock, windowEnd: W });
    expect(r.skippedNoMatches).toBe(1);
    expect(send).not.toHaveBeenCalled();
    expect(log.some((l) => l.op === "update")).toBe(false);
    expect(store.get(1)!.lastSentAt).toBeNull();
  });

  it("skips non-subscribers and criteria-less alerts without writing", async () => {
    const send = jest.fn();
    const a = fakeDb([alert()], { subscription: "canceled" });
    expect((await processAlerts("daily", { db: a.db, sendEmail: send as never, now: clock, windowEnd: W })).skippedNotEligible).toBe(1);
    const b = fakeDb([alert({ criteria: {} })]);
    expect((await processAlerts("daily", { db: b.db, sendEmail: send as never, now: clock, windowEnd: W })).skippedNoCriteria).toBe(1);
    expect(send).not.toHaveBeenCalled();
    expect([...a.log, ...b.log].some((l) => l.op === "update")).toBe(false);
  });
});

describe("A5b: crash after the send, then a new matching job before the retry", () => {
  const previous = new Date("2026-09-24T08:00:00.000Z");

  it("the new job is not lost: the retry repeats the first email and the job goes out in the next period", async () => {
    const { db, store, state } = fakeDb([alert({ lastSentAt: previous })], { jobs: [job(1, "2026-09-25T06:00:00Z")] });
    const resend = fakeResend();

    // Attempt 1: Resend accepts the email, then the pod dies before the marker moves.
    state.failUpdates = 1;
    const first = await runJobAlerts(["daily"], {
      db,
      sendEmail: resend.send as never,
      now: at("2026-09-25T08:00:04Z"),
      windowEnd: W.toISOString(),
    }).catch((e: unknown) => e);
    expect(first).toBeInstanceOf(CronWorkError);
    expect(resend.deliveredJobs).toEqual([["Job 1"]]);

    // A new matching job is created before the Trigger retry.
    state.jobs.push(job(2, "2026-09-25T08:02:00Z"));

    // Attempt 2 (the Trigger retry of the same run: same payload, so the same window end).
    await runJobAlerts(["daily"], {
      db,
      sendEmail: resend.send as never,
      now: at("2026-09-25T08:05:00Z"),
      windowEnd: W.toISOString(),
    });
    // The next day's run.
    await runJobAlerts(["daily"], {
      db,
      sendEmail: resend.send as never,
      now: at("2026-09-26T08:00:03Z"),
      windowEnd: W2.toISOString(),
    });

    // Every job reached the user exactly once: Job 2, which the first email could not contain,
    // went out in the next period's email.
    expect(resend.deliveredJobs.flat().sort()).toEqual(["Job 1", "Job 2"]);
    expect(resend.deliveredJobs).toEqual([["Job 1"], ["Job 2"]]);
    // The retry repeated the first email exactly (same key, same payload): nothing new was sent,
    // and the marker moved to the end of the window that email covered.
    expect(resend.send.mock.calls[1]![0]).toEqual(resend.send.mock.calls[0]![0]);
    expect(store.get(1)!.lastSentAt).toEqual(W2);
  });
});

describe("deterministic window across the attempts of one run", () => {
  it("every attempt sends the same key AND the same payload, even if the database returns rows in another order", async () => {
    const previous = new Date(W.getTime() - 24 * HOUR);
    const jobs = [job(1, "2026-09-24T20:00:00Z"), job(2, "2026-09-25T02:00:00Z"), job(3, "2026-09-25T06:00:00Z")];
    const { db, store, state } = fakeDb([alert({ lastSentAt: previous })], { jobs });
    const resend = fakeResend();
    state.failUpdates = 1;
    const first = await processAlerts("daily", { db, sendEmail: resend.send as never, now: clock, windowEnd: W });
    expect(first.failed).toBe(1);
    const retry = await processAlerts("daily", {
      db,
      sendEmail: resend.send as never,
      now: () => new Date(now.getTime() + 5 * 60_000),
      windowEnd: W,
    });
    // Same request twice: Resend answers the repeat with the original response.
    expect(resend.send.mock.calls[1]![0]).toEqual(resend.send.mock.calls[0]![0]);
    expect(keysOf(resend.send)).toEqual([`job-alert/1/${previous.getTime()}/${W.getTime()}`, `job-alert/1/${previous.getTime()}/${W.getTime()}`]);
    expect(resend.deliveredJobs).toEqual([["Job 3", "Job 2", "Job 1"]]); // newest first, one email
    expect(retry).toMatchObject({ sent: 1, deduplicated: 0, failed: 0 });
    expect(store.get(1)!.lastSentAt).toEqual(W);
  });

  it("a 409 replay (the period's content changed between attempts) still moves the marker to W: that email covered (previous, W]", async () => {
    const previous = new Date(W.getTime() - 24 * HOUR);
    const { db, store, state } = fakeDb([alert({ lastSentAt: previous })], { matches: 2 });
    const resend = fakeResend();
    state.failUpdates = 1;
    await processAlerts("daily", { db, sendEmail: resend.send as never, now: clock, windowEnd: W });
    state.jobs = state.jobs.filter((j) => j.id !== 1); // a job of the period was removed meanwhile
    const retry = await processAlerts("daily", {
      db,
      sendEmail: resend.send as never,
      now: () => new Date(now.getTime() + 5 * 60_000),
      windowEnd: W,
    });
    expect(retry).toMatchObject({ sent: 0, deduplicated: 1, failed: 0 });
    expect(resend.delivered).toHaveLength(1);
    expect(store.get(1)!.lastSentAt).toEqual(W);
  });

  it("a window end ahead of the app's clock (skew) never skips a job created just before it", async () => {
    const { db, state } = fakeDb([alert({ lastSentAt: new Date(W.getTime() - 24 * HOUR) })]);
    const resend = fakeResend();
    // Trigger's clock runs 5 min ahead: the run arrives at 07:55 app time with W = 08:00.
    await runJobAlerts(["daily"], {
      db,
      sendEmail: resend.send as never,
      now: at("2026-09-25T07:55:00Z"),
      windowEnd: W.toISOString(),
    });
    // Created (and committed) after that run read its jobs, but before W.
    state.jobs.push(job(2, "2026-09-25T07:59:59.999Z"));
    await runJobAlerts(["daily"], {
      db,
      sendEmail: resend.send as never,
      now: at("2026-09-26T07:55:00Z"),
      windowEnd: W2.toISOString(),
    });
    expect(resend.deliveredJobs).toEqual([["Job 1"], ["Job 2"]]);
  });
});

describe("different runs", () => {
  const previous = new Date(W.getTime() - 24 * HOUR);

  it("never share a key, even from the same marker (the 08:00 run vs a manual run)", async () => {
    const manual = new Date("2026-09-25T09:30:00.000Z");
    expect(jobAlertIdempotencyKey(1, previous, W)).toBe(`job-alert/1/${previous.getTime()}/${W.getTime()}`);
    expect(jobAlertIdempotencyKey(1, null, W)).toBe(`job-alert/1/first/${W.getTime()}`);
    expect(jobAlertIdempotencyKey(1, previous, manual)).not.toBe(jobAlertIdempotencyKey(1, previous, W));

    // The 08:00 run fails to send; a manual run later sends its own email under its own key.
    const { db } = fakeDb([alert({ lastSentAt: previous })]);
    const failing = jest.fn(async () => {
      throw new Error("resend 503");
    });
    await processAlerts("daily", { db, sendEmail: failing as never, now: clock, windowEnd: W });
    const resend = fakeResend();
    await processAlerts("daily", { db, sendEmail: resend.send as never, now: at("2026-09-25T09:30:02Z"), windowEnd: manual });
    expect(keysOf(failing)).toEqual([jobAlertIdempotencyKey(1, previous, W)]);
    expect(resend.delivered).toEqual([jobAlertIdempotencyKey(1, previous, manual)]);
  });

  it("twice_daily: a late morning attempt does not starve the evening run", async () => {
    const { db, store, state } = fakeDb([alert({ frequency: "twice_daily", lastSentAt: new Date("2026-09-24T18:00:00.000Z") })]);
    const resend = fakeResend();
    // The 08:00 run only got through at 10:30 (queued, retried): its marker is still 08:00.
    await processAlerts("twice_daily", { db, sendEmail: resend.send as never, now: at("2026-09-25T10:30:00Z"), windowEnd: W });
    expect(store.get(1)!.lastSentAt).toEqual(W);
    state.jobs.push(job(2, "2026-09-25T12:00:00Z"));
    const evening = new Date("2026-09-25T18:00:00.000Z");
    const r = await processAlerts("twice_daily", {
      db,
      sendEmail: resend.send as never,
      now: at("2026-09-25T18:00:03Z"),
      windowEnd: evening,
    });
    expect(r).toMatchObject({ candidates: 1, sent: 1 });
    expect(resend.deliveredJobs).toEqual([["Job 1"], ["Job 2"]]);
    expect(store.get(1)!.lastSentAt).toEqual(evening);
  });

  it("a replay of an older run never resends, and never moves a marker back", async () => {
    const { db, store } = fakeDb([alert({ lastSentAt: previous })]);
    const resend = fakeResend();
    await processAlerts("daily", { db, sendEmail: resend.send as never, now: at("2026-09-26T08:00:04Z"), windowEnd: W2 });
    const replay = await processAlerts("daily", { db, sendEmail: resend.send as never, now: at("2026-09-26T09:00:00Z"), windowEnd: W });
    expect(replay).toMatchObject({ candidates: 0, sent: 0 });
    expect(resend.send).toHaveBeenCalledTimes(1);
    expect(store.get(1)!.lastSentAt).toEqual(W2);
  });

  it("two different runs overlapping: each sends its own email, the first advance wins, nothing is lost", async () => {
    const manual = new Date("2026-09-25T08:30:00.000Z");
    const { db, store } = fakeDb([alert({ lastSentAt: previous })]);
    const resend = fakeResend();
    let finishA: () => void = () => {};
    const aDone = new Promise<void>((r) => (finishA = r));
    const lateSend = jest.fn(async (args: SendArgs) => {
      await aDone;
      return resend.send(args);
    });
    const [a, b] = await Promise.all([
      processAlerts("daily", { db, sendEmail: resend.send as never, now: clock, windowEnd: W }).finally(() => finishA()),
      processAlerts("daily", { db, sendEmail: lateSend as never, now: at("2026-09-25T08:30:02Z"), windowEnd: manual }),
    ]);
    expect(a).toMatchObject({ sent: 1 });
    expect(b).toMatchObject({ sent: 0, deduplicated: 1, failed: 0 }); // its advance found the marker moved
    expect(resend.delivered).toHaveLength(2); // two keys: at least once, not exactly once
    expect(store.get(1)!.lastSentAt).toEqual(W); // the next period starts at W: nothing skipped
  });
});

describe("windowEnd (runJobAlerts)", () => {
  it("defaults to the app's clock when absent", async () => {
    const { db, store } = fakeDb([alert()]);
    const resend = fakeResend();
    const out = await runJobAlerts(["daily"], { db, sendEmail: resend.send as never, now: clock });
    expect(out.windowEnd).toBe(now.toISOString());
    expect(resend.delivered).toEqual([`job-alert/1/first/${now.getTime()}`]);
    expect(store.get(1)!.lastSentAt).toEqual(now);
  });

  it("uses the caller's value (ISO string) for the whole run", async () => {
    const { db, store } = fakeDb([alert(), alert({ id: 2, frequency: "twice_daily" })]);
    const resend = fakeResend();
    const out = await runJobAlerts(["daily", "twice_daily"], {
      db,
      sendEmail: resend.send as never,
      now: clock,
      windowEnd: W.toISOString(),
    });
    expect(out.windowEnd).toBe(W.toISOString());
    expect(resend.delivered).toEqual([`job-alert/1/first/${W.getTime()}`, `job-alert/2/first/${W.getTime()}`]);
    expect(store.get(1)!.lastSentAt).toEqual(W);
    expect(store.get(2)!.lastSentAt).toEqual(W);
  });

  it.each([
    ["more than 5 min in the future", new Date(now.getTime() + ALERT_WINDOW_END_MAX_FUTURE_MS + 1).toISOString()],
    ["more than 8 days old", new Date(now.getTime() - ALERT_WINDOW_END_MAX_AGE_MS - 1).toISOString()],
    ["not a date", "yesterday"],
  ])("refuses a window end %s with a 400, before reading or sending anything", async (_label, windowEnd) => {
    const { db, log } = fakeDb([alert()]);
    const send = jest.fn();
    const err = (await runJobAlerts(["daily"], { db, sendEmail: send as never, now: clock, windowEnd }).catch(
      (e: unknown) => e,
    )) as CronInputError;
    expect(err).toBeInstanceOf(CronInputError);
    expect(err.cronStatus).toBe(400);
    expect(log).toHaveLength(0);
    expect(send).not.toHaveBeenCalled();
  });

  it("accepts the bounds themselves", () => {
    const ahead = new Date(now.getTime() + ALERT_WINDOW_END_MAX_FUTURE_MS);
    const old = new Date(now.getTime() - ALERT_WINDOW_END_MAX_AGE_MS);
    expect(resolveAlertWindowEnd(ahead.toISOString(), now)).toEqual(ahead);
    expect(resolveAlertWindowEnd(old, now)).toEqual(old);
    expect(alertWindowEndProblem(new Date(Number.NaN), now)).toBe("windowEnd is not a valid date");
    expect(ALERT_WINDOW_END_MAX_AGE_MS).toBe(8 * 24 * HOUR);
  });
});

describe("crash between the send and the advance", () => {
  it("the retry repeats the same request (same key, same payload); one email; the marker moves to W", async () => {
    const previous = new Date(W.getTime() - 24 * HOUR);
    const { db, store, state } = fakeDb([alert({ lastSentAt: previous })]);
    const resend = fakeResend();
    state.failUpdates = 1; // Resend accepts, then the advance never lands.
    const first = await processAlerts("daily", { db, sendEmail: resend.send as never, now: clock, windowEnd: W });
    expect(first).toMatchObject({ sent: 0, deduplicated: 0, failed: 1 });
    expect(store.get(1)!.lastSentAt).toEqual(previous);
    expect(resend.delivered).toEqual([`job-alert/1/${previous.getTime()}/${W.getTime()}`]);

    const retry = await processAlerts("daily", {
      db,
      sendEmail: resend.send as never,
      now: () => new Date(now.getTime() + 60_000),
      windowEnd: W,
    });
    expect(retry).toMatchObject({ sent: 1, failed: 0 });
    expect(keysOf(resend.send)).toEqual([resend.delivered[0], resend.delivered[0]]);
    expect(resend.delivered).toHaveLength(1); // one email, not two
    expect(store.get(1)!.lastSentAt).toEqual(W);
  });

  it("the failed advance makes the run answer non-2xx, so the Trigger retry happens", async () => {
    const { db, state } = fakeDb([alert()]);
    state.failUpdates = 1;
    const err = (await runJobAlerts(["daily"], { db, sendEmail: fakeResend().send as never, now: clock }).catch(
      (e: unknown) => e,
    )) as CronWorkError;
    expect(err).toBeInstanceOf(CronWorkError);
    expect(err.cronDetails).toMatchObject({ sent: 0, failed: 1, windowEnd: now.toISOString() });
    expect(errSpy.mock.calls.some((c) => String(c[1]).includes("email accepted but the period could not be recorded"))).toBe(true);
  });
});

describe("overlapping attempts of one run", () => {
  it("one attempt's send is still in flight: the other does not record the period; one email", async () => {
    const { db, store } = fakeDb([alert()]);
    const resend = fakeResend({ latencyMs: 5 });
    const [a, b] = await Promise.all([
      processAlerts("daily", { db, sendEmail: resend.send as never, now: clock, windowEnd: W }),
      processAlerts("daily", { db, sendEmail: resend.send as never, now: () => new Date(now.getTime() + 1000), windowEnd: W }),
    ]);
    expect(a.sent + b.sent).toBe(1);
    expect(a.skippedInFlight + b.skippedInFlight).toBe(1);
    expect(a.failed + b.failed).toBe(0);
    expect(resend.delivered).toHaveLength(1);
    expect(store.get(1)!.lastSentAt).toEqual(W);
  });

  it("one accepted, one deduplicated: the late attempt's conditional advance is a no-op", async () => {
    const { db, store, log } = fakeDb([alert()]);
    const resend = fakeResend();
    let finishA: () => void = () => {};
    const aDone = new Promise<void>((r) => (finishA = r));
    // Both attempts read the candidate first; B's send only reaches Resend after A has sent AND advanced.
    const lateSend = jest.fn(async (args: SendArgs) => {
      await aDone;
      return resend.send(args);
    });
    const [a, b] = await Promise.all([
      processAlerts("daily", { db, sendEmail: resend.send as never, now: clock, windowEnd: W }).finally(() => finishA()),
      processAlerts("daily", { db, sendEmail: lateSend as never, now: () => new Date(now.getTime() + 1000), windowEnd: W }),
    ]);
    expect(a).toMatchObject({ sent: 1, deduplicated: 0 });
    expect(b).toMatchObject({ sent: 0, deduplicated: 1, failed: 0 });
    expect(keysOf(lateSend)).toEqual([`job-alert/1/first/${W.getTime()}`]);
    expect(resend.delivered).toEqual([`job-alert/1/first/${W.getTime()}`]);
    expect(log.filter((l) => l.op === "update")).toHaveLength(2); // B tried, conditionally
    expect(store.get(1)!.lastSentAt).toEqual(W);
  });

  it("an in-flight skip makes runJobAlerts answer non-2xx, so a retry re-checks it", async () => {
    const { db } = fakeDb([alert()]);
    const inFlight = jest.fn(async () => ({ id: null, deduplicated: true, reason: "in_flight" }));
    const err = (await runJobAlerts(["daily"], { db, sendEmail: inFlight as never, now: clock }).catch(
      (e: unknown) => e,
    )) as CronWorkError;
    expect(err).toBeInstanceOf(CronWorkError);
    expect(err.cronDetails).toMatchObject({ sent: 0, skippedInFlight: 1, failed: 0 });
  });
});

describe("advanceAlertMarker (conditional advance)", () => {
  const previous = new Date("2026-09-24T08:00:00Z");

  it("advances while the marker still holds the previous value", async () => {
    const { db, store } = fakeDb([alert({ lastSentAt: previous })]);
    await expect(advanceAlertMarker(db, 1, previous, W)).resolves.toBe(true);
    expect(store.get(1)!.lastSentAt).toEqual(W);
  });

  it("is a no-op when another run already advanced it", async () => {
    const other = new Date("2026-09-25T07:00:00Z");
    const { db, store } = fakeDb([alert({ lastSentAt: other })]);
    await expect(advanceAlertMarker(db, 1, previous, W)).resolves.toBe(false);
    await expect(advanceAlertMarker(db, 1, null, W)).resolves.toBe(false);
    expect(store.get(1)!.lastSentAt).toEqual(other);
  });
});

describe("Resend idempotency key", () => {
  it("keys every send on the alert id, the period's previous last_sent_at and the window end", async () => {
    const previous = new Date(W.getTime() - 24 * HOUR);
    const { db } = fakeDb([alert(), alert({ id: 2, lastSentAt: previous })]);
    const resend = fakeResend();
    await processAlerts("daily", { db, sendEmail: resend.send as never, now: clock, windowEnd: W });
    expect(keysOf(resend.send)).toEqual([
      `job-alert/1/first/${W.getTime()}`,
      `job-alert/2/${previous.getTime()}/${W.getTime()}`,
    ]);
  });

  it("a lost response (Resend accepted, the send threw) is resent with the same key and delivered once", async () => {
    const previous = new Date(W.getTime() - 24 * HOUR);
    const { db, store } = fakeDb([alert({ lastSentAt: previous })]);
    const resend = fakeResend();
    const lost = jest.fn(async (args: SendArgs) => {
      await resend.send(args);
      throw new Error("Unable to fetch data. The request could not be resolved.");
    });
    const first = await processAlerts("daily", { db, sendEmail: lost as never, now: clock, windowEnd: W });
    expect(first.failed).toBe(1);
    expect(store.get(1)!.lastSentAt).toEqual(previous);

    const retry = await processAlerts("daily", {
      db,
      sendEmail: resend.send as never,
      now: () => new Date(now.getTime() + 30_000),
      windowEnd: W,
    });
    expect(retry).toMatchObject({ failed: 0 });
    expect(keysOf(lost)).toEqual(keysOf(resend.send).slice(-1));
    expect(resend.delivered).toHaveLength(1);
    expect(store.get(1)!.lastSentAt).toEqual(W);
  });

  it("a 409 replay counts as deduplicated, advances the marker and does not fail the run", async () => {
    const { db, store } = fakeDb([alert()]);
    const replay = jest.fn(async () => ({ id: null, deduplicated: true, reason: "replayed" }));
    const out = await runJobAlerts(["daily"], { db, sendEmail: replay as never, now: clock, windowEnd: W });
    expect(out).toMatchObject({ sent: 0, deduplicated: 1, skippedInFlight: 0, failed: 0 });
    expect(out.runs[0]).toMatchObject({ sent: 0, deduplicated: 1 });
    expect(store.get(1)!.lastSentAt).toEqual(W);
  });

  it("classifySendOutcome", () => {
    expect(classifySendOutcome({ id: "m1" })).toBe("accepted");
    expect(classifySendOutcome(null)).toBe("accepted");
    expect(classifySendOutcome({ id: null, deduplicated: true, reason: "replayed" })).toBe("replayed");
    expect(classifySendOutcome({ id: null, deduplicated: true, reason: "in_flight" })).toBe("in_flight");
    // A dedupe result without a reason (older email package) is a replay, never in flight.
    expect(classifySendOutcome({ id: null, deduplicated: true })).toBe("replayed");
  });
});

describe("runJobAlerts (route entry point)", () => {
  it("returns aggregate counters when everything went out", async () => {
    const { db } = fakeDb([alert(), alert({ id: 2, frequency: "twice_daily" })]);
    const resend = fakeResend();
    const out = await runJobAlerts(["daily", "twice_daily"], { db, sendEmail: resend.send as never, now: clock, windowEnd: W });
    expect(out).toMatchObject({ windowEnd: W.toISOString(), sent: 2, deduplicated: 0, skippedInFlight: 0, failed: 0, deferred: 0 });
    expect(resend.delivered).toEqual([`job-alert/1/first/${W.getTime()}`, `job-alert/2/first/${W.getTime()}`]);
  });

  it("throws CronWorkError (→ non-2xx) with counters when a send failed", async () => {
    const { db } = fakeDb([alert()]);
    const err = (await runJobAlerts(["daily"], {
      db,
      sendEmail: jest.fn(async () => {
        throw new Error("bad address");
      }) as never,
      now: clock,
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
      now: clock,
      deadline: now.getTime() - 1,
    }).catch((e: unknown) => e)) as CronWorkError;
    expect(err).toBeInstanceOf(CronWorkError);
    expect(err.cronDetails).toMatchObject({ deferred: 2, sent: 0 });
    expect(send).not.toHaveBeenCalled();
  });
});
