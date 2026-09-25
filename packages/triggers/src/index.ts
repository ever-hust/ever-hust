export {
  sendJobAlertsTask,
  dailyAlertSchedule,
  eveningAlertSchedule,
  weeklyAlertSchedule,
} from "./send-job-alerts";

export { syncJobsTask, syncJobsSchedule } from "./sync-jobs";
export { inboxSyncTask, inboxSyncSchedule } from "./inbox-sync";
export { mapJobToDb, geocodeLocation, SEARCH_TERMS } from "./map-job";

export { cleanupTask, cleanupSchedule } from "./cleanup";

export { cleanupExpiredJobsTask } from "./cleanup-expired-jobs";
export { batchEvaluateTask } from "./batch-evaluate";

export { followUpNudgesTask, followUpNudgesSchedule } from "./follow-up-nudges";

export { funnelSnapshotsTask, funnelSnapshotsSchedule } from "./funnel-snapshots";

// App-runtime work (DB / email / LLM). Runs inside the app behind /api/cron/*; the Trigger tasks
// above only call those endpoints. Import from "@ever-hust/triggers/work" to avoid loading the SDK.
export { cleanupExpiredJobs, processFollowUpNudges, processFunnelSnapshots } from "./work";
