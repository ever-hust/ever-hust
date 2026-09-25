import { runCleanup } from "@ever-hust/triggers/work";
import { createCronHandler } from "../../../../lib/cron-route";
import { cronCleanupSchema } from "../../../../lib/cron-schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Batched deletes stop at a 240 s work budget (the next run continues); keep headroom above it.
export const maxDuration = 300;

/**
 * POST /api/cron/cleanup — daily cleanup (Trigger `daily-cleanup` / `cleanup`). CRON_SECRET-guarded.
 * Mode comes from JOBS_CLEANUP_MODE (default dry-run); body `{ mode?: "dry-run" | "off" }` can only
 * make a run safer. Never deletes a job that anything references. See docs/internal/CRON_ENDPOINTS.md.
 */
export const POST = createCronHandler("cleanup", (body) => runCleanup({ mode: body.mode }), cronCleanupSchema);
