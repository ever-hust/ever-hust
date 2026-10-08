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
  ALERT_CANDIDATE_JOBS,
  ALERT_CANDIDATE_MAX_PAGES,
  ALERT_DB_CLOCK_MAX_SKEW_MS,
  ALERT_FIRST_SEND_LOOKBACK_MS,
  ALERT_JOBS_SETTLE_MS,
  ALERT_MAX_JOBS,
  ALERT_MIN_INTERVAL_MS,
  ALERT_POSTED_GRACE_MS,
  ALERT_POSTED_PERIOD_CAP_MS,
  JOBS_INSERT_MAX_LATENCY_MS,
  advanceAlertMarker,
  alertJobIdentity,
  alertJobsWindow,
  alertPeriodCutoff,
  alertPostedSince,
  collapseDuplicateJobs,
  jobAlertIdempotencyKey,
  processAlerts,
  runJobAlerts,
  type AlertFrequency,
  type AlertJobIdentity,
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
  /** The posting's own date (`date_posted`); null when the source gave none. */
  datePosted: Date | null;
  /** `raw_data->>'dedupKey'`. */
  dedupKey: string | null;
  title: string;
  companyName: string;
  locationCity: string | null;
}

/**
 * A row of the fake `jobs` table. `created_at` is what the period filter reads; `date_posted`
 * (null by default) is what the posted-recently filter and the order read. Every job has its own
 * title by default, so no two default jobs are copies of one posting.
 */
const job = (
  id: number,
  createdAt: string | Date,
  over: Partial<Omit<Job, "id" | "createdAt" | "datePosted">> & { datePosted?: string | Date | null } = {},
): Job => {
  const { datePosted, ...rest } = over;
  return {
    id,
    createdAt: new Date(createdAt),
    datePosted: datePosted == null ? null : new Date(datePosted),
    dedupKey: null,
    title: `Job ${id}`,
    companyName: "Acme",
    locationCity: null,
    ...rest,
  };
};

/** Inside the period of every test run at 2026-09-25T08:00:05Z, with or without a marker. */
const DEFAULT_JOB_CREATED_AT = "2026-09-25T06:00:00Z";

