import { db as defaultDb, applications, evaluations, funnelSnapshots } from "@ever-hust/db";
import { and, eq, gte, sql } from "drizzle-orm";
import { computeFunnel, type FunnelRow } from "@ever-hust/ai/analytics/funnel";
import { CronWorkError } from "./errors";

const SCHEDULED_SOURCE = "scheduled";

/**
 * Transaction-scoped advisory lock taken for the whole run (released at COMMIT/ROLLBACK, so it
 * cannot leak through a pooled connection). Advisory locks are per database, so the hust,
 * hust_stage and hust_dev databases never contend.
 */
export const FUNNEL_SNAPSHOTS_LOCK_SQL = sql`select pg_try_advisory_xact_lock(hashtext('ever-hust'), hashtext('funnel-snapshots')) as locked`;

/** Start of the UTC day containing `now`. */
export function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export interface FunnelSnapshotResult {
  /** Snapshot rows written by this run. */
  snapshots: number;
  /** Users with applications. */
  users: number;
  /** Users that already had a scheduled snapshot for this UTC day (retry / re-run). */
  skippedAlreadyCaptured: number;
}

export interface FunnelSnapshotDeps {
  db?: typeof defaultDb;
  now?: Date;
}

function lockAcquired(result: unknown): boolean {
  const rows = Array.isArray(result) ? result : ((result as { rows?: unknown[] } | null)?.rows ?? []);
  return (rows[0] as { locked?: unknown } | undefined)?.locked === true;
}

/**
 * Persisted funnel snapshots (spec #8). For every user with applications, compute their funnel
 * (pipeline stage #2 + evaluation fit score #3) and write a point-in-time row — turning the
 * on-demand funnel into a time series for trend views + the opt-in auto-tune the spec defers.
 * Pure compute via `computeFunnel`; this function only does the I/O.
 *
 * At most one scheduled snapshot per user per UTC day. The whole run is ONE transaction holding
 * {@link FUNNEL_SNAPSHOTS_LOCK_SQL}: the "already captured today" read and the inserts cannot
 * interleave with another run's. That matters because a Trigger attempt that times out does not
 * stop the app request it started, so its retry can arrive while the first run is still writing.
 * A run that finds the lock held throws {@link CronWorkError} with status 409 (nothing read or
 * written; the Trigger retry tries again once the first run has committed). Any error rolls the
 * whole run back, so a retry starts clean.
 */
export async function processFunnelSnapshots(deps: FunnelSnapshotDeps = {}): Promise<FunnelSnapshotResult> {
  const database = deps.db ?? defaultDb;
  const now = deps.now ?? new Date();

  return database.transaction(async (tx) => {
    if (!lockAcquired(await tx.execute(FUNNEL_SNAPSHOTS_LOCK_SQL))) {
      throw new CronWorkError(
        "Another funnel-snapshots run is in progress (advisory lock held); nothing was written.",
        { skipped: "locked" },
        409,
      );
    }

    // Each application with its fit score (null when not yet evaluated), capped to bound memory.
    const rows = await tx
      .select({
        userId: applications.userId,
        stage: applications.pipelineStage,
        score: evaluations.score,
      })
      .from(applications)
      .leftJoin(
        evaluations,
        and(eq(evaluations.jobId, applications.jobId), eq(evaluations.userId, applications.userId)),
      )
      .limit(50000);

    // Group into per-user funnel rows.
    const byUser = new Map<string, FunnelRow[]>();
    for (const r of rows) {
      const list = byUser.get(r.userId) ?? [];
      list.push({ stage: r.stage ?? "applied", score: r.score ?? null });
      byUser.set(r.userId, list);
    }

    const alreadyCaptured = new Set(
      (
        await tx
          .selectDistinct({ userId: funnelSnapshots.userId })
          .from(funnelSnapshots)
          .where(
            and(eq(funnelSnapshots.source, SCHEDULED_SOURCE), gte(funnelSnapshots.capturedAt, startOfUtcDay(now))),
          )
      ).map((r) => r.userId),
    );

    const toInsert = [...byUser.entries()]
      .filter(([userId]) => !alreadyCaptured.has(userId))
      .map(([userId, funnelRows]) => {
        const f = computeFunnel(funnelRows);
        return {
          userId,
          capturedAt: now,
          total: f.total,
          byStage: f.byStage,
          conversions: f.conversions,
          avgScore: f.avgScore,
          source: SCHEDULED_SOURCE,
        };
      });

    // Insert in batches to avoid oversized queries.
    const BATCH = 500;
    for (let i = 0; i < toInsert.length; i += BATCH) {
      await tx.insert(funnelSnapshots).values(toInsert.slice(i, i + BATCH));
    }

    return {
      snapshots: toInsert.length,
      users: byUser.size,
      skippedAlreadyCaptured: byUser.size - toInsert.length,
    };
  });
}
