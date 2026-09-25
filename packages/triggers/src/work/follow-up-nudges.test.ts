jest.mock("@ever-hust/email", () => ({ sendFollowUpNudgeEmail: jest.fn() }));

import { getTableName, type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { CronWorkError } from "./errors";
import {
  NUDGE_COOLDOWN_DAYS,
  advanceNudgeMarker,
  nudgeCooldownCutoff,
  nudgeIdempotencyKey,
  processFollowUpNudges,
  resolveFollowUpNudgesEnabled,
  runFollowUpNudges,
} from "./follow-up-nudges";

const dialect = new PgDialect();
const render = (w: unknown) => {
  const q = dialect.sqlToQuery(w as SQL);
  return { sql: q.sql.replace(/\s+/g, " "), params: q.params };
};
const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-09-25T09:00:00Z");

interface UserRow {
  id: string;
  lastFollowUpNudgeAt: Date | null;
  preferences: Record<string, unknown> | null;
}

/**
 * Query-builder fake: one "applied" application per user, 30 days stale (always due). The
 * candidate SELECT applies the cooldown filter like the real query; the advance UPDATE only
 * applies while `last_follow_up_nudge_at IS NOT DISTINCT FROM <previous>`; `state.failUpdates`
 * makes the next N updates throw (a crash between the send and the advance).
 */
function fakeDb(users: UserRow[]) {
  const store = new Map(users.map((u) => [u.id, { ...u }]));
  const state = { failUpdates: 0, jobTitle: "Engineer" };
  const log: { op: string; table: string; where?: { sql: string; params: unknown[] } }[] = [];
  function builder(op: string, table0?: unknown) {
    const st: { table?: unknown; where?: unknown; set?: Record<string, unknown> } = { table: table0 };
    const run = async (): Promise<unknown[]> => {
      const table = getTableName(st.table as never);
      const where = st.where ? render(st.where) : undefined;
      log.push({ op, table, where });
      if (op === "select" && table === "applications") {
        const cutoff = new Date(where!.params.at(-1) as string);
        return [...store.values()]
          .filter((u) => u.lastFollowUpNudgeAt === null || u.lastFollowUpNudgeAt <= cutoff)
          .map((u, i) => ({
            userId: u.id,
            applicationId: i + 1,
            stage: "applied",
            stageChangedAt: new Date(NOW.getTime() - 30 * DAY),
            followUpCount: 0,
            lastFollowUpAt: null,
            jobTitle: state.jobTitle,
            companyName: "Acme",
            userName: "Ada",
            userEmail: `${u.id}@example.com`,
            preferences: u.preferences,
            lastFollowUpNudgeAt: u.lastFollowUpNudgeAt,
          }));
      }
      if (op === "update" && table === "users") {
        if (state.failUpdates > 0) {
          state.failUpdates--;
          throw new Error("connection terminated unexpectedly");
        }
        const id = where!.params[0] as string;
        const row = store.get(id)!;
        const stillAtPrevious = where!.sql.includes('"last_follow_up_nudge_at" is null')
          ? row.lastFollowUpNudgeAt === null
          : row.lastFollowUpNudgeAt?.getTime() === new Date(where!.params[1] as string).getTime();
        if (!stillAtPrevious) return [];
        row.lastFollowUpNudgeAt = st.set!.lastFollowUpNudgeAt as Date;
        return [{ id }];
      }
      throw new Error(`unexpected ${op} on ${table}`);
    };
    const b = {
      from: (t: unknown) => ((st.table = t), b),
      innerJoin: () => b,
      where: (w: unknown) => ((st.where = w), b),
      set: (v: Record<string, unknown>) => ((st.set = v), b),
      limit: () => b,
      returning: () => b,
      then: (res: (v: unknown[]) => unknown, rej: (e: unknown) => unknown) => run().then(res, rej),
    };
    return b;
  }
  return {
    db: { select: () => builder("select"), update: (t: unknown) => builder("update", t) } as never,
    store,
    state,
    log,
  };
}

type SendArgs = { idempotencyKey?: string } & Record<string, unknown>;

/** Resend idempotency semantics in memory (the same fake as in job-alerts.test.ts). */
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

let errSpy: jest.SpyInstance;
beforeEach(() => {
  errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => errSpy.mockRestore());

describe("follow-up nudges: send-then-advance", () => {
  it("sends, then advances the marker", async () => {
    const { db, store } = fakeDb([{ id: "u1", lastFollowUpNudgeAt: null, preferences: null }]);
    const resend = fakeResend();
    const r = await processFollowUpNudges(NOW, { db, sendEmail: resend.send as never });
    expect(r).toMatchObject({ sent: 1, deduplicated: 0, skippedInFlight: 0, failed: 0 });
    expect(resend.delivered).toEqual(["follow-up-nudge/u1/first"]);
    expect(store.get("u1")!.lastFollowUpNudgeAt).toEqual(NOW);
  });

  it("a retry / re-run inside the cooldown does not see the user", async () => {
    const { db } = fakeDb([{ id: "u1", lastFollowUpNudgeAt: null, preferences: null }]);
    const resend = fakeResend();
    await processFollowUpNudges(NOW, { db, sendEmail: resend.send as never });
    const second = await processFollowUpNudges(new Date(NOW.getTime() + 60_000), { db, sendEmail: resend.send as never });
    expect(second).toMatchObject({ users: 0, sent: 0 });
    expect(resend.send).toHaveBeenCalledTimes(1);
  });

  it("a send failure leaves the marker untouched (no UPDATE), so the retry sends it with the same key", async () => {
    const previous = new Date(NOW.getTime() - 10 * DAY);
    const { db, store, log } = fakeDb([{ id: "u1", lastFollowUpNudgeAt: previous, preferences: null }]);
    const failing = jest.fn(async () => {
      throw new Error("resend down");
    });
    const r = await processFollowUpNudges(NOW, { db, sendEmail: failing as never });
    expect(r).toMatchObject({ sent: 0, failed: 1 });
    expect(log.some((l) => l.op === "update")).toBe(false);
    expect(store.get("u1")!.lastFollowUpNudgeAt).toEqual(previous);
    const resend = fakeResend();
    const retry = await processFollowUpNudges(NOW, { db, sendEmail: resend.send as never });
    expect(retry.sent).toBe(1);
    expect(keysOf(resend.send)).toEqual(keysOf(failing));
  });

  it("crash between send and advance: the retry re-sends with the SAME key, Resend dedupes, the marker advances", async () => {
    const previous = new Date(NOW.getTime() - 10 * DAY);
    const { db, store, state } = fakeDb([{ id: "u1", lastFollowUpNudgeAt: previous, preferences: null }]);
    const resend = fakeResend();
    state.failUpdates = 1;
    const first = await processFollowUpNudges(NOW, { db, sendEmail: resend.send as never });
    expect(first).toMatchObject({ sent: 0, failed: 1 });
    expect(store.get("u1")!.lastFollowUpNudgeAt).toEqual(previous);

    state.jobTitle = "Senior Engineer"; // the retry's digest differs → Resend answers with a 409 replay
    const later = new Date(NOW.getTime() + 5 * 60_000);
    const retry = await processFollowUpNudges(later, { db, sendEmail: resend.send as never });
    expect(retry).toMatchObject({ sent: 0, deduplicated: 1, failed: 0 });
    const key = `follow-up-nudge/u1/${previous.getTime()}`;
    expect(keysOf(resend.send)).toEqual([key, key]);
    expect(resend.delivered).toEqual([key]);
    expect(store.get("u1")!.lastFollowUpNudgeAt).toEqual(later);
  });

  it("two overlapping runs, one still in flight: the other does not record it; one email", async () => {
    const { db } = fakeDb([{ id: "u1", lastFollowUpNudgeAt: null, preferences: null }]);
    const resend = fakeResend({ latencyMs: 5 });
    const [a, b] = await Promise.all([
      processFollowUpNudges(NOW, { db, sendEmail: resend.send as never }),
      processFollowUpNudges(NOW, { db, sendEmail: resend.send as never }),
    ]);
    expect(a.sent + b.sent).toBe(1);
    expect(a.skippedInFlight + b.skippedInFlight).toBe(1);
    expect(resend.delivered).toHaveLength(1);
  });

  it("two overlapping runs: one accepted, one deduplicated (the late conditional advance is a no-op)", async () => {
    const { db, store } = fakeDb([{ id: "u1", lastFollowUpNudgeAt: null, preferences: null }]);
    const resend = fakeResend();
    let finishA: () => void = () => {};
    const aDone = new Promise<void>((r) => (finishA = r));
    const lateSend = jest.fn(async (args: SendArgs) => {
      await aDone;
      return resend.send(args);
    });
    const tB = new Date(NOW.getTime() + 1000);
    const [a, b] = await Promise.all([
      processFollowUpNudges(NOW, { db, sendEmail: resend.send as never }).finally(() => finishA()),
      processFollowUpNudges(tB, { db, sendEmail: lateSend as never }),
    ]);
    expect(a).toMatchObject({ sent: 1, deduplicated: 0 });
    expect(b).toMatchObject({ sent: 0, deduplicated: 1, failed: 0 });
    expect(resend.delivered).toEqual(["follow-up-nudge/u1/first"]);
    expect(store.get("u1")!.lastFollowUpNudgeAt).toEqual(NOW);
  });

  it("respects the opt-out", async () => {
    const { db } = fakeDb([{ id: "u1", lastFollowUpNudgeAt: null, preferences: { followUpNudges: false } }]);
    const send = jest.fn();
    const r = await processFollowUpNudges(NOW, { db, sendEmail: send as never });
    expect(r.skippedOptedOut).toBe(1);
    expect(send).not.toHaveBeenCalled();
  });

  it("advances with a conditional UPDATE on the previous marker and filters candidates on the cooldown", async () => {
    const previous = new Date(NOW.getTime() - 10 * DAY);
    const { db, log } = fakeDb([
      { id: "u1", lastFollowUpNudgeAt: null, preferences: null },
      { id: "u2", lastFollowUpNudgeAt: previous, preferences: null },
    ]);
    await processFollowUpNudges(NOW, { db, sendEmail: fakeResend().send as never });
    const cutoff = nudgeCooldownCutoff(NOW).toISOString();
    expect(cutoff).toBe(new Date(NOW.getTime() - NUDGE_COOLDOWN_DAYS * DAY).toISOString());
    const updates = log.filter((l) => l.op === "update");
    expect(updates.map((u) => u.where!.sql)).toEqual([
      '("users"."id" = $1 and "users"."last_follow_up_nudge_at" is null)',
      '("users"."id" = $1 and "users"."last_follow_up_nudge_at" = $2)',
    ]);
    expect(updates[1]!.where!.params).toEqual(["u2", previous.toISOString()]);
    const select = log.find((l) => l.op === "select")!;
    expect(select.where!.sql).toContain('("users"."last_follow_up_nudge_at" is null or "users"."last_follow_up_nudge_at" <= $');
    expect(select.where!.params.at(-1)).toBe(cutoff);
  });

  it("advanceNudgeMarker is a no-op once another run advanced the marker", async () => {
    const other = new Date(NOW.getTime() - 1000);
    const { db, store } = fakeDb([{ id: "u1", lastFollowUpNudgeAt: other, preferences: null }]);
    await expect(advanceNudgeMarker(db, "u1", null, NOW)).resolves.toBe(false);
    await expect(advanceNudgeMarker(db, "u1", new Date(other.getTime() - 1), NOW)).resolves.toBe(false);
    expect(store.get("u1")!.lastFollowUpNudgeAt).toEqual(other);
    await expect(advanceNudgeMarker(db, "u1", other, NOW)).resolves.toBe(true);
    expect(store.get("u1")!.lastFollowUpNudgeAt).toEqual(NOW);
  });

  it("runFollowUpNudges throws CronWorkError (→ non-2xx) on deferrals and on in-flight skips", async () => {
    const { db } = fakeDb([
      { id: "u1", lastFollowUpNudgeAt: null, preferences: null },
      { id: "u2", lastFollowUpNudgeAt: null, preferences: null },
    ]);
    const err = (await runFollowUpNudges({
      db,
      now: NOW,
      sendEmail: jest.fn(async () => ({})) as never,
      clock: () => 1_000,
      deadline: 0,
      envEnabled: "true",
    }).catch((e: unknown) => e)) as CronWorkError;
    expect(err).toBeInstanceOf(CronWorkError);
    expect(err.cronDetails).toMatchObject({ enabled: true, deferred: 2, sent: 0 });

    const inFlight = fakeDb([{ id: "u1", lastFollowUpNudgeAt: null, preferences: null }]);
    const err2 = (await runFollowUpNudges({
      db: inFlight.db,
      now: NOW,
      sendEmail: jest.fn(async () => ({ id: null, deduplicated: true, reason: "in_flight" })) as never,
      envEnabled: "true",
    }).catch((e: unknown) => e)) as CronWorkError;
    expect(err2).toBeInstanceOf(CronWorkError);
    expect(err2.cronDetails).toMatchObject({ skippedInFlight: 1, failed: 0 });
    expect(inFlight.store.get("u1")!.lastFollowUpNudgeAt).toBeNull();
  });
});

describe("FOLLOW_UP_NUDGES_ENABLED kill switch (default OFF)", () => {
  /** Any database access fails the test: a disabled run must not even read. */
  const untouchableDb = new Proxy(
    {},
    {
      get(_t, prop) {
        throw new Error(`database touched while disabled: ${String(prop)}`);
      },
    },
  ) as never;

  const saved = process.env.FOLLOW_UP_NUDGES_ENABLED;
  afterEach(() => {
    if (saved === undefined) delete process.env.FOLLOW_UP_NUDGES_ENABLED;
    else process.env.FOLLOW_UP_NUDGES_ENABLED = saved;
  });

  it.each([
    [undefined, false],
    ["", false],
    ["false", false],
    ["off", false],
    ["enabled-please", false],
    ["true", true],
    [" TRUE ", true],
    ["1", true],
    ["yes", true],
    ["on", true],
  ])("%p resolves to %p", (raw, expected) => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    expect(resolveFollowUpNudgesEnabled(raw)).toBe(expected);
    warn.mockRestore();
  });

  it("unset in the environment: the run answers 2xx with skipped=disabled and touches nothing", async () => {
    delete process.env.FOLLOW_UP_NUDGES_ENABLED;
    const send = jest.fn();
    const out = await runFollowUpNudges({ db: untouchableDb, sendEmail: send as never, now: NOW });
    expect(out).toMatchObject({ enabled: false, skipped: "disabled", sent: 0, users: 0, failed: 0, skippedInFlight: 0 });
    expect(send).not.toHaveBeenCalled();
  });

  it("an explicit envEnabled overrides the process env", async () => {
    process.env.FOLLOW_UP_NUDGES_ENABLED = "true";
    const out = await runFollowUpNudges({ db: untouchableDb, now: NOW, envEnabled: "false" });
    expect(out.skipped).toBe("disabled");
  });

  it("control: enabled, the same run reads, sends and advances", async () => {
    process.env.FOLLOW_UP_NUDGES_ENABLED = "true";
    const { db, store } = fakeDb([{ id: "u1", lastFollowUpNudgeAt: null, preferences: null }]);
    const send = jest.fn(async () => ({ id: "m1" }));
    const out = await runFollowUpNudges({ db, sendEmail: send as never, now: NOW });
    expect(out).toMatchObject({ enabled: true, sent: 1 });
    expect(out.skipped).toBeUndefined();
    expect(send).toHaveBeenCalledTimes(1);
    expect(store.get("u1")!.lastFollowUpNudgeAt).toEqual(NOW);
  });
});

describe("Resend idempotency key", () => {
  it("keys the send on the user and the window's previous nudge time", async () => {
    const previous = new Date(NOW.getTime() - 10 * DAY);
    const { db } = fakeDb([
      { id: "u1", lastFollowUpNudgeAt: null, preferences: null },
      { id: "u2", lastFollowUpNudgeAt: previous, preferences: null },
    ]);
    const resend = fakeResend();
    await processFollowUpNudges(NOW, { db, sendEmail: resend.send as never });
    expect(keysOf(resend.send)).toEqual(["follow-up-nudge/u1/first", `follow-up-nudge/u2/${previous.getTime()}`]);
    expect(nudgeIdempotencyKey("u2", previous)).toBe(`follow-up-nudge/u2/${previous.getTime()}`);
  });

  it("a lost response is resent with the SAME key (delivered once); the next window gets a new one", async () => {
    const previous = new Date(NOW.getTime() - 10 * DAY);
    const { db } = fakeDb([{ id: "u1", lastFollowUpNudgeAt: previous, preferences: null }]);
    const resend = fakeResend();
    const lost = jest.fn(async (args: SendArgs) => {
      await resend.send(args);
      throw new Error("Unable to fetch data. The request could not be resolved.");
    });
    await processFollowUpNudges(NOW, { db, sendEmail: lost as never });
    const retryAt = new Date(NOW.getTime() + 60_000);
    const retry = await processFollowUpNudges(retryAt, { db, sendEmail: resend.send as never });
    expect(retry.failed).toBe(0);
    expect(keysOf(lost)).toEqual(keysOf(resend.send).slice(-1));
    expect(resend.delivered).toHaveLength(1);

    const later = new Date(retryAt.getTime() + (NUDGE_COOLDOWN_DAYS + 1) * DAY);
    await processFollowUpNudges(later, { db, sendEmail: resend.send as never });
    expect(keysOf(resend.send).at(-1)).toBe(`follow-up-nudge/u1/${retryAt.getTime()}`);
    expect(resend.delivered).toHaveLength(2);
  });

  it("a 409 replay counts as deduplicated, advances the marker and is not a failure", async () => {
    const { db, store } = fakeDb([{ id: "u1", lastFollowUpNudgeAt: null, preferences: null }]);
    const replay = jest.fn(async () => ({ id: null, deduplicated: true, reason: "replayed" }));
    const out = await runFollowUpNudges({ db, sendEmail: replay as never, now: NOW, envEnabled: "true" });
    expect(out).toMatchObject({ sent: 0, deduplicated: 1, failed: 0 });
    expect(store.get("u1")!.lastFollowUpNudgeAt).toEqual(NOW);
  });
});
