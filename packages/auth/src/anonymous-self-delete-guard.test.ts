/**
 * The anonymous plugin mounts POST /api/auth/delete-anonymous-user, which deletes the guest row
 * straight away. organizations.created_by_id cascades on that delete, so a guest who created an
 * organization and brought real members in could wipe it, with every membership, invitation, AI
 * config and branding row, and skip the hand-over and last-owner check that
 * DELETE /api/user/account runs. The before hook refuses that one endpoint and leaves every other
 * auth path alone, the sign-in, sign-up and callback paths whose after hook links a guest to the
 * new account included.
 *
 * better-auth ships ESM only and this Jest setup runs CJS, so jest.config.ts maps better-auth/api
 * for the auth project to ./test-stubs/better-auth-api.ts: an APIError with the same shape, and a
 * createAuthMiddleware that hands the handler back unchanged.
 */

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
import { migrateAnonymousUserData } from "./migrate-anonymous-user";
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

  // The plugin's own delete ran after onLinkAccount even when the move had failed, and every
  // table the guest owns cascades on it. It is off; onLinkAccount deletes the guest itself, and
  // only once the move has committed.
  it("turns the plugin's own guest delete off", () => {
    const anonymous = options.plugins?.find((p) => p.id === "anonymous");
    expect(anonymous).toBeDefined();
    expect(anonymous?.options?.disableDeleteAnonymousUser).toBe(true);
  });

  describe("onLinkAccount", () => {
    type OnLinkAccount = (data: {
      anonymousUser: unknown;
      newUser: unknown;
      ctx: unknown;
    }) => Promise<void>;
    const onLinkAccount = () =>
      options.plugins?.find((p) => p.id === "anonymous")?.options
        ?.onLinkAccount as OnLinkAccount;
    const migrate = migrateAnonymousUserData as jest.Mock;
    const deleteUser = jest.fn();
    const link = () =>
      onLinkAccount()({
        anonymousUser: { user: { id: "guest-1", isAnonymous: true } },
        newUser: { user: { id: "user-new", isAnonymous: false } },
        ctx: { context: { internalAdapter: { deleteUser } } },
      });
    let errorSpy: jest.SpyInstance;

    beforeEach(() => {
      migrate.mockReset();
      deleteUser.mockReset();
      errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    });
    afterEach(() => errorSpy.mockRestore());

    it("moves the guest's work, then deletes the guest", async () => {
      migrate.mockResolvedValue(undefined);
      deleteUser.mockResolvedValue(undefined);

      await expect(link()).resolves.toBeUndefined();

      expect(migrate).toHaveBeenCalledWith({}, "guest-1", "user-new");
      expect(deleteUser).toHaveBeenCalledWith("guest-1");
      expect(migrate.mock.invocationCallOrder[0]!).toBeLessThan(
        deleteUser.mock.invocationCallOrder[0]!,
      );
    });

    it("keeps the guest and lets the sign-in through when the move fails", async () => {
      migrate.mockRejectedValue(new Error("connection lost"));

      await expect(link()).resolves.toBeUndefined();

      expect(deleteUser).not.toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining("guest-1"),
        "connection lost",
      );
    });
  });
});
