import { processFunnelSnapshots } from "@ever-hust/triggers/work";
import { createCronHandler } from "../../../../lib/cron-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// One read of <= 50k application rows + batched inserts. (Advisory only: `next start` on the
// self-hosted pods does not enforce maxDuration, which is why the run holds an advisory lock.)
export const maxDuration = 300;

/**
 * POST /api/cron/funnel-snapshots — daily funnel snapshot per user (at most one scheduled snapshot
 * per user per UTC day). The run is one transaction under an advisory lock; an overlapping run
 * answers 409 and writes nothing. CRON_SECRET-guarded.
 */
export const POST = createCronHandler("funnel-snapshots", () => processFunnelSnapshots());
