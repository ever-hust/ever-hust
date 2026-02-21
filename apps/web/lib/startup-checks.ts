/**
 * Startup validation checks for production readiness.
 *
 * Call `runStartupChecks()` from `instrumentation.ts` to validate
 * environment configuration on server startup. Critical missing vars
 * will throw (preventing boot), while optional-but-recommended vars
 * log warnings.
 */

const LOG_PREFIX = "[startup]";

// ---------------------------------------------------------------------------
// Environment variable definitions
// ---------------------------------------------------------------------------

/** Env vars that the application cannot function without. */
const CRITICAL_ENV_VARS = [
  "DATABASE_URL",
  "BETTER_AUTH_SECRET",
] as const;

/**
 * Env vars that are not strictly required to boot but whose absence
 * will degrade important functionality. Each entry has a human-readable
 * description of what is affected.
 */
const RECOMMENDED_ENV_VARS: ReadonlyArray<{ name: string; impact: string }> = [
  { name: "BETTER_AUTH_URL", impact: "Auth callbacks may use wrong host" },
  { name: "LINKEDIN_CLIENT_ID", impact: "LinkedIn OAuth login will not work" },
  { name: "LINKEDIN_CLIENT_SECRET", impact: "LinkedIn OAuth login will not work" },
  { name: "STRIPE_SECRET_KEY", impact: "Subscription billing will not work" },
  { name: "STRIPE_WEBHOOK_SECRET", impact: "Stripe webhook verification will fail" },
  { name: "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", impact: "Client-side Stripe checkout will not work" },
  { name: "RESEND_API_KEY", impact: "Transactional emails will not be sent" },
  { name: "NEXT_PUBLIC_SUPABASE_URL", impact: "Supabase Realtime and Storage will not work" },
  { name: "NEXT_PUBLIC_SUPABASE_ANON_KEY", impact: "Supabase client-side access will not work" },
  { name: "NEXT_PUBLIC_APP_URL", impact: "Email links and OAuth callbacks may use incorrect host" },
];

/**
 * Env vars that enhance the platform but are entirely optional.
 * Only logged at debug level.
 */
const OPTIONAL_ENV_VARS: ReadonlyArray<{ name: string; feature: string }> = [
  { name: "OPENROUTER_API_KEY", feature: "OpenRouter AI model routing" },
  { name: "ANTHROPIC_API_KEY", feature: "Direct Anthropic API access" },
  { name: "LANGFUSE_PUBLIC_KEY", feature: "Langfuse AI observability tracing" },
  { name: "LANGFUSE_SECRET_KEY", feature: "Langfuse AI observability tracing" },
  { name: "UPSTASH_REDIS_REST_URL", feature: "Distributed rate limiting (falls back to in-memory)" },
  { name: "UPSTASH_REDIS_REST_TOKEN", feature: "Distributed rate limiting (falls back to in-memory)" },
  { name: "TRIGGER_SECRET_KEY", feature: "Trigger.dev background jobs" },
  { name: "EVER_JOBS_API_URL", feature: "Ever Jobs external API integration" },
  { name: "EVER_JOBS_API_KEY", feature: "Ever Jobs external API integration" },
  { name: "HEALTH_CHECK_TOKEN", feature: "Authenticated health check endpoint" },
  { name: "BYOK_ENCRYPTION_KEY", feature: "User API key encryption (BYOK)" },
];

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

function validateCriticalEnvVars(): string[] {
  const missing: string[] = [];
  for (const name of CRITICAL_ENV_VARS) {
    if (!process.env[name]) {
      missing.push(name);
    }
  }
  return missing;
}

function warnRecommendedEnvVars(): void {
  const missing = RECOMMENDED_ENV_VARS.filter((v) => !process.env[v.name]);
  if (missing.length === 0) return;

  console.warn(
    `${LOG_PREFIX} Missing recommended environment variables (${missing.length}):`,
  );
  for (const { name, impact } of missing) {
    console.warn(`  - ${name}: ${impact}`);
  }
}

function logOptionalEnvVars(): void {
  const missing = OPTIONAL_ENV_VARS.filter((v) => !process.env[v.name]);
  if (missing.length === 0) return;

  console.log(
    `${LOG_PREFIX} Optional environment variables not configured (${missing.length}):`,
  );
  for (const { name, feature } of missing) {
    console.log(`  - ${name}: ${feature}`);
  }
}

function validateAiProvider(): void {
  if (!process.env.OPENROUTER_API_KEY && !process.env.ANTHROPIC_API_KEY) {
    console.warn(
      `${LOG_PREFIX} WARNING: Neither OPENROUTER_API_KEY nor ANTHROPIC_API_KEY is set. ` +
        "AI features will not work.",
    );
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Run all startup validation checks.
 *
 * - Throws if critical env vars are missing (prevents server boot).
 * - Logs warnings for recommended-but-missing vars.
 * - Logs info for optional vars.
 *
 * Safe to call multiple times (idempotent).
 */
export function runStartupChecks(): void {
  console.log(`${LOG_PREFIX} Running startup checks...`);

  // 1. Critical env vars — fail fast
  const missingCritical = validateCriticalEnvVars();
  if (missingCritical.length > 0) {
    const message =
      `${LOG_PREFIX} FATAL: Missing critical environment variables: ${missingCritical.join(", ")}. ` +
      "The application cannot start. See .env.example for reference.";
    console.error(message);
    throw new Error(message);
  }

  // 2. Validate BETTER_AUTH_SECRET strength
  const authSecret = process.env.BETTER_AUTH_SECRET ?? "";
  if (authSecret.length < 32) {
    console.warn(
      `${LOG_PREFIX} WARNING: BETTER_AUTH_SECRET is only ${authSecret.length} characters. ` +
        "A minimum of 32 characters is strongly recommended for production security.",
    );
  }

  // 3. AI provider cross-check
  validateAiProvider();

  // 4. Recommended env vars — warn but continue
  warnRecommendedEnvVars();

  // 5. Optional env vars — informational
  logOptionalEnvVars();

  console.log(`${LOG_PREFIX} Startup checks passed.`);
}
