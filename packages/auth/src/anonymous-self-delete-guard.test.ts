/**
 * The anonymous plugin mounts POST /api/auth/delete-anonymous-user, which deletes the guest row
 * straight away. organizations.created_by_id cascades on that delete, so a guest who created an
 * organization and brought real members in could wipe it, with every membership, invitation, AI
 * config and branding row, and skip the hand-over and last-owner check that
 * DELETE /api/user/account runs. The before hook refuses that one endpoint and leaves every other
 * auth path alone, the sign-in, sign-up and callback paths whose after hook links a guest to the
 * new account included.
 *
 * better-auth ships ESM only and this Jest setup runs CJS, so better-auth/api is replaced by a
 * stand-in with the same APIError shape; createAuthMiddleware hands the handler back unchanged.
 */
jest.mock("better-auth/api", () => {
  const statusCodes: Record<string, number> = { FORBIDDEN: 403 };
  class APIError extends Error {
    status: string;
    statusCode: number;
    body: { message?: string } | undefined;
    constructor(status: string, body?: { message?: string }) {
      super(body?.message);
      this.status = status;
      this.statusCode = statusCodes[status] ?? 500;
      this.body = body;
    }
  }
  return {
    APIError,
    createAuthMiddleware: (handler: unknown) => handler,
  };
});

// index.ts builds the auth instance at import time; these stand-ins let the test read the
// options it passes without a database or the real (ESM-only) better-auth.
jest.mock("better-auth", () => ({
  betterAuth: (options: unknown) => ({ options }),
}));
jest.mock("better-auth/adapters/drizzle", () => ({
  drizzleAdapter: () => ({}),
}));
jest.mock("better-auth/plugins", () => ({
  anonymous: (options: unknown) => ({ id: "anonymous", options }),
}));
jest.mock("@ever-hust/db/client", () => ({ db: {} }));
jest.mock("@ever-hust/db/schema", () => ({
  users: {},
  sessions: {},
  accounts: {},
  verifications: {},
}));
jest.mock("./migrate-anonymous-user", () => ({
  migrateAnonymousUserData: jest.fn(),
}));

import { anonymousSelfDeleteGuard } from "./anonymous-self-delete-guard";
import { auth } from "./index";

type GuardContext = Parameters<typeof anonymousSelfDeleteGuard>[0];

function runGuard(path: string) {
  return anonymousSelfDeleteGuard({ path } as GuardContext);
}

describe("anonymousSelfDeleteGuard", () => {
  it("refuses POST /delete-anonymous-user with 403 FORBIDDEN", async () => {
    await expect(runGuard("/delete-anonymous-user")).rejects.toMatchObject({
      status: "FORBIDDEN",
      statusCode: 403,
    });
  });

  it("points the guest to account deletion in Settings", async () => {
    const error = await runGuard("/delete-anonymous-user").then(
      () => undefined,
      (e: unknown) => e as { body?: { message?: string } },
    );
    expect(error?.body?.message).toMatch(/Settings/);
    expect(error?.body?.message).toMatch(/Delete Account/);
  });

  it.each([
    "/sign-in/anonymous",
    "/sign-in/email",
    "/sign-in/social",
    "/sign-up/email",
    "/callback/:id",
    "/get-session",
    "/sign-out",
  ])("lets %s through", async (path) => {
    await expect(runGuard(path)).resolves.toBeUndefined();
  });
});

describe("auth config", () => {
  type AuthOptions = {
    hooks?: { before?: unknown };
    plugins?: { id: string; options?: Record<string, unknown> }[];
  };
  const options = (auth as unknown as { options: AuthOptions }).options;

  it("runs the guard before every auth endpoint", () => {
    expect(options.hooks?.before).toBe(anonymousSelfDeleteGuard);
  });

  it("keeps the anonymous plugin's guest delete after linking on", () => {
    const anonymous = options.plugins?.find((p) => p.id === "anonymous");
    expect(anonymous).toBeDefined();
    // disableDeleteAnonymousUser would also stop the plugin from removing the guest once its
    // work has moved to the account it signed up with.
    expect(anonymous?.options?.disableDeleteAnonymousUser).toBeUndefined();
  });
});
