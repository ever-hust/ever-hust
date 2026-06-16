/**
 * Where scheduled jobs run — config-driven so the platform stays portable across hosts
 * (k8s today, Vercel tomorrow, etc.) without deleting either path.
 *
 * - `trigger` (default): Trigger.dev fires the schedules. Use this whenever the Trigger.dev
 *   project is set up. Tasks that need host-local network access (e.g. reaching an internal
 *   Ever Jobs ClusterIP) call back into the app's own HTTP endpoints, so they run in the app's
 *   runtime regardless of where the app is deployed.
 * - `cron`: an external scheduler owns the cadence instead (a k8s CronJob, Vercel Cron, …),
 *   hitting the same endpoints. The Trigger schedules then no-op so nothing double-runs.
 *
 * Set `SCHEDULER=cron` to switch; unset/anything else defaults to `trigger`.
 */
export type Scheduler = "trigger" | "cron";

export function activeScheduler(): Scheduler {
  return (process.env.SCHEDULER ?? "").trim().toLowerCase() === "cron" ? "cron" : "trigger";
}

/** True when Trigger.dev is the active scheduler (so a Trigger `schedules.task` should do its work). */
export function runsOnTrigger(): boolean {
  return activeScheduler() === "trigger";
}

/** Skip payload returned by a Trigger schedule when another scheduler owns the cadence. */
export const SKIPPED = { skipped: true, reason: "SCHEDULER!=trigger" } as const;
