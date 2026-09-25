import { task, schedules } from "@trigger.dev/sdk";
import { callAppEndpoint } from "./app-endpoint";
import { CRON_ENDPOINTS, CRON_TIMEOUTS_MS } from "./cron-endpoints";
import { runsOnTrigger, SKIPPED } from "./scheduler";

/**
 * Background inbox sync. Portable: POST the app's own /api/inbox/cron-sync so the
 * IMAP work runs in the app's runtime (where the mail libs + DB live), regardless
 * of where the app is deployed. No-ops when SCHEDULER!=trigger.
 */
async function callCronSync() {
  return callAppEndpoint(CRON_ENDPOINTS.inboxSync, {}, { timeoutMs: CRON_TIMEOUTS_MS.inboxSync });
}

export const inboxSyncTask = task({
  id: "inbox-sync",
  run: async () => callCronSync(),
});

/** Every hour, sync all connected mailboxes. */
export const inboxSyncSchedule = schedules.task({
  id: "inbox-sync-hourly",
  cron: "0 * * * *",
  run: async () => {
    if (!runsOnTrigger()) return SKIPPED;
    return callCronSync();
  },
});
