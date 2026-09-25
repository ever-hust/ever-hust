jest.mock("@ever-hust/email", () => ({ sendFollowUpNudgeEmail: jest.fn() }));

import { getTableName, type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { CronWorkError } from "./errors";
import {
  NUDGE_COOLDOWN_DAYS,
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

/** Query-builder fake: one "applied" application per user, 30 days stale (always due). */
function fakeDb(users: UserRow[]) {
  const store = new Map(users.map((u) => [u.id, { ...u }]));
  const log: { op: string; table: string; where?: { sql: string; params: unknown[] } }[] = [];
  function builder(op: string, table0?: unknown) {
    const st: { table?: unknown; where?: unknown; set?: Record<string, unknown>; returning?: boolean } = { table: table0 };
    const run = async (): Promise<unknown[]> => {
      const table = getTableName(st.table as never);
      const where = st.where ? render(st.where) : undefined;
      log.push({ op, table, where });
      if (op === "select" && table === "applications") {
        return [...store.values()].map((u, i) => ({
          userId: u.id,
          applicationId: i + 1,
          stage: "applied",
          stageChangedAt: new Date(NOW.getTime() - 30 * DAY),
          followUpCount: 0,
          lastFollowUpAt: null,
          jobTitle: "Engineer",
          companyName: "Acme",
          userName: "Ada",
          userEmail: `${u.id}@example.com`,
          preferences: u.preferences,
          lastFollowUpNudgeAt: u.lastFollowUpNudgeAt,
        }));
      }
      if (op === "update" && table === "users") {
        const id = where!.params.find((p) => typeof p === "string" && !p.includes("T")) as string;
        const row = store.get(id)!;
        const value = st.set!.lastFollowUpNudgeAt as Date | null;
        const last = new Date(where!.params.at(-1) as string);
        if (st.returning) {
          if (row.lastFollowUpNudgeAt === null || row.lastFollowUpNudgeAt <= last) {
            row.lastFollowUpNudgeAt = value;
            return [{ id }];
          }
          return [];
        }
        if (row.lastFollowUpNudgeAt?.getTime() === last.getTime()) row.lastFollowUpNudgeAt = value;
        return [];
      }
      throw new Error(`unexpected ${op} on ${table}`);
    };
    const b = {
      from: (t: unknown) => ((st.table = t), b),
      innerJoin: () => b,
      where: (w: unknown) => ((st.where = w), b),
      set: (v: Record<string, unknown>) => ((st.set = v), b),
      limit: () => b,
      returning: () => ((st.returning = true), b),
      then: (res: (v: unknown[]) => unknown, rej: (e: unknown) => unknown) => run().then(res, rej),
    };
    return b;
  }
  return { db: { select: () => builder("select"), update: (t: unknown) => builder("update", t) } as never, store, log };
}

let errSpy: jest.SpyInstance;
beforeEach(() => {
  errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => errSpy.mockRestore());

describe("follow-up nudges are sent at most once per cooldown", () => {
  it("sends and claims", async () => {
    const { db, store } = fakeDb([{ id: "u1", lastFollowUpNudgeAt: null, preferences: null }]);
    const send = jest.fn(async () => ({}));
    const r = await processFollowUpNudges(NOW, { db, sendEmail: send as never });
    expect(r).toMatchObject({ sent: 1, failed: 0 });
    expect(store.get("u1")!.lastFollowUpNudgeAt).toEqual(NOW);
  });

  it("a retry / re-run does not re-send", async () => {
    const { db } = fakeDb([{ id: "u1", lastFollowUpNudgeAt: null, preferences: null }]);
    const send = jest.fn(async () => ({}));
    await processFollowUpNudges(NOW, { db, sendEmail: send as never });
    const second = await processFollowUpNudges(new Date(NOW.getTime() + 60_000), { db, sendEmail: send as never });
    expect(second.sent).toBe(0);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("two overlapping runs send one email", async () => {
    const { db } = fakeDb([{ id: "u1", lastFollowUpNudgeAt: null, preferences: null }]);
    const send = jest.fn(async () => {
      await new Promise((r) => setTimeout(r, 5));
      return {};
    });
    const [a, b] = await Promise.all([
      processFollowUpNudges(NOW, { db, sendEmail: send as never }),
      processFollowUpNudges(NOW, { db, sendEmail: send as never }),
    ]);
    expect(a.sent + b.sent).toBe(1);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("releases the claim when the email fails, so the retry sends it", async () => {
    const previous = new Date(NOW.getTime() - 10 * DAY);
    const { db, store } = fakeDb([{ id: "u1", lastFollowUpNudgeAt: previous, preferences: null }]);
    const r = await processFollowUpNudges(NOW, {
      db,
      sendEmail: jest.fn(async () => {
        throw new Error("resend down");
      }) as never,
    });
    expect(r).toMatchObject({ sent: 0, failed: 1 });
    expect(store.get("u1")!.lastFollowUpNudgeAt).toEqual(previous);
    const retry = await processFollowUpNudges(NOW, { db, sendEmail: jest.fn(async () => ({})) as never });
    expect(retry.sent).toBe(1);
  });

  it("respects the opt-out", async () => {
    const { db } = fakeDb([{ id: "u1", lastFollowUpNudgeAt: null, preferences: { followUpNudges: false } }]);
    const send = jest.fn();
    const r = await processFollowUpNudges(NOW, { db, sendEmail: send as never });
    expect(r.skippedOptedOut).toBe(1);
    expect(send).not.toHaveBeenCalled();
  });

  it("claims with a conditional UPDATE on the cooldown and filters candidates the same way", async () => {
    const { db, log } = fakeDb([{ id: "u1", lastFollowUpNudgeAt: null, preferences: null }]);
    await processFollowUpNudges(NOW, { db, sendEmail: jest.fn(async () => ({})) as never });
    const cutoff = nudgeCooldownCutoff(NOW).toISOString();
    expect(cutoff).toBe(new Date(NOW.getTime() - NUDGE_COOLDOWN_DAYS * DAY).toISOString());
    const claim = log.find((l) => l.op === "update")!;
    expect(claim.where!.sql).toBe(
      '("users"."id" = $1 and ("users"."last_follow_up_nudge_at" is null or "users"."last_follow_up_nudge_at" <= $2))',
    );
    expect(claim.where!.params).toEqual(["u1", cutoff]);
    const select = log.find((l) => l.op === "select")!;
    expect(select.where!.sql).toContain('("users"."last_follow_up_nudge_at" is null or "users"."last_follow_up_nudge_at" <= $');
  });

  it("runFollowUpNudges throws CronWorkError (→ non-2xx) on failures or deferrals", async () => {
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
    expect(out).toMatchObject({ enabled: false, skipped: "disabled", sent: 0, users: 0, failed: 0 });
    expect(send).not.toHaveBeenCalled();
  });

  it("an explicit envEnabled overrides the process env", async () => {
    process.env.FOLLOW_UP_NUDGES_ENABLED = "true";
    const out = await runFollowUpNudges({ db: untouchableDb, now: NOW, envEnabled: "false" });
    expect(out.skipped).toBe("disabled");
  });

  it("control: enabled, the same run reads, claims and sends", async () => {
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

describe("Resend idempotency key (an ambiguous send failure cannot duplicate the nudge)", () => {
  type SendArgs = { idempotencyKey?: string };
  const keysOf = (send: jest.Mock) => send.mock.calls.map((c) => (c[0] as SendArgs).idempotencyKey);

  it("keys the send on the user and the window's previous nudge time", async () => {
    const previous = new Date(NOW.getTime() - 10 * DAY);
    const { db } = fakeDb([
      { id: "u1", lastFollowUpNudgeAt: null, preferences: null },
      { id: "u2", lastFollowUpNudgeAt: previous, preferences: null },
    ]);
    const send = jest.fn(async () => ({ id: "m" }));
    await processFollowUpNudges(NOW, { db, sendEmail: send as never });
    expect(keysOf(send)).toEqual(["follow-up-nudge/u1/first", `follow-up-nudge/u2/${previous.getTime()}`]);
    expect(nudgeIdempotencyKey("u2", previous)).toBe(`follow-up-nudge/u2/${previous.getTime()}`);
  });

  it("a retry after a failed (possibly delivered) send reuses the SAME key; the next window gets a new one", async () => {
    const previous = new Date(NOW.getTime() - 10 * DAY);
    const { db } = fakeDb([{ id: "u1", lastFollowUpNudgeAt: previous, preferences: null }]);
    const lost = jest.fn(async () => {
      throw new Error("Unable to fetch data. The request could not be resolved.");
    });
    await processFollowUpNudges(NOW, { db, sendEmail: lost as never });
    const ok = jest.fn(async () => ({ id: "m1" }));
    await processFollowUpNudges(new Date(NOW.getTime() + 60_000), { db, sendEmail: ok as never });
    expect(keysOf(lost)).toEqual(keysOf(ok));

    const later = new Date(NOW.getTime() + (NUDGE_COOLDOWN_DAYS + 1) * DAY);
    const next = jest.fn(async () => ({ id: "m2" }));
    await processFollowUpNudges(later, { db, sendEmail: next as never });
    expect(keysOf(next)[0]).not.toBe(keysOf(ok)[0]);
  });

  it("a replay Resend reports as already-used counts as deduplicated, keeps the claim and is not a failure", async () => {
    const { db, store } = fakeDb([{ id: "u1", lastFollowUpNudgeAt: null, preferences: null }]);
    const replay = jest.fn(async () => ({ id: null, deduplicated: true }));
    const out = await runFollowUpNudges({ db, sendEmail: replay as never, now: NOW, envEnabled: "true" });
    expect(out).toMatchObject({ sent: 0, deduplicated: 1, failed: 0 });
    expect(store.get("u1")!.lastFollowUpNudgeAt).toEqual(NOW);
  });
});
