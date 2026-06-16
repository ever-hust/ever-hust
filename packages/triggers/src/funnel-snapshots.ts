import { task, schedules } from "@trigger.dev/sdk";
import { db, applications, evaluations, funnelSnapshots } from "@ever-hust/db";
import { and, eq } from "drizzle-orm";
import { computeFunnel, type FunnelRow } from "@ever-hust/ai/analytics/funnel";
import { runsOnTrigger, SKIPPED } from "./scheduler";

/**
 * Persisted funnel snapshots (spec #8). For every user with applications, compute their funnel
 * (pipeline stage #2 + evaluation fit score #3) and write a point-in-time row — turning the
 * on-demand funnel into a time series for trend views + the opt-in auto-tune the spec defers.
 * Pure compute via `computeFunnel`; this task only does the I/O.
 */
export async function processFunnelSnapshots(): Promise<{ snapshots: number }> {
  // Each application with its fit score (null when not yet evaluated), capped to bound memory.
  const rows = await db
    .select({
      userId: applications.userId,
      stage: applications.pipelineStage,
      score: evaluations.score,
    })
    .from(applications)
    .leftJoin(
      evaluations,
      and(
        eq(evaluations.jobId, applications.jobId),
        eq(evaluations.userId, applications.userId),
      ),
    )
    .limit(50000);

  // Group into per-user funnel rows.
  const byUser = new Map<string, FunnelRow[]>();
  for (const r of rows) {
    const list = byUser.get(r.userId) ?? [];
    list.push({ stage: r.stage ?? "applied", score: r.score ?? null });
    byUser.set(r.userId, list);
  }

  const toInsert = [...byUser.entries()].map(([userId, funnelRows]) => {
    const f = computeFunnel(funnelRows);
    return {
      userId,
      total: f.total,
      byStage: f.byStage,
      conversions: f.conversions,
      avgScore: f.avgScore,
      source: "scheduled",
    };
  });

  // Insert in batches to avoid oversized queries.
  const BATCH = 500;
  for (let i = 0; i < toInsert.length; i += BATCH) {
    await db.insert(funnelSnapshots).values(toInsert.slice(i, i + BATCH));
  }

  return { snapshots: toInsert.length };
}

export const funnelSnapshotsTask = task({
  id: "funnel-snapshots",
  run: async () => processFunnelSnapshots(),
});

// Daily at 2 AM UTC (quiet hour).
export const funnelSnapshotsSchedule = schedules.task({
  id: "daily-funnel-snapshots",
  cron: "0 2 * * *",
  run: async () => {
    if (!runsOnTrigger()) return SKIPPED;
    await processFunnelSnapshots();
  },
});
