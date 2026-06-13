/**
 * Runtime environment variable validation.
 *
 * Import this module from layout.tsx or a top-level server component
 * to get fast-fail on missing env vars in development.
 *
 * In production builds, missing non-optional vars will throw at startup.
 */

/**
 * During `next build` the route handlers are pre-rendered / collected and
 * the runtime env vars are typically not available yet. We skip validation
 * for these phases so the build succeeds, and enforce the check at runtime.
 */
const isBuildPhase =
  process.env.NEXT_PHASE === "phase-production-build";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    if (isBuildPhase) return "" as string;
    throw new Error(
      `[env] Missing required environment variable: ${name}. See .env.example for reference.`,
    );
  }
  return value;
}

function optional(name: string, fallback?: string): string | undefined {
  return process.env[name] ?? fallback;
}

/**
 * Required in production, optional in development.
 * Prevents dev-time crashes from env vars that only matter for
 * third-party services (Stripe, Resend, etc.).
 */
function devOptional(name: string): string | undefined {
  const value = process.env[name];
  if (!value && process.env.NODE_ENV === "production" && !isBuildPhase) {
    throw new Error(
      `[env] Missing required environment variable: ${name}. See .env.example for reference.`,
    );
  }
  return value;
}

// ---------------------------------------------------------------------------
// Validate all required env vars at import time (server-side only).
// This file should ONLY be imported in Server Components / API routes.
// ---------------------------------------------------------------------------

export const env = {
  // Database
  DATABASE_URL: required("DATABASE_URL"),

  // Supabase
  NEXT_PUBLIC_SUPABASE_URL: required("NEXT_PUBLIC_SUPABASE_URL"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: required("NEXT_PUBLIC_SUPABASE_ANON_KEY"),

  // Auth
  BETTER_AUTH_SECRET: required("BETTER_AUTH_SECRET"),
  BETTER_AUTH_URL: required("BETTER_AUTH_URL"),
  LINKEDIN_CLIENT_ID: required("LINKEDIN_CLIENT_ID"),
  LINKEDIN_CLIENT_SECRET: required("LINKEDIN_CLIENT_SECRET"),
  GITHUB_CLIENT_ID: devOptional("GITHUB_CLIENT_ID"),
  GITHUB_CLIENT_SECRET: devOptional("GITHUB_CLIENT_SECRET"),
  GOOGLE_CLIENT_ID: devOptional("GOOGLE_CLIENT_ID"),
  GOOGLE_CLIENT_SECRET: devOptional("GOOGLE_CLIENT_SECRET"),
  FACEBOOK_CLIENT_ID: devOptional("FACEBOOK_CLIENT_ID"),
  FACEBOOK_CLIENT_SECRET: devOptional("FACEBOOK_CLIENT_SECRET"),
  TWITTER_CLIENT_ID: devOptional("TWITTER_CLIENT_ID"),
  TWITTER_CLIENT_SECRET: devOptional("TWITTER_CLIENT_SECRET"),

  // AI — at least one of OPENROUTER_API_KEY or ANTHROPIC_API_KEY must be set.
  // OpenRouter is the primary provider; Anthropic is the fallback / BYOK provider.
  OPENROUTER_API_KEY: optional("OPENROUTER_API_KEY"),
  ANTHROPIC_API_KEY: optional("ANTHROPIC_API_KEY"),
  DEFAULT_AI_MODEL: optional("DEFAULT_AI_MODEL", "claude-sonnet-4-5-20250929"),

  // BYOK (Bring Your Own Key) — encryption key for storing user API keys at rest.
  // Only required if the BYOK feature is enabled. Must be a 256-bit hex string.
  BYOK_ENCRYPTION_KEY: optional("BYOK_ENCRYPTION_KEY"),

  // Stripe (required in production, optional in dev)
  STRIPE_SECRET_KEY: devOptional("STRIPE_SECRET_KEY"),
  STRIPE_WEBHOOK_SECRET: devOptional("STRIPE_WEBHOOK_SECRET"),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: devOptional(
    "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
  ),

  // Email (required in production, optional in dev)
  RESEND_API_KEY: devOptional("RESEND_API_KEY"),
  EMAIL_FROM: optional("EMAIL_FROM", "alerts@hust.so"),

  // App
  NEXT_PUBLIC_APP_URL: optional("NEXT_PUBLIC_APP_URL", "https://hust.so"),
  NEXT_PUBLIC_APP_NAME: optional("NEXT_PUBLIC_APP_NAME", "Hust"),

  // Langfuse (optional — falls back to hardcoded prompts)
  LANGFUSE_PUBLIC_KEY: optional("LANGFUSE_PUBLIC_KEY"),
  LANGFUSE_SECRET_KEY: optional("LANGFUSE_SECRET_KEY"),
  LANGFUSE_BASE_URL: optional("LANGFUSE_BASE_URL", "https://cloud.langfuse.com"),

  // Upstash (optional — falls back to in-memory rate limiting)
  UPSTASH_REDIS_REST_URL: optional("UPSTASH_REDIS_REST_URL"),
  UPSTASH_REDIS_REST_TOKEN: optional("UPSTASH_REDIS_REST_TOKEN"),

  // Trigger.dev (optional in dev)
  TRIGGER_SECRET_KEY: optional("TRIGGER_SECRET_KEY"),

  // Ever Jobs external API (optional in dev)
  EVER_JOBS_API_URL: optional("EVER_JOBS_API_URL"),
  EVER_JOBS_API_KEY: optional("EVER_JOBS_API_KEY"),

  // Google Maps (optional — map view disabled when not set)
  NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: optional("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY"),

  // PostHog analytics (optional — analytics disabled when not set)
  NEXT_PUBLIC_POSTHOG_KEY: optional("NEXT_PUBLIC_POSTHOG_KEY"),
  NEXT_PUBLIC_POSTHOG_HOST: optional("NEXT_PUBLIC_POSTHOG_HOST", "https://us.i.posthog.com"),

  // Sentry error tracking (optional — error tracking disabled when not set)
  NEXT_PUBLIC_SENTRY_DSN: optional("NEXT_PUBLIC_SENTRY_DSN"),

  // Novu notifications (optional — notifications disabled when not set)
  NOVU_API_KEY: optional("NOVU_API_KEY"),
} as const;

// ---------------------------------------------------------------------------
// Cross-field validations (run once at import time)
// ---------------------------------------------------------------------------

if (!env.OPENROUTER_API_KEY && !env.ANTHROPIC_API_KEY) {
  console.warn(
    "[env] WARNING: Neither OPENROUTER_API_KEY nor ANTHROPIC_API_KEY is set. " +
      "AI features will not work. Set at least one in your .env.local.",
  );
}
