/**
 * The password reset email must go through the @ever-hust/email template, which escapes the
 * user name. Anyone can sign up with a chosen name for an address that has no account yet and
 * then request a reset for it, so the name must never be pasted into raw HTML.
 */
const mockSendPasswordResetEmail = jest.fn();
jest.mock("@ever-hust/email", () => ({
  sendPasswordResetEmail: (...args: unknown[]) => mockSendPasswordResetEmail(...args),
}));

// A direct Resend call from the auth package would bypass the template.
const mockResendSend = jest.fn();
jest.mock("resend", () => ({
  Resend: jest.fn(() => ({ emails: { send: mockResendSend } })),
}));

// betterAuth() returns its options, so the test can call the configured hook.
jest.mock("better-auth", () => ({ betterAuth: (options: unknown) => ({ options }) }));
jest.mock("better-auth/adapters/drizzle", () => ({ drizzleAdapter: () => ({}) }));
jest.mock("better-auth/plugins", () => ({ anonymous: () => ({}) }));
jest.mock("@ever-hust/db/client", () => ({ db: {} }));
jest.mock("@ever-hust/db/schema", () => ({ users: {}, sessions: {}, accounts: {}, verifications: {} }));
jest.mock("./migrate-anonymous-user", () => ({ migrateAnonymousUserData: jest.fn() }));

import { auth } from "./index";

type ResetHook = (data: {
  user: { email: string; name?: string | null };
  url: string;
  token: string;
}) => Promise<void>;

const sendResetPassword = (
  auth as unknown as { options: { emailAndPassword: { sendResetPassword: ResetHook } } }
).options.emailAndPassword.sendResetPassword;

const url = "https://hust.so/api/auth/reset-password/tok_123?callbackURL=%2Freset-password";

beforeEach(() => {
  jest.clearAllMocks();
  mockSendPasswordResetEmail.mockResolvedValue({ id: "reset_1" });
});

describe("emailAndPassword.sendResetPassword", () => {
  it("sends through the escaping email template, not raw HTML", async () => {
    const name = '<a href="https://evil.example">x</a>';

    await sendResetPassword({ user: { email: "owner@example.com", name }, url, token: "tok_123" });

    expect(mockSendPasswordResetEmail).toHaveBeenCalledWith({
      to: "owner@example.com",
      userName: name,
      resetUrl: url,
    });
    expect(mockResendSend).not.toHaveBeenCalled();
  });

  it("falls back to the local part of the email when the user has no name", async () => {
    await sendResetPassword({ user: { email: "jane@example.com", name: null }, url, token: "tok_123" });

    expect(mockSendPasswordResetEmail).toHaveBeenCalledWith(
      expect.objectContaining({ userName: "jane" }),
    );
  });

  it("logs a failed send instead of throwing", async () => {
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
    mockSendPasswordResetEmail.mockRejectedValueOnce(new Error("Failed to send password reset email: down"));

    await expect(
      sendResetPassword({ user: { email: "owner@example.com", name: "Jane" }, url, token: "tok_123" }),
    ).resolves.toBeUndefined();
    expect(consoleError).toHaveBeenCalledWith(
      "[Auth] Failed to send password reset email to owner@example.com:",
      "Failed to send password reset email: down",
    );
    consoleError.mockRestore();
  });
});
