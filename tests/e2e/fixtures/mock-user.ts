/**
 * Mock user data for E2E tests.
 * These users match the DB schema shape from packages/db/src/schema.
 */

export const mockFreeUser = {
  id: "test_user_free_001",
  name: "Jane Tester",
  email: "jane.tester@example.com",
  emailVerified: true,
  image: null,
  headline: "Software Engineer",
  location: "San Francisco, CA",
  linkedinUrl: "https://linkedin.com/in/janetester",
  subscriptionStatus: "free" as const,
  stripeCustomerId: null,
  stripeSubscriptionId: null,
  onboardingCompleted: false,
  preferences: null,
  createdAt: new Date("2025-01-01"),
  updatedAt: new Date("2025-01-01"),
};

export const mockProUser = {
  id: "test_user_pro_001",
  name: "John ProUser",
  email: "john.prouser@example.com",
  emailVerified: true,
  image: null,
  headline: "Senior Software Engineer",
  location: "New York, NY",
  linkedinUrl: "https://linkedin.com/in/johnpro",
  subscriptionStatus: "active" as const,
  stripeCustomerId: "cus_test_001",
  stripeSubscriptionId: "sub_test_001",
  onboardingCompleted: true,
  preferences: {
    roles: ["fulltime"],
    skills: ["React", "TypeScript", "Node.js"],
    salaryMin: 150000,
    isRemote: true,
    locations: ["San Francisco", "Remote"],
    roleLevel: ["senior"],
    industries: ["tech"],
    companySize: ["medium", "large"],
  },
  createdAt: new Date("2024-12-01"),
  updatedAt: new Date("2025-01-15"),
};

export const mockOnboardedFreeUser = {
  ...mockFreeUser,
  id: "test_user_onboarded_001",
  name: "Alex Onboarded",
  email: "alex.onboarded@example.com",
  onboardingCompleted: true,
  preferences: {
    roles: ["fulltime", "contract"],
    skills: ["Python", "Django"],
    salaryMin: 100000,
    isRemote: true,
  },
};

/**
 * Session cookie value for test authentication.
 * In E2E tests, you can set this cookie to bypass BetterAuth:
 *   await page.context().addCookies([{
 *     name: 'better-auth.session_token',
 *     value: TEST_SESSION_TOKEN,
 *     domain: 'localhost',
 *     path: '/',
 *   }]);
 *
 * The test DB should have a corresponding session record.
 */
export const TEST_SESSION_TOKEN = "test_session_e2e_12345";
