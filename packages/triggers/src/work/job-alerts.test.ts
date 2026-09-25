jest.mock("@ever-hust/email", () => ({ sendJobAlertEmail: jest.fn() }));

import { getTableName, type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { CronWorkError } from "./errors";
import {
  ALERT_MIN_INTERVAL_MS,
  advanceAlertMarker,
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

/**
 * Minimal Drizzle query-builder fake backed by an in-memory `user_alerts` store.
 *  - The candidate SELECT applies the same frequency / active / period filter as the real query.
 *  - The advance UPDATE is emulated atomically (JS is single-threaded), exactly like Postgres row
 *    locking serialises two concurrent UPDATEs of the same row: it only applies while
 *    `last_sent_at IS NOT DISTINCT FROM <previous>`.
 *  - `state.failUpdates` makes the next N updates throw (the database, or the pod, died between
 *    the send and the advance); `state.matches` is how many jobs match (read at query time).
 */
function fakeDb(alerts: Alert[], init: { matches?: number; subscription?: string } = {}) {
  const store = new Map(alerts.map((a) => [a.id, { ...a }]));
  const state = { matches: init.matches ?? 1, failUpdates: 0 };
  const log: { op: string; table: string; where?: { sql: string; params: unknown[] } }[] = [];

  function builder(op: string, table0?: unknown) {
    const st: { table?: unknown; where?: unknown; set?: Record<string, unknown> } = { table: table0 };
    const run = async (): Promise<unknown[]> => {
      const table = getTableName(st.table as never);
      const where = st.where ? render(st.where) : undefined;
      log.push({ op, table, where });
      if (op === "select" && table === "user_alerts") {
        const [frequency, isActive, cutoffIso] = where!.params as [string, boolean, string];
        const cutoff = new Date(cutoffIso);
        return [...store.values()]
          .filter((a) => a.frequency === frequency && a.isActive === isActive)
          .filter((a) => a.lastSentAt === null || a.lastSentAt < cutoff)
          .map((a) => ({ ...a }));
      }
      if (op === "select" && table === "users") return [{ name: "Ada", subscriptionStatus: init.subscription ?? "active" }];
      if (op === "select" && table === "jobs") {
        return Array.from({ length: state.matches }, (_, i) => ({
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
      limit: () => b,
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
      return { id };
    } finally {
      inFlight.delete(key);
    }
  });
  return { send, delivered };
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

describe("send-then-advance", () => {
  const now = new Date("2026-09-25T08:00:05Z");
  const clock = () => now;

  it("sends once, then advances the marker", async () => {
    const { db, store } = fakeDb([alert()]);
    const resend = fakeResend();
    const r = await processAlerts("daily", { db, sendEmail: resend.send as never, now: clock });
    expect(r).toMatchObject({ candidates: 1, sent: 1, deduplicated: 0, skippedInFlight: 0, failed: 0 });
    expect(resend.delivered).toEqual(["job-alert/1/first"]);
    expect(store.get(1)!.lastSentAt).toEqual(now);
  });

  it("sends BEFORE the only UPDATE, which is conditional on the marker the key came from", async () => {
    const previous = new Date(now.getTime() - 24 * HOUR);
    const { db, log } = fakeDb([alert({ lastSentAt: previous })]);
    const order: string[] = [];
    const send = jest.fn(async () => {
      order.push(`send after ${log.filter((l) => l.op === "update").length} update(s)`);
      return { id: "m1" };
    });
    await processAlerts("daily", { db, sendEmail: send as never, now: clock });
    expect(order).toEqual(["send after 0 update(s)"]);
    const updates = log.filter((l) => l.op === "update");
    expect(updates).toHaveLength(1);
    expect(updates[0]!.where!.sql).toBe('("user_alerts"."id" = $1 and "user_alerts"."last_sent_at" = $2)');
    expect(updates[0]!.where!.params).toEqual([1, previous.toISOString()]);
  });

  it("a never-sent alert advances with IS NULL (the IS NOT DISTINCT FROM null case)", async () => {
    const { db, log } = fakeDb([alert()]);
    await processAlerts("daily", { db, sendEmail: fakeResend().send as never, now: clock });
    const update = log.find((l) => l.op === "update")!;
    expect(update.where!.sql).toBe('("user_alerts"."id" = $1 and "user_alerts"."last_sent_at" is null)');
    expect(update.where!.params).toEqual([1]);
  });

  it("a re-run / Trigger retry of the same slot does not even see the alert", async () => {
    const { db } = fakeDb([alert()]);
    const resend = fakeResend();
    await processAlerts("daily", { db, sendEmail: resend.send as never, now: clock });
    const later = new Date(now.getTime() + 2 * HOUR);
    const second = await processAlerts("daily", { db, sendEmail: resend.send as never, now: () => later });
    expect(second).toMatchObject({ candidates: 0, sent: 0 });
    expect(resend.send).toHaveBeenCalledTimes(1);
  });

  it("the next period sends again, with a new key", async () => {
    const { db } = fakeDb([alert()]);
    const resend = fakeResend();
    await processAlerts("daily", { db, sendEmail: resend.send as never, now: clock });
    const tomorrow = new Date(now.getTime() + 24 * HOUR);
    const r = await processAlerts("daily", { db, sendEmail: resend.send as never, now: () => tomorrow });
    expect(r.sent).toBe(1);
    expect(resend.delivered).toEqual(["job-alert/1/first", `job-alert/1/${now.getTime()}`]);
  });

  it("a send failure leaves the marker untouched (no UPDATE at all), so the retry sends it", async () => {
    const previous = new Date(now.getTime() - 24 * HOUR);
    const { db, store, log } = fakeDb([alert({ lastSentAt: previous })]);
    const failing = jest.fn(async () => {
      throw new Error("resend 503");
    });
    const first = await processAlerts("daily", { db, sendEmail: failing as never, now: clock });
    expect(first).toMatchObject({ sent: 0, failed: 1 });
    expect(log.some((l) => l.op === "update")).toBe(false);
    expect(store.get(1)!.lastSentAt).toEqual(previous);

    const resend = fakeResend();
    const retry = await processAlerts("daily", { db, sendEmail: resend.send as never, now: clock });
    expect(retry.sent).toBe(1);
    expect(keysOf(resend.send)).toEqual(keysOf(failing));
    expect(resend.delivered).toHaveLength(1);
  });

  it("the candidate query excludes alerts already sent in this period (so retries continue, not restart)", async () => {
    const { db, log } = fakeDb([alert({ frequency: "weekly" })]);
    await processAlerts("weekly", { db, sendEmail: fakeResend().send as never, now: clock });
    const select = log.find((l) => l.op === "select" && l.table === "user_alerts")!;
    expect(select.where!.sql).toContain('("user_alerts"."last_sent_at" is null or "user_alerts"."last_sent_at" < $');
    expect(select.where!.params).toContain(alertPeriodCutoff("weekly", now).toISOString());
  });

  it("never sends (or writes) when there is nothing to send", async () => {
    const { db, log, store } = fakeDb([alert()], { matches: 0 });
    const send = jest.fn();
    const r = await processAlerts("daily", { db, sendEmail: send as never, now: clock });
    expect(r.skippedNoMatches).toBe(1);
    expect(send).not.toHaveBeenCalled();
    expect(log.some((l) => l.op === "update")).toBe(false);
    expect(store.get(1)!.lastSentAt).toBeNull();
  });

  it("skips non-subscribers and criteria-less alerts without writing", async () => {
    const send = jest.fn();
    const a = fakeDb([alert()], { subscription: "canceled" });
    expect((await processAlerts("daily", { db: a.db, sendEmail: send as never, now: clock })).skippedNotEligible).toBe(1);
    const b = fakeDb([alert({ criteria: {} })]);
    expect((await processAlerts("daily", { db: b.db, sendEmail: send as never, now: clock })).skippedNoCriteria).toBe(1);
    expect(send).not.toHaveBeenCalled();
    expect([...a.log, ...b.log].some((l) => l.op === "update")).toBe(false);
  });
});

describe("crash between the send and the advance", () => {
  const now = new Date("2026-09-25T08:00:05Z");

  it("the retry re-sends with the SAME key; Resend dedupes (payload changed: 409 replay) and the marker advances", async () => {
    const previous = new Date(now.getTime() - 24 * HOUR);
    const { db, store, state } = fakeDb([alert({ lastSentAt: previous })]);
    const resend = fakeResend();
    state.failUpdates = 1; // Resend accepts, then the advance never lands.
    const first = await processAlerts("daily", { db, sendEmail: resend.send as never, now: () => now });
    expect(first).toMatchObject({ sent: 0, deduplicated: 0, failed: 1 });
    expect(store.get(1)!.lastSentAt).toEqual(previous);
    expect(resend.delivered).toEqual([`job-alert/1/${previous.getTime()}`]);

    state.matches = 3; // a new job matched meanwhile, so the retry's payload differs
    const later = new Date(now.getTime() + 5 * 60_000);
    const retry = await processAlerts("daily", { db, sendEmail: resend.send as never, now: () => later });
    expect(retry).toMatchObject({ sent: 0, deduplicated: 1, failed: 0 });
    expect(keysOf(resend.send)).toEqual([`job-alert/1/${previous.getTime()}`, `job-alert/1/${previous.getTime()}`]);
    expect(resend.delivered).toHaveLength(1); // one email, not two
    expect(store.get(1)!.lastSentAt).toEqual(later);
  });

  it("same payload: Resend answers with the original response; still one email and the marker advances", async () => {
    const { db, store, state } = fakeDb([alert()]);
    const resend = fakeResend();
    state.failUpdates = 1;
    await processAlerts("daily", { db, sendEmail: resend.send as never, now: () => now });
    const later = new Date(now.getTime() + 60_000);
    const retry = await processAlerts("daily", { db, sendEmail: resend.send as never, now: () => later });
    expect(retry).toMatchObject({ sent: 1, failed: 0 });
    expect(resend.delivered).toEqual(["job-alert/1/first"]);
    expect(store.get(1)!.lastSentAt).toEqual(later);
  });

  it("the failed advance makes the run answer non-2xx, so the Trigger retry happens", async () => {
    const { db, state } = fakeDb([alert()]);
    state.failUpdates = 1;
    const err = (await runJobAlerts(["daily"], { db, sendEmail: fakeResend().send as never, now: () => now }).catch(
      (e: unknown) => e,
    )) as CronWorkError;
    expect(err).toBeInstanceOf(CronWorkError);
    expect(err.cronDetails).toMatchObject({ sent: 0, failed: 1 });
    expect(errSpy.mock.calls.some((c) => String(c[1]).includes("email accepted but the period could not be recorded"))).toBe(true);
  });
});

describe("overlapping runs", () => {
  const now = new Date("2026-09-25T08:00:05Z");

  it("one run's send is still in flight: the other does not record the period; one email", async () => {
    const { db, store } = fakeDb([alert()]);
    const resend = fakeResend({ latencyMs: 5 });
    const [a, b] = await Promise.all([
      processAlerts("daily", { db, sendEmail: resend.send as never, now: () => now }),
      processAlerts("daily", { db, sendEmail: resend.send as never, now: () => now }),
    ]);
    expect(a.sent + b.sent).toBe(1);
    expect(a.skippedInFlight + b.skippedInFlight).toBe(1);
    expect(a.failed + b.failed).toBe(0);
    expect(resend.delivered).toHaveLength(1);
    expect(store.get(1)!.lastSentAt).toEqual(now);
  });

  it("one accepted, one deduplicated: the late run's conditional advance is a no-op", async () => {
    const { db, store } = fakeDb([alert()]);
    const resend = fakeResend();
    const tA = now;
    const tB = new Date(now.getTime() + 1000);
    let finishA: () => void = () => {};
    const aDone = new Promise<void>((r) => (finishA = r));
    // Both runs read the candidate first; B's send only reaches Resend after A has sent AND advanced.
    const lateSend = jest.fn(async (args: SendArgs) => {
      await aDone;
      return resend.send(args);
    });
    const [a, b] = await Promise.all([
      processAlerts("daily", { db, sendEmail: resend.send as never, now: () => tA }).finally(() => finishA()),
      processAlerts("daily", { db, sendEmail: lateSend as never, now: () => tB }),
    ]);
    expect(a).toMatchObject({ sent: 1, deduplicated: 0 });
    expect(b).toMatchObject({ sent: 0, deduplicated: 1, failed: 0 });
    expect(keysOf(lateSend)).toEqual(["job-alert/1/first"]);
    expect(resend.delivered).toEqual(["job-alert/1/first"]);
    expect(store.get(1)!.lastSentAt).toEqual(tA); // B did not overwrite A's marker
  });

  it("an in-flight skip makes runJobAlerts answer non-2xx, so a retry re-checks it", async () => {
    const { db } = fakeDb([alert()]);
    const inFlight = jest.fn(async () => ({ id: null, deduplicated: true, reason: "in_flight" }));
    const err = (await runJobAlerts(["daily"], { db, sendEmail: inFlight as never, now: () => now }).catch(
      (e: unknown) => e,
    )) as CronWorkError;
    expect(err).toBeInstanceOf(CronWorkError);
    expect(err.cronDetails).toMatchObject({ sent: 0, skippedInFlight: 1, failed: 0 });
  });
});

describe("advanceAlertMarker (conditional advance)", () => {
  const previous = new Date("2026-09-24T08:00:05Z");
  const sentAt = new Date("2026-09-25T08:00:05Z");

  it("advances while the marker still holds the previous value", async () => {
    const { db, store } = fakeDb([alert({ lastSentAt: previous })]);
    await expect(advanceAlertMarker(db, 1, previous, sentAt)).resolves.toBe(true);
    expect(store.get(1)!.lastSentAt).toEqual(sentAt);
  });

  it("is a no-op when another run already advanced it", async () => {
    const other = new Date("2026-09-25T08:00:01Z");
    const { db, store } = fakeDb([alert({ lastSentAt: other })]);
    await expect(advanceAlertMarker(db, 1, previous, sentAt)).resolves.toBe(false);
    await expect(advanceAlertMarker(db, 1, null, sentAt)).resolves.toBe(false);
    expect(store.get(1)!.lastSentAt).toEqual(other);
  });
});

describe("Resend idempotency key", () => {
  const now = new Date("2026-09-25T08:00:05Z");

  it("keys every send on the alert id and the period's previous last_sent_at", async () => {
    const previous = new Date(now.getTime() - 24 * HOUR);
    const { db } = fakeDb([alert(), alert({ id: 2, lastSentAt: previous })]);
    const resend = fakeResend();
    await processAlerts("daily", { db, sendEmail: resend.send as never, now: () => now });
    expect(keysOf(resend.send)).toEqual(["job-alert/1/first", `job-alert/2/${previous.getTime()}`]);
    expect(jobAlertIdempotencyKey(2, previous)).toBe(`job-alert/2/${previous.getTime()}`);
  });

  it("a lost response (Resend accepted, the send threw) is resent with the same key and delivered once", async () => {
    const previous = new Date(now.getTime() - 24 * HOUR);
    const { db, store } = fakeDb([alert({ lastSentAt: previous })]);
    const resend = fakeResend();
    const lost = jest.fn(async (args: SendArgs) => {
      await resend.send(args);
      throw new Error("Unable to fetch data. The request could not be resolved.");
    });
    const first = await processAlerts("daily", { db, sendEmail: lost as never, now: () => now });
    expect(first.failed).toBe(1);
    expect(store.get(1)!.lastSentAt).toEqual(previous);

    const later = new Date(now.getTime() + 30_000);
    const retry = await processAlerts("daily", { db, sendEmail: resend.send as never, now: () => later });
    expect(retry).toMatchObject({ failed: 0 });
    expect(keysOf(lost)).toEqual(keysOf(resend.send).slice(-1));
    expect(resend.delivered).toHaveLength(1);
    expect(store.get(1)!.lastSentAt).toEqual(later);
  });

  it("a 409 replay counts as deduplicated, advances the marker and does not fail the run", async () => {
    const { db, store } = fakeDb([alert()]);
    const replay = jest.fn(async () => ({ id: null, deduplicated: true, reason: "replayed" }));
    const out = await runJobAlerts(["daily"], { db, sendEmail: replay as never, now: () => now });
    expect(out).toMatchObject({ sent: 0, deduplicated: 1, skippedInFlight: 0, failed: 0 });
    expect(out.runs[0]).toMatchObject({ sent: 0, deduplicated: 1 });
    expect(store.get(1)!.lastSentAt).toEqual(now);
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
  const now = new Date("2026-09-25T08:00:05Z");

  it("returns aggregate counters when everything went out", async () => {
    const { db } = fakeDb([alert(), alert({ id: 2, frequency: "twice_daily" })]);
    const resend = fakeResend();
    const out = await runJobAlerts(["daily", "twice_daily"], { db, sendEmail: resend.send as never, now: () => now });
    expect(out).toMatchObject({ sent: 2, deduplicated: 0, skippedInFlight: 0, failed: 0, deferred: 0 });
    expect(resend.delivered).toEqual(["job-alert/1/first", "job-alert/2/first"]);
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
