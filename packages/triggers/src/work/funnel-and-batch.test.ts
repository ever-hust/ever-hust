jest.mock("@ever-hust/ai", () => ({
  getModelForUser: jest.fn(() => "model"),
  runEvaluateJob: jest.fn(),
  planBatchEvaluation: (candidates: { jobId: number }[], opts: { max?: number }) => ({
    toEvaluate: candidates.slice(0, opts.max ?? 50).map((c) => c.jobId),
    skipped: candidates.slice(opts.max ?? 50).map((c) => ({ jobId: c.jobId, reason: "over_quota" })),
  }),
}));

import { getTableName, type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { CronInputError, CronWorkError } from "./errors";
import { processFunnelSnapshots, startOfUtcDay } from "./funnel-snapshots";
import {
  BATCH_EVALUATE_ABORT_GRACE_MS,
  BATCH_EVALUATE_BUDGET_MS,
  BATCH_EVALUATE_RESPONSE_LIMIT_MS,
  runBatchEvaluate,
} from "./batch-evaluate";

const dialect = new PgDialect();

function selectFake(results: Record<string, unknown[]>, opts: { locked?: boolean } = {}) {
  const inserted: unknown[][] = [];
  const wheres: { table: string; sql: string; params: unknown[] }[] = [];
  /** Every operation in order, tagged with whether it ran inside `transaction()`. */
  const ops: { op: string; inTx: boolean }[] = [];
  let inTx = false;
  const builder = (table0?: unknown) => {
    const st: { table?: unknown; where?: unknown; values?: unknown[] } = { table: table0 };
    const b = {
      from: (t: unknown) => ((st.table = t), b),
      leftJoin: () => b,
      where: (w: unknown) => {
        st.where = w;
        const q = dialect.sqlToQuery(w as SQL);
        wheres.push({ table: getTableName(st.table as never), sql: q.sql, params: q.params });
        return b;
      },
      limit: () => b,
      values: (v: unknown[]) => ((st.values = v), b),
      then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
        Promise.resolve()
          .then(() => {
            const table = getTableName(st.table as never);
            ops.push({ op: `${st.values ? "insert" : "select"} ${table}`, inTx });
            if (st.values) {
              inserted.push(st.values);
              return [];
            }
            return results[table] ?? [];
          })
          .then(res, rej),
    };
    return b;
  };
  const client = {
    select: () => builder(),
    selectDistinct: () => builder(),
    insert: (t: unknown) => builder(t),
    execute: async (q: SQL) => {
      ops.push({ op: dialect.sqlToQuery(q).sql, inTx });
      return [{ locked: opts.locked ?? true }];
    },
  };
  const db = {
    ...client,
    transaction: async <T>(fn: (tx: typeof client) => Promise<T>): Promise<T> => {
      inTx = true;
      try {
        return await fn(client);
      } finally {
        inTx = false;
      }
    },
  };
  return { db: db as never, inserted, wheres, ops };
}

describe("processFunnelSnapshots", () => {
  const now = new Date("2026-09-25T02:00:03Z");

  it("writes one scheduled snapshot per user", async () => {
    const f = selectFake({
      applications: [
        { userId: "a", stage: "applied", score: 80 },
        { userId: "a", stage: "interview", score: null },
        { userId: "b", stage: "applied", score: null },
      ],
      funnel_snapshots: [],
    });
    const r = await processFunnelSnapshots({ db: f.db, now });
    expect(r).toEqual({ snapshots: 2, users: 2, skippedAlreadyCaptured: 0 });
    const rows = f.inserted.flat() as { userId: string; source: string; capturedAt: Date }[];
    expect(rows.map((x) => x.userId).sort()).toEqual(["a", "b"]);
    expect(rows.every((x) => x.source === "scheduled" && x.capturedAt === now)).toBe(true);
  });

  it("a retry on the same UTC day skips users that already have today's snapshot", async () => {
    const f = selectFake({
      applications: [
        { userId: "a", stage: "applied", score: null },
        { userId: "b", stage: "applied", score: null },
      ],
      funnel_snapshots: [{ userId: "a" }],
    });
    const r = await processFunnelSnapshots({ db: f.db, now });
    expect(r).toEqual({ snapshots: 1, users: 2, skippedAlreadyCaptured: 1 });
    const dedupe = f.wheres.find((w) => w.table === "funnel_snapshots")!;
    expect(dedupe.sql).toContain('"funnel_snapshots"."captured_at" >= $');
    expect(dedupe.params).toContain(startOfUtcDay(now).toISOString());
    expect(dedupe.params).toContain("scheduled");
  });

  it("runs entirely inside one transaction that first takes the advisory lock", async () => {
    const f = selectFake({ applications: [{ userId: "a", stage: "applied", score: null }], funnel_snapshots: [] });
    await processFunnelSnapshots({ db: f.db, now });
    expect(f.ops[0]!.op).toBe(
      "select pg_try_advisory_xact_lock(hashtext('ever-hust'), hashtext('funnel-snapshots')) as locked",
    );
    expect(f.ops.map((o) => o.op).slice(1)).toEqual([
      "select applications",
      "select funnel_snapshots",
      "insert funnel_snapshots",
    ]);
    expect(f.ops.every((o) => o.inTx)).toBe(true);
  });

  it("an overlapping run (lock held) answers 409 and reads/writes nothing, so it cannot duplicate points", async () => {
    const f = selectFake({ applications: [{ userId: "a", stage: "applied", score: null }], funnel_snapshots: [] }, { locked: false });
    const err = (await processFunnelSnapshots({ db: f.db, now }).catch((e: unknown) => e)) as CronWorkError;
    expect(err).toBeInstanceOf(CronWorkError);
    expect(err.cronStatus).toBe(409);
    expect(err.cronDetails).toEqual({ skipped: "locked" });
    expect(f.ops).toHaveLength(1);
    expect(f.inserted).toHaveLength(0);
  });

  it("startOfUtcDay", () => {
    expect(startOfUtcDay(new Date("2026-09-25T23:59:59.999Z")).toISOString()).toBe("2026-09-25T00:00:00.000Z");
  });
});

describe("runBatchEvaluate", () => {
  const evaluate = jest.fn();
  beforeEach(() => evaluate.mockReset());

  it("404s (CronInputError) for an unknown user and evaluates nothing", async () => {
    const f = selectFake({ users: [] });
    const err = await runBatchEvaluate({ userId: "nope", jobIds: [1] }, { db: f.db, evaluate }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CronInputError);
    expect((err as CronInputError).cronStatus).toBe(404);
    expect(evaluate).not.toHaveBeenCalled();
  });

  it("returns ranked results when every evaluation succeeded", async () => {
    const f = selectFake({ users: [{ preferences: {}, subscriptionStatus: "active" }] });
    evaluate
      .mockResolvedValueOnce({ evaluated: true, jobId: 1, score: 40, band: "C" })
      .mockResolvedValueOnce({ evaluated: true, jobId: 2, score: 90, band: "A" });
    const r = await runBatchEvaluate({ userId: "u", jobIds: [1, 2] }, { db: f.db, evaluate });
    expect(r.results.map((x) => x.jobId)).toEqual([2, 1]);
    expect(r).toMatchObject({ evaluated: 2, failed: [], interrupted: [], deferred: [], retryJobIds: [] });
  });

  it("passes a live AbortSignal to every evaluation", async () => {
    const f = selectFake({ users: [{ preferences: {}, subscriptionStatus: "active" }] });
    evaluate.mockResolvedValue({ evaluated: true, jobId: 1, score: 50, band: "B" });
    await runBatchEvaluate({ userId: "u", jobIds: [1] }, { db: f.db, evaluate });
    const args = evaluate.mock.calls[0]![0] as { abortSignal?: AbortSignal };
    expect(args.abortSignal).toBeInstanceOf(AbortSignal);
    expect(args.abortSignal!.aborted).toBe(false);
  });

  it("a thrown evaluation error is a failure (nothing still runs for it), so it is in retryJobIds", async () => {
    const f = selectFake({ users: [{ preferences: {}, subscriptionStatus: "active" }] });
    evaluate.mockRejectedValueOnce(new Error("provider 500"));
    const err = (await runBatchEvaluate({ userId: "u", jobIds: [7] }, { db: f.db, evaluate }).catch(
      (e: unknown) => e,
    )) as CronWorkError;
    expect(err.cronDetails).toMatchObject({ failed: [{ jobId: 7, error: "provider 500" }], interrupted: [], retryJobIds: [7] });
  });

  it("throws CronWorkError (→ non-2xx) listing failed and deferred jobs, both in retryJobIds", async () => {
    const f = selectFake({ users: [{ preferences: {}, subscriptionStatus: "active" }] });
    evaluate.mockResolvedValueOnce({ evaluated: false, jobId: 1, error: "Job not found." });
    let t = 0;
    const err = (await runBatchEvaluate(
      { userId: "u", jobIds: [1, 2, 3] },
      // clock reads: start 100, job 1 check 200 (<= 250), job 2 check 400 (> 250).
      { db: f.db, evaluate, clock: () => (t += 100), deadline: 250 },
    ).catch((e: unknown) => e)) as CronWorkError;
    expect(err).toBeInstanceOf(CronWorkError);
    expect(err.cronDetails).toMatchObject({
      failed: [{ jobId: 1, error: "Job not found." }],
      interrupted: [],
      deferred: [2, 3],
      retryJobIds: [1, 2, 3],
    });
    expect(err.message).toContain("Re-trigger with retryJobIds.");
    expect(err.message).not.toContain("Interrupted");
    expect(evaluate).toHaveBeenCalledTimes(1);
  });

  it("by default starts no new evaluation after 170 s (room for the last one inside the 290 s Trigger timeout)", async () => {
    expect(BATCH_EVALUATE_BUDGET_MS).toBe(170_000);
    const f = selectFake({ users: [{ preferences: {}, subscriptionStatus: "active" }] });
    let now = 1_000_000;
    // Each evaluation takes 60 s of (fake) wall-clock time.
    evaluate.mockImplementation(async ({ jobId }: { jobId: number }) => {
      now += 60_000;
      return { evaluated: true, jobId, score: 50, band: "B" };
    });
    const err = (await runBatchEvaluate(
      { userId: "u", jobIds: [1, 2, 3, 4, 5] },
      { db: f.db, evaluate, clock: () => now },
    ).catch((e: unknown) => e)) as CronWorkError;
    // Starts at 0 s, 60 s and 120 s; at 180 s the budget (170 s) has passed.
    expect(evaluate).toHaveBeenCalledTimes(3);
    expect(err.cronDetails).toMatchObject({ evaluated: 3, deferred: [4, 5], failed: [], retryJobIds: [4, 5] });
  });

  describe("an evaluation still running at the 270 s response limit", () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    const activeUser = { users: [{ preferences: {}, subscriptionStatus: "active" }] };

    /** An evaluation that only ends when its signal aborts (like the AI SDK call), or never. */
    function hangingEvaluation(opts: { honoursAbort: boolean }) {
      const seen: { signal?: AbortSignal; reject?: (e: Error) => void } = {};
      evaluate.mockImplementationOnce(
        ({ abortSignal }: { abortSignal: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            seen.signal = abortSignal;
            seen.reject = reject;
            if (opts.honoursAbort) {
              abortSignal.addEventListener("abort", () => reject(new Error("This operation was aborted")));
            }
          }),
      );
      return seen;
    }

    it("is ABORTED (its signal fires) and reported as interrupted/aborted, never in retryJobIds; the rest deferred", async () => {
      expect(BATCH_EVALUATE_RESPONSE_LIMIT_MS).toBe(270_000);
      const f = selectFake(activeUser);
      const seen = hangingEvaluation({ honoursAbort: true });
      const outcome = runBatchEvaluate({ userId: "u", jobIds: [1, 2, 3] }, { db: f.db, evaluate, clock: () => 0 }).catch(
        (e: unknown) => e,
      );
      await jest.advanceTimersByTimeAsync(269_999);
      expect(seen.signal!.aborted).toBe(false);
      await jest.advanceTimersByTimeAsync(1);
      expect(seen.signal!.aborted).toBe(true);
      const err = (await outcome) as CronWorkError;
      expect(err).toBeInstanceOf(CronWorkError);
      expect(err.cronDetails).toMatchObject({
        evaluated: 0,
        failed: [],
        interrupted: [{ jobId: 1, status: "aborted" }],
        deferred: [2, 3],
        retryJobIds: [2, 3],
      });
      expect(err.message).toContain("1 interrupted");
      expect(err.message).toContain("Interrupted jobs are not in retryJobIds");
      expect(evaluate).toHaveBeenCalledTimes(1);
    });

    it("one that ignores the abort is reported in_progress after the 5 s grace (it may still save its result)", async () => {
      expect(BATCH_EVALUATE_ABORT_GRACE_MS).toBe(5_000);
      const f = selectFake(activeUser);
      const seen = hangingEvaluation({ honoursAbort: false });
      const outcome = runBatchEvaluate({ userId: "u", jobIds: [1, 2] }, { db: f.db, evaluate, clock: () => 0 }).catch(
        (e: unknown) => e,
      );
      await jest.advanceTimersByTimeAsync(270_000);
      expect(seen.signal!.aborted).toBe(true);
      let settled = false;
      void outcome.then(() => (settled = true));
      await jest.advanceTimersByTimeAsync(4_999);
      expect(settled).toBe(false);
      await jest.advanceTimersByTimeAsync(1);
      const err = (await outcome) as CronWorkError;
      expect(err.cronDetails).toMatchObject({
        failed: [],
        interrupted: [{ jobId: 1, status: "in_progress" }],
        deferred: [2],
        retryJobIds: [2],
      });
      // The abandoned evaluation failing later is swallowed (no unhandled rejection).
      seen.reject!(new Error("late LLM failure"));
      await Promise.resolve();
    });

    it("one that finishes during the grace period is reported as evaluated", async () => {
      const f = selectFake(activeUser);
      evaluate.mockImplementationOnce(
        ({ abortSignal }: { abortSignal: AbortSignal }) =>
          new Promise((resolve) => {
            // Already past the LLM call (saving): the abort cannot stop it; it resolves 1 s later.
            abortSignal.addEventListener("abort", () => {
              setTimeout(() => resolve({ evaluated: true, jobId: 1, score: 70, band: "B" }), 1_000);
            });
          }),
      );
      const outcome = runBatchEvaluate({ userId: "u", jobIds: [1, 2] }, { db: f.db, evaluate, clock: () => 0 }).catch(
        (e: unknown) => e,
      );
      await jest.advanceTimersByTimeAsync(271_000);
      const err = (await outcome) as CronWorkError;
      expect(err.cronDetails).toMatchObject({ evaluated: 1, interrupted: [], failed: [], deferred: [2], retryJobIds: [2] });
    });

    it("control: an evaluation that answers before the limit is never aborted", async () => {
      const f = selectFake(activeUser);
      let signal: AbortSignal | undefined;
      evaluate.mockImplementationOnce(({ abortSignal }: { abortSignal: AbortSignal }) => {
        signal = abortSignal;
        return new Promise((resolve) => {
          setTimeout(() => resolve({ evaluated: true, jobId: 1, score: 80, band: "A" }), 269_000);
        });
      });
      const outcome = runBatchEvaluate({ userId: "u", jobIds: [1] }, { db: f.db, evaluate, clock: () => 0 });
      await jest.advanceTimersByTimeAsync(269_000);
      await expect(outcome).resolves.toMatchObject({ evaluated: 1, interrupted: [], retryJobIds: [] });
      await jest.advanceTimersByTimeAsync(10_000);
      expect(signal!.aborted).toBe(false);
    });
  });
});
