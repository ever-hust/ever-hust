import { defineConfig } from "@trigger.dev/sdk";

/**
 * Trigger.dev v4 config for Hust's scheduled/background tasks (packages/triggers/src):
 * job sync, job alerts, evaluation batch, cleanup, follow-up nudges (#9), funnel snapshots (#8).
 * Project ref + access token live in workspace/.config/trigger.env.
 */
export default defineConfig({
  project: "proj_kszjwuagydckpktuhxhl",
  runtime: "node",
  logLevel: "info",
  // Cap any single task run; the data tasks are well under this.
  maxDuration: 600,
  dirs: ["./packages/triggers/src"],
  retries: {
    enabledInDev: false,
    default: {
      maxAttempts: 3,
      factor: 2,
      minTimeoutInMs: 1_000,
      maxTimeoutInMs: 30_000,
      randomize: true,
    },
  },
});
