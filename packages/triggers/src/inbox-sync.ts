import { task, schedules } from "@trigger.dev/sdk";
import { runsOnTrigger, SKIPPED } from "./scheduler";

/**
 * Background inbox sync. Portable: POST the app's own /api/inbox/cron-sync so the
 * IMAP work runs in the app's runtime (where the mail libs + DB live), regardless
 * of where the app is deployed. No-ops when SCHEDULER!=trigger.
 */
async function callCronSync() {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:8443";
  const secret = process.env.CRON_SECRET;
  const res = await fetch(`${base}/api/inbox/cron-sync`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
    },
  });
  if (!res.ok) {
    throw new Error(`inbox cron-sync failed: ${res.status}`);
  }
  return res.json().catch(() => ({}));
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
