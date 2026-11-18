/**
 * Sign-up accepts any name for an address that has no account yet, and the verification and
 * welcome emails go to that address before anyone has proved they own it. A name such as
 * "Your account is locked, restore it at attacker-site.example" would be printed in an email from
 * our own sender, and mail clients turn the bare domain into a link. So the reset, verification
 * and welcome emails greet an unverified user as "there", and a verified user by a trimmed,
 * capped name with the email local part as the fallback.
 */
const mockSendPasswordResetEmail = jest.fn();
const mockSendVerificationEmail = jest.fn();
const mockSendWelcomeEmail = jest.fn();
jest.mock("@ever-hust/email", () => ({
  sendPasswordResetEmail: (...args: unknown[]) =>
    mockSendPasswordResetEmail(...args),
  sendVerificationEmail: (...args: unknown[]) =>
    mockSendVerificationEmail(...args),
  sendWelcomeEmail: (...args: unknown[]) => mockSendWelcomeEmail(...args),
}));

// betterAuth() returns its options, so the test can call the configured hooks.
jest.mock("better-auth", () => ({
  betterAuth: (options: unknown) => ({ options }),
}));
jest.mock("better-auth/adapters/drizzle", () => ({
  drizzleAdapter: () => ({}),
}));
jest.mock("better-auth/plugins", () => ({ anonymous: () => ({}) }));
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

import { auth } from "./index";

type EmailUser = {
  email: string;
  name?: string | null;
  emailVerified?: boolean;
};

type AuthOptions = {
  emailAndPassword: {
    sendResetPassword: (data: {
      user: EmailUser;
      url: string;
      token: string;
    }) => Promise<void>;
  };
  emailVerification: {
    sendVerificationEmail: (data: {
      user: EmailUser;
      url: string;
      token: string;
    }) => Promise<void>;
  };
  databaseHooks: {
    user: {
      create: { after: (user: EmailUser, context: unknown) => Promise<void> };
    };
  };
};

const options = (auth as unknown as { options: AuthOptions }).options;

// The real templates, rendered to plain text, show what the reader sees.
const templates =
  jest.requireActual<typeof import("@ever-hust/email")>("@ever-hust/email");
const { render } = jest.requireActual<{
  render: (element: unknown, options: { plainText: true }) => Promise<string>;
}>("@react-email/components");

const url = "https://hust.so/api/auth/verify-email?token=tok_123";

type EmailCase = {
  label: string;
  send: (user: EmailUser) => Promise<void>;
  sender: jest.Mock;
  renderText: (userName: string) => Promise<string>;
};

const emails: EmailCase[] = [
  {
    label: "verification",
    send: (user) =>
      options.emailVerification.sendVerificationEmail({
        user,
        url,
        token: "tok_123",
      }),
    sender: mockSendVerificationEmail,
    renderText: (userName) =>
      render(templates.VerificationEmail({ userName, verificationUrl: url }), {
        plainText: true,
      }),
  },
  {
    label: "welcome",
    send: (user) => options.databaseHooks.user.create.after(user, null),
    sender: mockSendWelcomeEmail,
    renderText: (userName) =>
      render(
        templates.WelcomeEmail({ userName, chatUrl: "https://hust.so/chat" }),
        { plainText: true },
      ),
  },
  {
    label: "password reset",
    send: (user) =>
      options.emailAndPassword.sendResetPassword({
        user,
        url,
        token: "tok_123",
      }),
    sender: mockSendPasswordResetEmail,
    renderText: (userName) =>
      render(templates.PasswordResetEmail({ userName, resetUrl: url }), {
        plainText: true,
      }),
  },
];

beforeEach(() => {
  jest.clearAllMocks();
  mockSendPasswordResetEmail.mockResolvedValue({ id: "reset_1" });
  mockSendVerificationEmail.mockResolvedValue({ id: "verify_1" });
  mockSendWelcomeEmail.mockResolvedValue({ id: "welcome_1" });
});

function sentUserName(sender: jest.Mock): string {
  expect(sender).toHaveBeenCalledTimes(1);
  return (sender.mock.calls[0][0] as { userName: string }).userName;
}

describe.each(emails)("the $label email", ({ send, sender, renderText }) => {
  const lure = "Your account is locked, restore it at attacker-site.example";

  it("greets an unverified user as 'there', never with the sign-up name", async () => {
    await send({
      email: "victim@example.com",
      name: lure,
      emailVerified: false,
    });

    expect(sender).toHaveBeenCalledWith(
      expect.objectContaining({ to: "victim@example.com", userName: "there" }),
    );
    const text = await renderText(sentUserName(sender));
    expect(text).toContain("Hi there,");
    expect(text).not.toContain("attacker-site.example");
  });

  it("greets a user whose emailVerified flag is missing as 'there'", async () => {
    await send({ email: "victim@example.com", name: lure });

    expect(sentUserName(sender)).toBe("there");
  });

  it.each(["", "   ", "\t\n"])(
    "never renders 'Hi ,' for the blank name %j",
    async (name) => {
      await send({ email: "jane@example.com", name, emailVerified: true });

      expect(sentUserName(sender)).toBe("jane");
      const text = await renderText(sentUserName(sender));
      expect(text).toContain("Hi jane,");
      expect(text).not.toMatch(/Hi\s*,/);
    },
  );

  it("falls back to the email local part when a verified user has no name", async () => {
    await send({ email: "jane@example.com", name: null, emailVerified: true });

    expect(sentUserName(sender)).toBe("jane");
  });

  it("keeps a verified user's name, trimmed", async () => {
    await send({
      email: "jane@example.com",
      name: "  Jane Doe \n",
      emailVerified: true,
    });

    expect(sentUserName(sender)).toBe("Jane Doe");
  });

  it("caps a very long name at 100 characters", async () => {
    await send({
      email: "jane@example.com",
      name: "A".repeat(5000),
      emailVerified: true,
    });

    expect(sentUserName(sender)).toBe("A".repeat(100));
  });

  it("does not split a character when it caps the name", async () => {
    await send({
      email: "jane@example.com",
      name: "\u{1F600}".repeat(150),
      emailVerified: true,
    });

    const userName = sentUserName(sender);
    expect(Array.from(userName)).toHaveLength(100);
    expect(userName).toBe("\u{1F600}".repeat(100));
  });
});
