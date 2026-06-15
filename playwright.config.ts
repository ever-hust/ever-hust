import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    baseURL: "http://localhost:8443",
    trace: "on-first-retry",
  },
  projects: [
    // Auth setup — runs first, establishes a signed session for authenticated specs.
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      // Unauthenticated by default (existing redirect/401 specs). Authenticated specs opt in
      // with `test.use({ storageState: AUTH_FILE })`; they depend on the setup project below.
      dependencies: ["setup"],
      testIgnore: /auth\.setup\.ts/,
    },
  ],
  webServer: {
    // In CI, serve the production build (fast, no per-route dev compilation).
    // `next start` reads PORT (set to 8443 in the workflow). Locally, use dev.
    command: process.env.CI ? "pnpm --filter web start" : "pnpm --filter web dev",
    url: "http://localhost:8443",
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