/**
 * Minimal Drizzle query-builder fake backed by an in-memory `user_alerts` store and `jobs` table.
 *  - The candidate SELECT applies the same frequency / active / period filter as the real query.
 *  - The jobs SELECT applies every `"jobs"."created_at" <op> $n` bound it finds in the rendered SQL
 *    outside the posted-recently bound, which it applies as `coalesce(date_posted, created_at) >=
 *    $n` (rendered `("jobs"."date_posted" >= $a or ("jobs"."date_posted" is null and
 *    "jobs"."created_at" >= $b))`; keyword criteria are ignored: every job matches), then the ORDER
 *    BY, the OFFSET and the LIMIT. Without an ORDER BY it returns the rows in a different order on
 *    each query, as Postgres may.
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
    offset?: number;
    set?: Record<string, unknown>;
  }[] = [];

  function selectJobs(
    where: { sql: string; params: unknown[] },
    orderBy: string[] | undefined,
    limit: number | undefined,
    offset: number | undefined,
  ) {
    const posted =
      /\("jobs"\."date_posted" >= \$(\d+) or \("jobs"\."date_posted" is null and "jobs"\."created_at" >= \$(\d+)\)\)/.exec(
        where.sql,
      );
    let postedSince: number | null = null;
    if (posted) {
      postedSince = new Date(where.params[Number(posted[1]) - 1] as string).getTime();
      const undatedSince = new Date(where.params[Number(posted[2]) - 1] as string).getTime();
      if (undatedSince !== postedSince) throw new Error("fakeDb: the posted bound is not coalesce(date_posted, created_at)");
    }
    // The period's own created_at bounds (the posted clause has a created_at bound of its own).
    const periodSql = posted ? where.sql.replace(posted[0], "") : where.sql;
    const bounds = [...periodSql.matchAll(/"jobs"\."created_at" (>=|>|<=|<) \$(\d+)/g)].map((m) => ({
      op: m[1]!,
      at: new Date(where.params[Number(m[2]) - 1] as string).getTime(),
    }));
    let rows = state.jobs.filter(
      (j) =>
        bounds.every(({ op, at }) => {
          const t = j.createdAt.getTime();
          return op === ">=" ? t >= at : op === ">" ? t > at : op === "<=" ? t <= at : t < at;
        }) &&
        (postedSince === null || (j.datePosted ?? j.createdAt).getTime() >= postedSince),
    );
    if (orderBy) {
      const keys = orderBy.map((spec) => {
        const m = /^(?:"jobs"\."(created_at|id)"|(coalesce\("jobs"\."date_posted", "jobs"\."created_at"\))) (asc|desc)$/.exec(spec);
        if (!m) throw new Error(`fakeDb: unsupported ORDER BY ${spec}`);
        const get = (j: Job) =>
          m[2] ? (j.datePosted ?? j.createdAt).getTime() : m[1] === "id" ? j.id : j.createdAt.getTime();
        return (a: Job, b: Job) => (m[3] === "desc" ? get(b) - get(a) : get(a) - get(b));
      });
      rows = [...rows].sort((a, b) => keys.reduce((c, k) => c || k(a, b), 0));
    } else if (rows.length > 1) {
      const k = state.jobQueries % rows.length; // no ORDER BY: no guaranteed order
      rows = [...rows.slice(k), ...rows.slice(0, k)];
    }
    state.jobQueries++;
    const from = offset ?? 0;
    return rows.slice(from, from + (limit ?? rows.length)).map((j) => ({
      id: j.id,
      title: j.title,
      companyName: j.companyName,
      locationCity: j.locationCity,
      locationState: null,
      locationCountry: null,
      dedupKey: j.dedupKey,
      isRemote: true,
      salaryMin: "100000",
      salaryMax: null,
      salaryCurrency: "USD",
      jobUrl: `https://example.com/j/${j.id}`,
    }));
  }

  function builder(op: string, table0?: unknown) {
    const st: {
      table?: unknown;
      where?: unknown;
      set?: Record<string, unknown>;
      orderBy?: unknown[];
      limit?: number;
      offset?: number;
    } = {
      table: table0,
    };
    const run = async (): Promise<unknown[]> => {
      const table = getTableName(st.table as never);
      const where = st.where ? render(st.where) : undefined;
      const orderBy = st.orderBy?.map((o) => render(o).sql);
      log.push({ op, table, where, orderBy, limit: st.limit, offset: st.offset, set: st.set });
      if (op === "select" && table === "user_alerts") {
        const [frequency, isActive, cutoffIso] = where!.params as [string, boolean, string];
        const cutoff = new Date(cutoffIso);
        return [...store.values()]
          .filter((a) => a.frequency === frequency && a.isActive === isActive)
          .filter((a) => a.lastSentAt === null || a.lastSentAt < cutoff)
          .map((a) => ({ ...a }));
      }
      if (op === "select" && table === "users") return [{ name: "Ada", subscriptionStatus: init.subscription ?? "active" }];
      if (op === "select" && table === "jobs") return selectJobs(where!, orderBy, st.limit, st.offset);
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
      offset: (n: number) => ((st.offset = n), b),
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

  it("the jobs query reads the fixed period, posted recently, most recently posted first with total tie-breaks", async () => {
    const previous = new Date(W.getTime() - 24 * HOUR);
    const { db, log } = fakeDb([alert({ lastSentAt: previous })]);
    await processAlerts("daily", { db, sendEmail: fakeResend().send as never, now: clock, windowEnd: W });
    const select = log.find((l) => l.op === "select" && l.table === "jobs")!;
    // The created_at period is unchanged (each job is considered by exactly one period); the posted
    // bound is coalesce(date_posted, created_at) >= since, written on the columns.
    expect(select.where!.sql).toMatch(
      /^\("jobs"\."created_at" > \$1 and "jobs"\."created_at" <= \$2 and \("jobs"\."date_posted" >= \$3 or \("jobs"\."date_posted" is null and "jobs"\."created_at" >= \$4\)\) and /,
    );
    const after = new Date(previous.getTime() - SETTLE);
    const since = new Date(after.getTime() - ALERT_POSTED_GRACE_MS).toISOString();
    expect(select.where!.params.slice(0, 4)).toEqual([after.toISOString(), new Date(W.getTime() - SETTLE).toISOString(), since, since]);
    expect(select.offset).toBe(0);
    expect(select.orderBy).toEqual([
      'coalesce("jobs"."date_posted", "jobs"."created_at") desc',
      '"jobs"."created_at" desc',
      '"jobs"."id" desc',
    ]);
    // Room for copies; the digest itself is capped at ALERT_MAX_JOBS after collapsing them.
    expect(select.limit).toBe(ALERT_CANDIDATE_JOBS);
    expect(ALERT_CANDIDATE_JOBS).toBeGreaterThan(ALERT_MAX_JOBS);
    expect(ALERT_MAX_JOBS).toBe(20);
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

describe("what counts as new under a full sync (H-10)", () => {
  const previous = new Date(W.getTime() - 24 * HOUR);
  const { after, through } = alertJobsWindow(previous, W);
  const since = alertPostedSince(after, through, "daily");
  const DAY = 24 * HOUR;
  /** Created inside the period (so only the posted-recently bound and the order decide). */
  const inPeriod = (minutesBeforeEnd: number) => new Date(through.getTime() - minutesBeforeEnd * 60_000);

  async function digest(jobs: Job[]): Promise<string[]> {
    const { db } = fakeDb([alert({ lastSentAt: previous })], { jobs });
    const resend = fakeResend();
    await processAlerts("daily", { db, sendEmail: resend.send as never, now: clock, windowEnd: W });
    return resend.deliveredJobs[0] ?? [];
  }

  it("a job must have been posted no earlier than 3 days before its period starts", () => {
    expect(ALERT_POSTED_GRACE_MS).toBe(3 * DAY);
    expect(alertPostedSince(after, through, "daily")).toEqual(new Date(after.getTime() - 3 * DAY));
    // A date-only source stamps midnight (often local time): a whole day of slack at least.
    expect(ALERT_POSTED_GRACE_MS).toBeGreaterThan(DAY + 14 * HOUR);
  });

  it("a full sync's backlog (created in the period, posted months ago) is not mailed as new", async () => {
    const backlog = Array.from({ length: 30 }, (_, i) =>
      job(100 + i, inPeriod(60 + i), { datePosted: new Date(W.getTime() - (40 + i) * DAY) }),
    );
    const fresh = job(1, inPeriod(30), { datePosted: new Date(W.getTime() - 2 * HOUR) });
    const undated = job(2, inPeriod(20)); // no date_posted: created_at stands in, and it is in the period
    expect(await digest([...backlog, fresh, undated])).toEqual(["Job 2", "Job 1"]);
  });

  it("nothing is sent (and the marker stays) when the period only holds the backlog", async () => {
    const backlog = Array.from({ length: 5 }, (_, i) => job(i + 1, inPeriod(i + 1), { datePosted: new Date(W.getTime() - 90 * DAY) }));
    const { db, store } = fakeDb([alert({ lastSentAt: previous })], { jobs: backlog });
    const send = jest.fn();
    const r = await processAlerts("daily", { db, sendEmail: send as never, now: clock, windowEnd: W });
    expect(r.skippedNoMatches).toBe(1);
    expect(send).not.toHaveBeenCalled();
    expect(store.get(1)!.lastSentAt).toEqual(previous);
  });

  it("the posted bound is inclusive: exactly `since` counts, 1 ms earlier does not", async () => {
    const atBound = job(1, inPeriod(10), { datePosted: since });
    const before = job(2, inPeriod(5), { datePosted: new Date(since.getTime() - 1) });
    expect(await digest([atBound, before])).toEqual(["Job 1"]);
  });

  it("a date-only posting from the day before the period still counts", async () => {
    const midnightBefore = new Date(Date.UTC(after.getUTCFullYear(), after.getUTCMonth(), after.getUTCDate() - 1));
    expect(await digest([job(1, inPeriod(15), { datePosted: midnightBefore })])).toEqual(["Job 1"]);
  });

  it("a job created outside the period never goes out, however fresh its posting date", async () => {
    const lastPeriod = job(1, after, { datePosted: new Date(W.getTime() - HOUR) }); // created at the bound: previous digest
    const nextPeriod = job(2, new Date(through.getTime() + 1), { datePosted: new Date(W.getTime() - HOUR) });
    expect(await digest([lastPeriod, nextPeriod])).toEqual([]);
  });

  it("lists the most recently POSTED first, not the most recently stored; created_at then id break ties", async () => {
    const jobs = [
      job(1, inPeriod(1), { datePosted: new Date(W.getTime() - 2 * DAY) }), // stored last, posted earliest
      job(2, inPeriod(300), { datePosted: new Date(W.getTime() - 3 * HOUR) }), // stored first, posted latest
      job(3, inPeriod(200)), // undated: sorts by its created_at
      // Two date-only postings of the same day: created_at decides, then id.
      job(4, inPeriod(100), { datePosted: new Date(W.getTime() - DAY) }),
      job(5, inPeriod(50), { datePosted: new Date(W.getTime() - DAY) }),
      job(6, inPeriod(50), { datePosted: new Date(W.getTime() - DAY) }),
    ];
    expect(await digest(jobs)).toEqual(["Job 2", "Job 3", "Job 6", "Job 5", "Job 4", "Job 1"]);
  });

  it("every attempt of a run sends the same digest, whatever order the rows are stored in", async () => {
    const jobs = [
      job(1, inPeriod(40), { datePosted: new Date(W.getTime() - DAY), dedupKey: "acme|engineer|remote" }),
      job(2, inPeriod(30), { datePosted: new Date(W.getTime() - DAY), dedupKey: "acme|engineer|remote" }),
      job(3, inPeriod(30), { datePosted: new Date(W.getTime() - DAY) }),
      job(4, inPeriod(20), { datePosted: new Date(W.getTime() - 60 * DAY) }),
      job(5, inPeriod(10)),
    ];
    const { db, state } = fakeDb([alert({ lastSentAt: previous })], { jobs });
    const resend = fakeResend();
    state.failUpdates = 1; // the first attempt's advance never lands → a retry of the same run
    const first = await processAlerts("daily", { db, sendEmail: resend.send as never, now: clock, windowEnd: W });
    expect(first.failed).toBe(1);
    state.jobs = [...state.jobs].reverse(); // the table returns its rows in another physical order
    const retry = await processAlerts("daily", {
      db,
      sendEmail: resend.send as never,
      now: () => new Date(now.getTime() + 5 * 60_000),
      windowEnd: W,
    });
    expect(resend.send.mock.calls[1]![0]).toEqual(resend.send.mock.calls[0]![0]); // same key AND payload
    expect(resend.delivered).toHaveLength(1);
    expect(retry).toMatchObject({ sent: 1, deduplicated: 0, failed: 0 });
    expect(resend.deliveredJobs).toEqual([["Job 5", "Job 3", "Job 2"]]);
  });

  it("copies of one posting (same dedupKey) go out once, as the first in digest order, and are counted", async () => {
    const jobs = [
      job(1, inPeriod(30), { datePosted: new Date(W.getTime() - 5 * HOUR), dedupKey: "acme|engineer|berlin", title: "Engineer (Greenhouse)" }),
      job(2, inPeriod(20), { datePosted: new Date(W.getTime() - 4 * HOUR), dedupKey: " acme|engineer|berlin ", title: "Engineer (LinkedIn)" }),
      job(3, inPeriod(10), { datePosted: new Date(W.getTime() - 6 * HOUR), dedupKey: "acme|designer|berlin", title: "Designer" }),
    ];
    expect(await digest(jobs)).toEqual(["Engineer (LinkedIn)", "Designer"]);

    const { db } = fakeDb([alert({ lastSentAt: previous })], { jobs });
    const out = await runJobAlerts(["daily"], { db, sendEmail: fakeResend().send as never, now: clock, windowEnd: W });
    expect(out.runs[0]).toMatchObject({ sent: 1, duplicatesCollapsed: 1 });
    expect(out.duplicatesCollapsed).toBe(1);
  });

  it("a run with nothing to collapse reports duplicatesCollapsed: 0 (the field is always there)", async () => {
    const { db } = fakeDb([]);
    const out = await runJobAlerts(["daily", "weekly"], { db, sendEmail: fakeResend().send as never, now: clock, windowEnd: W });
    expect(out.duplicatesCollapsed).toBe(0);
    expect(out.runs.map((r) => r.duplicatesCollapsed)).toEqual([0, 0]);
  });

  it("collapsing copies still fills the digest up to 20 distinct jobs", async () => {
    const copies = Array.from({ length: 10 }, (_, i) =>
      job(100 + i, inPeriod(1 + i), { datePosted: new Date(W.getTime() - HOUR), dedupKey: "hot|posting|remote" }),
    );
    const others = Array.from({ length: 30 }, (_, i) => job(i + 1, inPeriod(100 + i), { datePosted: new Date(W.getTime() - 2 * HOUR) }));
    const sent = await digest([...copies, ...others]);
    expect(sent).toHaveLength(ALERT_MAX_JOBS);
    expect(sent[0]).toBe("Job 100");
    expect(sent.slice(1)).toEqual(Array.from({ length: 19 }, (_, i) => `Job ${i + 1}`));
  });
});

