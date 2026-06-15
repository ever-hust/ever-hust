import { test as setup, expect } from "@playwright/test";
import { db, users, applications, evaluations } from "@ever-hust/db";
import { eq } from "drizzle-orm";

/**
 * Playwright auth setup (runs as a dependency project before authenticated specs).
 *
 * Establishes a real, signed BetterAuth session WITHOUT OAuth:
 *  1. Sign up via email/password (creates the user + account; the verification email send is
 *     non-blocking in CI where Resend isn't configured).
 *  2. Flip emailVerified + onboardingCompleted directly in the test DB (the app requires email
 *     verification, and we want to skip the onboarding gate). This is a test-DB write only.
 *  3. Sign in → BetterAuth issues a properly signed session cookie.
 *  4. Persist the storage state for authenticated specs (`test.use({ storageState: AUTH_FILE })`).
 */
export const AUTH_FILE = "tests/e2e/.auth/user.json";

const TEST_EMAIL = "e2e.tester@hust.test";
const TEST_PASSWORD = "e2e-test-password-123";
const TEST_NAME = "E2E Tester";

setup("authenticate", async ({ request }) => {
  // 1. Sign up (idempotent across re-runs — ignore "already exists").
  await request.post("/api/auth/sign-up/email", {
    data: { email: TEST_EMAIL, password: TEST_PASSWORD, name: TEST_NAME },
    failOnStatusCode: false,
  });

  // 2. Verify + onboard directly in the test database.
  await db
    .update(users)
    .set({
      emailVerified: true,
      onboardingCompleted: true,
      preferences: {
        jobType: ["fulltime"],
        remotePreference: "remote",
        roleLevel: "senior",
        skills: ["TypeScript", "React", "Node.js"],
        salaryMin: 150000,
        industries: ["tech"],
      },
    })
    .where(eq(users.email, TEST_EMAIL));

  // 2b. Seed a couple of tracked applications (against the seeded jobs corpus) so authenticated
  //     pipeline / funnel / follow-up specs have real data to exercise. Idempotent across re-runs.
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, TEST_EMAIL))
    .limit(1);
  const userId = rows[0]?.id;
  if (userId) {
    await db
      .insert(applications)
      .values([
        { userId, jobId: 1, status: "submitted", pipelineStage: "applied" },
        { userId, jobId: 2, status: "submitted", pipelineStage: "interviewing" },
      ])
      .onConflictDoNothing();

    // 2c. Seed a high-fit evaluation for job 2 so the "Best for me" ranking (spec #3) has a
    //     deterministic top result to assert against. Idempotent (unique on user+job).
    await db
      .insert(evaluations)
      .values({
        userId,
        jobId: 2,
        score: 95,
        score5: 4.8,
        band: "apply_now",
        jobFamily: "Software Engineering",
        archetype: "Backend",
        dimensions: [
          { key: "north_star", weight: 20, score5: 5, rationale: "Bullseye.", source: "llm" as const },
        ],
        blocks: {
          roleSummary: "Seeded for E2E ranking.",
          cvMatch: { evidence: [], gaps: [] },
          levelStrategy: "Seeded.",
          compDemand: { summary: "Seeded.", budgetFit: "good_fit" as const },
          customization: "Seeded.",
        },
        recommendation: "Seeded high-fit evaluation for E2E.",
      })
      .onConflictDoNothing();
  }

  // 3. Sign in for a valid signed session cookie.
  const signIn = await request.post("/api/auth/sign-in/email", {
    data: { email: TEST_EMAIL, password: TEST_PASSWORD },
    failOnStatusCode: false,
  });
  expect(signIn.ok(), `sign-in failed: ${signIn.status()}`).toBeTruthy();

  // 4. Persist auth state for authenticated specs.
  await request.storageState({ path: AUTH_FILE });
});
