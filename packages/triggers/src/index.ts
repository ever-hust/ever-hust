export {
  sendJobAlertsTask,
  dailyAlertSchedule,
  eveningAlertSchedule,
  weeklyAlertSchedule,
} from "./send-job-alerts";

export { syncJobsTask, syncJobsSchedule, syncJobsFullSchedule } from "./sync-jobs";
export {
  runScheduledSync,
  runInProcessSync,
  KEYWORD_SYNC_MAX_DURATION_S,
  FULL_SYNC_MAX_DURATION_S,
} from "./sync-runner";
export { inboxSyncTask, inboxSyncSchedule } from "./inbox-sync";
export { mapJobToDb, geocodeLocation, resolveJobLevel, SEARCH_TERMS } from "./map-job";

export { cleanupTask, cleanupSchedule } from "./cleanup";

export { cleanupExpiredJobsTask } from "./cleanup-expired-jobs";
export { batchEvaluateTask } from "./batch-evaluate";

export { followUpNudgesTask, followUpNudgesSchedule } from "./follow-up-nudges";

export { funnelSnapshotsTask, funnelSnapshotsSchedule } from "./funnel-snapshots";

// App-runtime work (DB / email / LLM). Runs inside the app behind /api/cron/*; the Trigger tasks
// above only call those endpoints. Import from "@ever-hust/triggers/work" to avoid loading the SDK.
export { cleanupExpiredJobs, processFollowUpNudges, processFunnelSnapshots } from "./work";