describe("collapseDuplicateJobs / alertJobIdentity", () => {
  const idsOf = (rows: { id: number }[]) => rows.map((r) => r.id);
  const row = (over: Partial<AlertJobIdentity> & { id: number }): AlertJobIdentity & { id: number } => ({
    title: "Engineer",
    companyName: "Acme",
    locationCity: "Berlin",
    locationState: null,
    locationCountry: "DE",
    dedupKey: null,
    ...over,
  });

  it("keeps the first row of each identity, in order, and at most `max` rows", () => {
    const rows = [
      row({ id: 1, dedupKey: "k1" }),
      row({ id: 2, dedupKey: "k2" }),
      row({ id: 3, dedupKey: "k1" }),
      row({ id: 4, dedupKey: "k3" }),
    ];
    expect(idsOf(collapseDuplicateJobs(rows).jobs)).toEqual([1, 2, 4]);
    expect(collapseDuplicateJobs(rows).collapsed).toBe(1);
    // Past the cap nothing more is examined, so the copy at index 2 is not counted.
    expect(collapseDuplicateJobs(rows, 2)).toEqual({ jobs: [rows[0], rows[1]], collapsed: 0 });
    expect(collapseDuplicateJobs([])).toEqual({ jobs: [], collapsed: 0 });
  });

  it("compares the stored dedupKey trimmed, as the ingestor does; a blank key counts as none", () => {
    expect(alertJobIdentity(row({ id: 1, dedupKey: " k1 " }))).toBe(alertJobIdentity(row({ id: 2, dedupKey: "k1" })));
    expect(alertJobIdentity(row({ id: 1, dedupKey: "   " }))).toBe(alertJobIdentity(row({ id: 2, dedupKey: null })));
  });

  it("rows without a key collapse on the ingestor's loose company + title + location identity", () => {
    const a = row({ id: 1, companyName: "Acme, Inc.", title: "Senior Engineer" });
    const b = row({ id: 2, companyName: "ACME", title: "senior engineer!" });
    const otherCity = row({ id: 3, companyName: "Acme", title: "Senior Engineer", locationCity: "Munich" });
    expect(idsOf(collapseDuplicateJobs([a, b, otherCity]).jobs)).toEqual([1, 3]);
  });

  it("a keyed row never merges with an unkeyed one, and different keys never merge", () => {
    const keyed = row({ id: 1, dedupKey: "acme|engineer|berlin" });
    const unkeyed = row({ id: 2 });
    const otherKey = row({ id: 3, dedupKey: "acme|engineer|berlin|2" });
    expect(collapseDuplicateJobs([keyed, unkeyed, otherKey])).toEqual({ jobs: [keyed, unkeyed, otherKey], collapsed: 0 });
  });

  it("is pure: the same rows always give the same digest", () => {
    const rows = [row({ id: 1 }), row({ id: 2, dedupKey: "x" }), row({ id: 3 })];
    expect(collapseDuplicateJobs(rows)).toEqual(collapseDuplicateJobs([...rows]));
    expect(rows.map((r) => r.id)).toEqual([1, 2, 3]); // input untouched
  });
});

