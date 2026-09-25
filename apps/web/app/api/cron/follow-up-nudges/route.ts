import { runFollowUpNudges } from "@ever-hust/triggers/work";
import { createCronHandler } from "../../../../lib/cron-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Work stops at a 240 s budget and answers non-2xx with `deferred` so the Trigger retry continues.
export const maxDuration = 300;

/**
 * POST /api/cron/follow-up-nudges — daily follow-up digest. OFF unless FOLLOW_UP_NUDGES_ENABLED is
 * on (a disabled run answers 200 with `skipped: "disabled"` and touches nothing). Send, then
 * advance: the send carries a Resend idempotency key derived from the user's cooldown marker, and
 * the marker only moves once Resend has taken the email, so a retry/re-run resends the same key
 * and Resend delivers one email. CRON_SECRET-guarded.
 * Non-2xx when any user failed, was deferred or was left to another run's in-flight send.
 */
export const POST = createCronHandler("follow-up-nudges", () => runFollowUpNudges());
