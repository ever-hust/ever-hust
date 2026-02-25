import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@ever-hust/db/client";
import * as schema from "@ever-hust/db/schema";

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
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,

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
          from: process.env.EMAIL_FROM ?? "alerts@everjobs.ai",
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

  socialProviders: {
    linkedin: {
      clientId: process.env.LINKEDIN_CLIENT_ID ?? "",
      clientSecret: process.env.LINKEDIN_CLIENT_SECRET ?? "",
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
    github: {
      clientId: process.env.GITHUB_CLIENT_ID ?? "",
      clientSecret: process.env.GITHUB_CLIENT_SECRET ?? "",
    },
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    },
    facebook: {
      clientId: process.env.FACEBOOK_CLIENT_ID ?? "",
      clientSecret: process.env.FACEBOOK_CLIENT_SECRET ?? "",
    },
    twitter: {
      clientId: process.env.TWITTER_CLIENT_ID ?? "",
      clientSecret: process.env.TWITTER_CLIENT_SECRET ?? "",
    },
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
});

export type Auth = typeof auth;
