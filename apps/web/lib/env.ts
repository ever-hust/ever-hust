/**
 * Runtime environment variable validation.
 *
 * Import this module from layout.tsx or a top-level server component
 * to get fast-fail on missing env vars in development.
 *
 * In production builds, missing non-optional vars will throw at startup.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `[env] Missing required environment variable: ${name}. See .env.example for reference.`,
    );
  }
  return value;
}

function optional(name: string, fallback?: string): string | undefined {
  return process.env[name] ?? fallback;
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

  // AI
  ANTHROPIC_API_KEY: required("ANTHROPIC_API_KEY"),
  DEFAULT_AI_MODEL: optional("DEFAULT_AI_MODEL", "claude-opus-4-6"),

  // Stripe
  STRIPE_SECRET_KEY: required("STRIPE_SECRET_KEY"),
  STRIPE_WEBHOOK_SECRET: required("STRIPE_WEBHOOK_SECRET"),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: required(
    "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
  ),

  // Email
  RESEND_API_KEY: required("RESEND_API_KEY"),
  EMAIL_FROM: optional("EMAIL_FROM", "alerts@everjobs.ai"),

  // App
  NEXT_PUBLIC_APP_URL: optional("NEXT_PUBLIC_APP_URL", "http://localhost:3000"),
  NEXT_PUBLIC_APP_NAME: optional("NEXT_PUBLIC_APP_NAME", "Ever Jobs"),

  // Upstash (optional — falls back to in-memory rate limiting)
  UPSTASH_REDIS_REST_URL: optional("UPSTASH_REDIS_REST_URL"),
  UPSTASH_REDIS_REST_TOKEN: optional("UPSTASH_REDIS_REST_TOKEN"),

  // Trigger.dev (optional in dev)
  TRIGGER_SECRET_KEY: optional("TRIGGER_SECRET_KEY"),

  // Ever Jobs external API (optional in dev)
  EVER_JOBS_API_URL: optional("EVER_JOBS_API_URL"),
  EVER_JOBS_API_KEY: optional("EVER_JOBS_API_KEY"),
} as const;