describe("a stale marker cannot announce old backlog (posted bound capped from the period end)", () => {
  const DAY = 24 * HOUR;
  const ago = (ms: number) => new Date(W.getTime() - ms);

  it("the cap is the longest period a digest covers normally: its longest schedule gap, at least the first-send lookback", () => {
    expect(ALERT_POSTED_PERIOD_CAP_MS).toEqual({ daily: 24 * HOUR, twice_daily: 24 * HOUR, weekly: 7 * DAY });
    // Longest regular gaps: daily 24 h, twice_daily 14 h (18:00 → 08:00), weekly 7 days.
    const longestGap = { daily: 24 * HOUR, twice_daily: 14 * HOUR, weekly: 7 * DAY } as const;
    for (const f of ["daily", "twice_daily", "weekly"] as const) {
      expect(ALERT_POSTED_PERIOD_CAP_MS[f]).toBeGreaterThanOrEqual(longestGap[f]);
      expect(ALERT_POSTED_PERIOD_CAP_MS[f]).toBeGreaterThanOrEqual(ALERT_FIRST_SEND_LOOKBACK_MS);
      expect(ALERT_POSTED_PERIOD_CAP_MS[f]).toBeGreaterThanOrEqual(ALERT_MIN_INTERVAL_MS[f]);
    }
  });

  it.each([
    ["daily", 24 * HOUR],
    ["twice_daily", 14 * HOUR],
    ["twice_daily", 10 * HOUR],
    ["weekly", 7 * 24 * HOUR],
  ] as const)("a regular %s period (%d ms) keeps the bound at its start minus the grace", (frequency, gap) => {
    const { after, through } = alertJobsWindow(ago(gap), W);
    expect(alertPostedSince(after, through, frequency)).toEqual(new Date(after.getTime() - ALERT_POSTED_GRACE_MS));
  });

  it.each(["daily", "twice_daily", "weekly"] as const)("a never-sent %s alert keeps the bound at its start minus the grace", (frequency) => {
    const { after, through } = alertJobsWindow(null, W);
    expect(alertPostedSince(after, through, frequency)).toEqual(new Date(after.getTime() - ALERT_POSTED_GRACE_MS));
  });

  it("an alert idle for weeks gets the bound of a regular period, not of its stale marker", () => {
    const { after, through } = alertJobsWindow(ago(42 * DAY), W);
    expect(alertPostedSince(after, through, "daily")).toEqual(new Date(through.getTime() - 24 * HOUR - ALERT_POSTED_GRACE_MS));
    expect(alertPostedSince(after, through, "weekly")).toEqual(new Date(through.getTime() - 7 * DAY - ALERT_POSTED_GRACE_MS));
    // The created_at period itself still reaches back to the marker: nothing created meanwhile is skipped.
    expect(after).toEqual(new Date(ago(42 * DAY).getTime() - SETTLE));
  });

  it("a daily alert idle for 6 weeks: a full sync's backlog and weeks-old rows stay out, recent postings go out", async () => {
    const previous = ago(42 * DAY); // last digest six weeks ago; every run since found no match
    const { through } = alertJobsWindow(previous, W);
    const since = through.getTime() - 24 * HOUR - ALERT_POSTED_GRACE_MS; // 4 days before the period end
    const jobs = [
      job(1, ago(2 * HOUR), { datePosted: ago(35 * DAY) }), // full-sync backlog: created today, posted 5 weeks ago
      job(2, ago(21 * DAY), { datePosted: ago(21 * DAY) }), // created and posted 3 weeks ago (old news)
      job(3, ago(14 * DAY)), // undated, created 2 weeks ago: created_at stands in, and it is old
      job(4, ago(2 * HOUR), { datePosted: ago(DAY) }), // posted yesterday
      job(5, ago(HOUR)), // undated, created an hour ago
      job(6, ago(3 * HOUR), { datePosted: new Date(since) }), // exactly at the bound: in
      job(7, ago(3 * HOUR), { datePosted: new Date(since - 1) }), // 1 ms earlier: out
    ];
    const { db, store } = fakeDb([alert({ lastSentAt: previous })], { jobs });
    const resend = fakeResend();
    const r = await processAlerts("daily", { db, sendEmail: resend.send as never, now: clock, windowEnd: W });
    expect(r.sent).toBe(1);
    expect(resend.deliveredJobs).toEqual([["Job 5", "Job 4", "Job 6"]]);
    // The period (and so the key) still starts at the stale marker; the marker moves to W.
    expect(resend.delivered).toEqual([jobAlertIdempotencyKey(1, previous, W)]);
    expect(store.get(1)!.lastSentAt).toEqual(W);
  });

  it("the same jobs under the old, uncapped bound would have included the backlog (the bug)", () => {
    const previous = ago(42 * DAY);
    const { after } = alertJobsWindow(previous, W);
    const uncapped = after.getTime() - ALERT_POSTED_GRACE_MS;
    expect(ago(35 * DAY).getTime()).toBeGreaterThan(uncapped); // job 1 above passed the old bound
  });

  it("a weekly alert idle for 5 weeks announces postings of the last 7 days + grace only", async () => {
    const jobs = [
      job(1, ago(2 * HOUR), { datePosted: ago(9 * DAY) }), // within 7 d + 3 d of the period end
      job(2, ago(2 * HOUR), { datePosted: ago(11 * DAY) }), // older than that
    ];
    const { db } = fakeDb([alert({ frequency: "weekly", lastSentAt: ago(35 * DAY) })], { jobs });
    const resend = fakeResend();
    await processAlerts("weekly", { db, sendEmail: resend.send as never, now: clock, windowEnd: W });
    expect(resend.deliveredJobs).toEqual([["Job 1"]]);
  });
});

