import { db as defaultDb, applications, evaluations, funnelSnapshots } from "@ever-hust/db";
import { and, eq, gte } from "drizzle-orm";
import { computeFunnel, type FunnelRow } from "@ever-hust/ai/analytics/funnel";

const SCHEDULED_SOURCE = "scheduled";

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

/**
 * Persisted funnel snapshots (spec #8). For every user with applications, compute their funnel
 * (pipeline stage #2 + evaluation fit score #3) and write a point-in-time row — turning the
 * on-demand funnel into a time series for trend views + the opt-in auto-tune the spec defers.
 * Pure compute via `computeFunnel`; this function only does the I/O.
 *
 * At most one scheduled snapshot per user per UTC day: users that already have one for today are
 * skipped, so a Trigger retry or a manual re-run does not write duplicate points into the series.
 * A DB error propagates (the route answers non-2xx); rows already inserted stay, and the retry
 * only fills in the users still missing.
 */
export async function processFunnelSnapshots(deps: FunnelSnapshotDeps = {}): Promise<FunnelSnapshotResult> {
  const database = deps.db ?? defaultDb;
  const now = deps.now ?? new Date();

  // Each application with its fit score (null when not yet evaluated), capped to bound memory.
  const rows = await database
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
      await database
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
    await database.insert(funnelSnapshots).values(toInsert.slice(i, i + BATCH));
  }

  return {
    snapshots: toInsert.length,
    users: byUser.size,
    skippedAlreadyCaptured: byUser.size - toInsert.length,
  };
}
