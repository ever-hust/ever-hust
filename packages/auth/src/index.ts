import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@repo/db/client";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
  }),
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  socialProviders: {
    linkedin: {
      clientId: process.env.LINKEDIN_CLIENT_ID!,
      clientSecret: process.env.LINKEDIN_CLIENT_SECRET!,
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
            const { sendWelcomeEmail } = await import("@repo/email");
            await sendWelcomeEmail({
              to: user.email,
              userName: user.name ?? user.email.split("@")[0],
            });
          } catch (error) {
            // Log but don't block user creation if email fails
            console.error(
              `[Auth] Failed to send welcome email to ${user.email}:`,
              error
            );
          }
        },
      },
    },
  },
});

export type Auth = typeof auth;
