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
import { runBatchEvaluate } from "./batch-evaluate";

const dialect = new PgDialect();

function selectFake(results: Record<string, unknown[]>) {
  const inserted: unknown[][] = [];
  const wheres: { table: string; sql: string; params: unknown[] }[] = [];
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
            if (st.values) {
              inserted.push(st.values);
              return [];
            }
            return results[getTableName(st.table as never)] ?? [];
          })
          .then(res, rej),
    };
    return b;
  };
  return {
    db: { select: () => builder(), selectDistinct: () => builder(), insert: (t: unknown) => builder(t) } as never,
    inserted,
    wheres,
  };
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
    expect(r).toMatchObject({ evaluated: 2, failed: [], deferred: [] });
  });

  it("throws CronWorkError (→ non-2xx) listing failed and deferred jobs", async () => {
    const f = selectFake({ users: [{ preferences: {}, subscriptionStatus: "active" }] });
    evaluate.mockResolvedValueOnce({ evaluated: false, jobId: 1, error: "Job not found." });
    let t = 0;
    const err = (await runBatchEvaluate(
      { userId: "u", jobIds: [1, 2, 3] },
      { db: f.db, evaluate, clock: () => (t += 100), deadline: 150 },
    ).catch((e: unknown) => e)) as CronWorkError;
    expect(err).toBeInstanceOf(CronWorkError);
    expect(err.cronDetails).toMatchObject({ failed: [{ jobId: 1, error: "Job not found." }], deferred: [2, 3] });
    expect(evaluate).toHaveBeenCalledTimes(1);
  });
});