describe("copies never crowd out distinct matches (paged candidates)", () => {
  const previous = new Date(W.getTime() - 24 * HOUR);
  const { through } = alertJobsWindow(previous, W);
  /** n rows of one posting, most recently posted first in digest order. */
  const copies = (n: number, firstId: number) =>
    Array.from({ length: n }, (_, i) =>
      job(firstId + i, new Date(through.getTime() - (1 + i) * 1000), { datePosted: new Date(W.getTime() - HOUR), dedupKey: "hot|posting|remote" }),
    );
  /** n distinct postings, all ranked below the copies. */
  const distinct = (n: number) =>
    Array.from({ length: n }, (_, i) => job(i + 1, new Date(through.getTime() - (1 + i) * 60_000), { datePosted: new Date(W.getTime() - 2 * HOUR) }));

  async function run(jobs: Job[]) {
    const { db, log } = fakeDb([alert({ lastSentAt: previous })], { jobs });
    const resend = fakeResend();
    const r = await processAlerts("daily", { db, sendEmail: resend.send as never, now: clock, windowEnd: W });
    const pages = log.filter((l) => l.op === "select" && l.table === "jobs");
    return { sent: resend.deliveredJobs[0] ?? [], pages, r, resend };
  }

  it("42 copies then 30 distinct jobs: the digest still lists 20 distinct jobs (was 19)", async () => {
    const { sent, pages, r } = await run([...copies(42, 100), ...distinct(30)]);
    expect(sent).toHaveLength(ALERT_MAX_JOBS);
    expect(sent[0]).toBe("Job 100");
    expect(sent.slice(1)).toEqual(Array.from({ length: 19 }, (_, i) => `Job ${i + 1}`));
    expect(pages.map((p) => [p.offset, p.limit])).toEqual([
      [0, ALERT_CANDIDATE_JOBS],
      [ALERT_CANDIDATE_JOBS, ALERT_CANDIDATE_JOBS],
    ]);
    expect(r.duplicatesCollapsed).toBe(41);
  });

  it("copies filling several pages: it keeps reading until 20 distinct jobs", async () => {
    const { sent, pages } = await run([...copies(130, 1000), ...distinct(25)]);
    expect(sent).toEqual(["Job 1000", ...Array.from({ length: 19 }, (_, i) => `Job ${i + 1}`)]);
    expect(pages.map((p) => p.offset)).toEqual([0, 60, 120]);
  });

  it("stops at the first short page when the period has no more rows", async () => {
    const { sent, pages } = await run([...copies(70, 100), ...distinct(5)]);
    expect(sent).toEqual(["Job 100", "Job 1", "Job 2", "Job 3", "Job 4", "Job 5"]);
    expect(pages.map((p) => p.offset)).toEqual([0, 60]);
  });

  it("one page when it already holds 20 distinct jobs (the common case)", async () => {
    const { sent, pages } = await run(distinct(45));
    expect(sent).toHaveLength(ALERT_MAX_JOBS);
    expect(pages).toHaveLength(1);
  });

  it("an exactly full last page costs one more (empty) read, then stops", async () => {
    const { sent, pages } = await run([...copies(55, 100), ...distinct(5)]); // 60 rows = one full page
    expect(sent).toHaveLength(6);
    expect(pages.map((p) => p.offset)).toEqual([0, 60]);
  });

  it(`gives up after ${ALERT_CANDIDATE_MAX_PAGES} pages and sends the distinct jobs it found`, async () => {
    const { sent, pages } = await run([...copies(ALERT_CANDIDATE_MAX_PAGES * ALERT_CANDIDATE_JOBS, 10_000), ...distinct(3)]);
    expect(pages).toHaveLength(ALERT_CANDIDATE_MAX_PAGES);
    expect(sent).toEqual(["Job 10000"]);
  });

  it("paging is deterministic: a retry over rows stored in another order sends the same email", async () => {
    const { db, state } = fakeDb([alert({ lastSentAt: previous })], { jobs: [...copies(42, 100), ...distinct(30)] });
    const resend = fakeResend();
    state.failUpdates = 1;
    expect((await processAlerts("daily", { db, sendEmail: resend.send as never, now: clock, windowEnd: W })).failed).toBe(1);
    state.jobs = [...state.jobs].reverse();
    const retry = await processAlerts("daily", { db, sendEmail: resend.send as never, now: () => new Date(now.getTime() + 60_000), windowEnd: W });
    expect(resend.send.mock.calls[1]![0]).toEqual(resend.send.mock.calls[0]![0]);
    expect(resend.delivered).toHaveLength(1);
    expect(retry).toMatchObject({ sent: 1, failed: 0 });
  });

  it("the paged result equals collapsing the whole period at once", async () => {
    const all = [...copies(42, 100), ...distinct(30)];
    const { sent } = await run(all);
    // Digest order of the fake rows: copies first (posted 1 h before W), then the distinct ones.
    const whole = collapseDuplicateJobs(
      all.map((j) => ({ ...j, locationState: null, locationCountry: null })),
      ALERT_MAX_JOBS,
    );
    expect(sent).toEqual(whole.jobs.map((j) => j.title));
  });
});
