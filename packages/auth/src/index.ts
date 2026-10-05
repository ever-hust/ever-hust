import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { anonymous } from "better-auth/plugins";
import { eq } from "drizzle-orm";
import { db } from "@ever-hust/db/client";
import * as schema from "@ever-hust/db/schema";
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
      try {
        const { Resend } = await import("resend");
        const resend = new Resend(process.env.RESEND_API_KEY);
        await resend.emails.send({
          from: process.env.EMAIL_FROM ?? "alerts@hust.so",
          to: user.email,
          subject: "Reset your password",
          html: `
            <p>Hi ${user.name ?? user.email.split("@")[0]},</p>
            <p>Click the link below to reset your password:</p>
            <p><a href="${url}">Reset Password</a></p>
            <p>If you didn't request this, you can safely ignore this email.</p>
          `,
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
      try {
        const { sendVerificationEmail: sendEmail } = await import("@ever-hust/email");
        await sendEmail({
          to: user.email,
          userName: user.name ?? user.email.split("@")[0],
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
          // Send welcome email to newly registered users (non-blocking)
          try {
            const { sendWelcomeEmail } = await import("@ever-hust/email");
            await sendWelcomeEmail({
              to: user.email,
              userName: user.name ?? user.email.split("@")[0],
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

  // ---------------------------------------------------------------------------
  // Anonymous "try it" sessions — frictionless trial from the marketing site
  // (hust.so). A guest gets a real session (generated <id>@hust.local email),
  // can use the AI chat immediately, and is prompted to sign up. On sign-up the
  // plugin links the account and we carry their work over before the guest is
  // removed.
  // ---------------------------------------------------------------------------
  plugins: [
    anonymous({
      emailDomainName: "hust.local",
      onLinkAccount: async ({ anonymousUser, newUser }) => {
        try {
          const pick = (v: { user?: { id?: string }; id?: string }) =>
            v?.user?.id ?? v?.id;
          const fromId = pick(anonymousUser as { user?: { id?: string }; id?: string });
          const toId = pick(newUser as { user?: { id?: string }; id?: string });
          if (!fromId || !toId || fromId === toId) return;
          // Re-point the guest's user-owned rows to the permanent account.
          await db
            .update(schema.chatSessions)
            .set({ userId: toId })
            .where(eq(schema.chatSessions.userId, fromId));
          await db
            .update(schema.userJobs)
            .set({ userId: toId })
            .where(eq(schema.userJobs.userId, fromId));
          await db
            .update(schema.applications)
            .set({ userId: toId })
            .where(eq(schema.applications.userId, fromId));
          await db
            .update(schema.userAlerts)
            .set({ userId: toId })
            .where(eq(schema.userAlerts.userId, fromId));
        } catch (error) {
          // Best-effort — never block sign-up if the migration fails.
          console.error(
            "[Auth] Failed to migrate anonymous user data on link:",
            error instanceof Error ? error.message : error
          );
        }
      },
    }),
  ],
});

export type Auth = typeof auth;
