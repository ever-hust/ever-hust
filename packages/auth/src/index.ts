import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { anonymous } from "better-auth/plugins";
import { db } from "@ever-hust/db/client";
import * as schema from "@ever-hust/db/schema";
import { anonymousSelfDeleteGuard } from "./anonymous-self-delete-guard";
import { emailGreetingName } from "./email-greeting-name";
import { linkAnonymousUser } from "./link-anonymous-user";
import { migrateAnonymousUserData } from "./migrate-anonymous-user";
import { getProviderCredentials } from "./providers";
import { userAdditionalFields } from "./user-fields";

const linkedinCredentials = getProviderCredentials("linkedin");
const githubCredentials = getProviderCredentials("github");
const googleCredentials = getProviderCredentials("google");
const facebookCredentials = getProviderCredentials("facebook");
const twitterCredentials = getProviderCredentials("twitter");

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      ...schema,
      // BetterAuth expects singular model names; our Drizzle schema uses plural
      user: schema.users,
      session: schema.sessions,
      account: schema.accounts,
      verification: schema.verifications,
    },
  }),

  // Declare custom columns on the users table so Better Auth can persist them
  user: {
    additionalFields: userAdditionalFields,
  },
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,

  // Failed OAuth callbacks land on the login page (which shows the error)
  // instead of the default `/?error=…`, whose redirect to /login drops it.
  onAPIError: {
    errorURL: "/login",
  },

  // ---------------------------------------------------------------------------
  // Email & Password authentication (fallback for users without social accounts)
  // ---------------------------------------------------------------------------
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    requireEmailVerification: true,
    sendResetPassword: async ({ user, url }) => {
      // The React Email template escapes the name; sign-up accepts any name, so
      // it must never go into raw HTML. emailGreetingName only prints it once the
      // address is verified.
      try {
        const { sendPasswordResetEmail } = await import("@ever-hust/email");
        await sendPasswordResetEmail({
          to: user.email,
          userName: emailGreetingName(user),
          resetUrl: url,
        });
      } catch (error) {
        console.error(
          `[Auth] Failed to send password reset email to ${user.email}:`,
          error instanceof Error ? error.message : error
        );
      }
    },
  },

  // ---------------------------------------------------------------------------
  // Email verification — only applies to email/password sign-ups
  // ---------------------------------------------------------------------------
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    expiresIn: 60 * 60 * 24, // 24 hours
    sendVerificationEmail: async ({ user, url }) => {
      // Sent at sign-up, before the address is verified: no sign-up name in it.
      try {
        const { sendVerificationEmail: sendEmail } = await import("@ever-hust/email");
        await sendEmail({
          to: user.email,
          userName: emailGreetingName(user),
          verificationUrl: url,
        });
      } catch (error) {
        console.error(
          `[Auth] Failed to send verification email to ${user.email}:`,
          error instanceof Error ? error.message : error
        );
      }
    },
  },

  // ---------------------------------------------------------------------------
  // Account linking: allows users who registered with LinkedIn to later log in
  // with GitHub (or other providers) by matching on verified email.
  // ---------------------------------------------------------------------------
  account: {
    accountLinking: {
      enabled: true,
      trustedProviders: ["linkedin", "github", "google", "facebook", "twitter"],
    },
  },

  // Only providers with credentials are registered (see providers.ts); the
  // login page asks /api/auth-providers which ones to show.
  socialProviders: {
    ...(linkedinCredentials && {
      linkedin: {
        ...linkedinCredentials,
        scope: ["openid", "profile", "email"],
        mapProfileToUser: (profile) => {
          const raw = profile as unknown as Record<string, unknown>;
          return {
            name: profile.name,
            email: profile.email,
            image: profile.picture,
            linkedinId: profile.sub,
            linkedinData: raw,
            headline: (raw.headline as string) ?? null,
            photoUrl: profile.picture ?? null,
          };
        },
      },
    }),
    ...(githubCredentials && { github: githubCredentials }),
    ...(googleCredentials && { google: googleCredentials }),
    ...(facebookCredentials && { facebook: facebookCredentials }),
    ...(twitterCredentials && { twitter: twitterCredentials }),
  },
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5, // 5 minutes
    },
  },
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          // Skip anonymous trial users — they carry a generated @hust.local email
          // and receive their own welcome when they convert to a real account.
          if ((user as { isAnonymous?: boolean }).isAnonymous) return;
          // Send welcome email to newly registered users (non-blocking). An
          // email/password sign-up is not verified yet, so it is greeted as "there".
          try {
            const { sendWelcomeEmail } = await import("@ever-hust/email");
            await sendWelcomeEmail({
              to: user.email,
              userName: emailGreetingName(user),
            });
          } catch (error) {
            // Log but don't block user creation if email fails
            console.error(
              `[Auth] Failed to send welcome email to ${user.email}:`,
              error instanceof Error ? error.message : error
            );
          }
        },
      },
    },
  },

  // A guest deletes their account through DELETE /api/user/account, which hands
  // their organizations to another member first. The anonymous plugin's own
  // POST /delete-anonymous-user would delete the guest row directly and cascade
  // to every organization they created, so it is refused here.
  hooks: {
    before: anonymousSelfDeleteGuard,
  },

  // ---------------------------------------------------------------------------
  // Anonymous "try it" sessions — frictionless trial from the marketing site
  // (hust.so). A guest gets a real session (generated <id>@hust.local email),
  // can use the AI chat immediately, and is prompted to sign up. On sign-up the
  // plugin links the account and linkAnonymousUser moves their work over,
  // organizations included, in one transaction and deletes the guest only once
  // that has committed. The plugin's own delete is off: it ran even when the
  // move failed, and every table the guest owns cascades on that delete.
  // ---------------------------------------------------------------------------
  plugins: [
    anonymous({
      emailDomainName: "hust.local",
      disableDeleteAnonymousUser: true,
      onLinkAccount: async ({ anonymousUser, newUser, ctx }) => {
        await linkAnonymousUser(
          { anonymousUser, newUser },
          {
            migrate: (fromId, toId) =>
              migrateAnonymousUserData(db, fromId, toId),
            deleteGuest: (guestId) =>
              ctx.context.internalAdapter.deleteUser(guestId),
          },
        );
      },
    }),
  ],
});

export type Auth = typeof auth;
