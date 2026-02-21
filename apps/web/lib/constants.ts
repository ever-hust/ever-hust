/**
 * Shared application constants.
 *
 * Centralises magic numbers and important configuration values so they can be
 * referenced from a single source of truth. When a value is used across
 * multiple files (or is a meaningful configuration knob), it belongs here.
 */

// ---------------------------------------------------------------------------
// AI / Chat
// ---------------------------------------------------------------------------

/** Maximum agentic tool-use steps the orchestrator may take per chat turn. */
export const MAX_AI_STEPS_PER_TURN = 5;

/** Vercel serverless `maxDuration` for the AI chat streaming route (seconds). */
export const AI_STREAM_MAX_DURATION_SECONDS = 60;

/** Maximum aggregate character count across all messages in a single chat request. */
export const MAX_CHAT_PAYLOAD_CHARS = 500_000;

/** Maximum character length for a single chat message content field. */
export const MAX_SINGLE_MESSAGE_CHARS = 50_000;

/** Maximum number of messages allowed in a single chat request. */
export const MAX_MESSAGES_PER_REQUEST = 100;

// ---------------------------------------------------------------------------
// Jobs Canvas
// ---------------------------------------------------------------------------

/** Maximum number of jobs that can be compared side-by-side at once. */
export const MAX_COMPARE_JOBS = 3;

// ---------------------------------------------------------------------------
// Free-Tier Limits
// (Canonical numeric values live in @ever-hust/stripe — FREE_LIMITS.
//  These re-exports exist for files that only need the numbers without
//  pulling in the full Stripe package, e.g. client-side code.)
// ---------------------------------------------------------------------------

/** Daily message limit for free-tier users. */
export const FREE_TIER_DAILY_MESSAGES = 10;

/** Daily search limit for free-tier users. */
export const FREE_TIER_DAILY_SEARCHES = 5;

/** Weekly cover letter limit for free-tier users. */
export const FREE_TIER_WEEKLY_COVER_LETTERS = 1;

// ---------------------------------------------------------------------------
// Time Constants
// ---------------------------------------------------------------------------

/** One day in milliseconds. */
export const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/** One week in milliseconds. */
export const ONE_WEEK_MS = 7 * ONE_DAY_MS;
