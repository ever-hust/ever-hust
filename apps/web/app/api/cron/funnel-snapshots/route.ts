import { processFunnelSnapshots } from "@ever-hust/triggers/work";
import { createCronHandler } from "../../../../lib/cron-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// One read of <= 50k application rows + batched inserts; well under this.
export const maxDuration = 180;

/**
 * POST /api/cron/funnel-snapshots — daily funnel snapshot per user (at most one scheduled snapshot
 * per user per UTC day). CRON_SECRET-guarded.
 */
export const POST = createCronHandler("funnel-snapshots", () => processFunnelSnapshots());
