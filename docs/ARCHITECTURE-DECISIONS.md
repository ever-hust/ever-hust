# Hust — Architecture Decision Records (ADR)

**Date**: 2026-02-15

This document captures key architectural decisions made during the MVP implementation of Hust.

---

## ADR-001: Next.js Route Groups for Dashboard

**Context**: The app has public pages (landing, pricing, login) and protected pages (chat, jobs, profile, settings). We need a way to share a layout (sidebar + split-screen) across protected pages without affecting URL structure.

**Decision**: Use Next.js route groups — `(marketing)`, `(auth)`, and `(dashboard)` — which share layouts but do NOT add URL segments.

**Consequence**:

- Actual URLs are `/chat`, `/jobs`, `/profile`, `/settings` (NOT `/dashboard/chat`)
- All nav links, redirects, email templates, and middleware must use the direct paths
- Legacy `/dashboard` URL redirects to `/chat` via middleware

**Status**: Implemented and verified across all 8 affected files.

---

## ADR-002: Model Router with BYOK Priority Chain

**Context**: Users need different AI models based on their subscription tier, and power users want to bring their own API keys.

**Decision**: Implement a 4-level priority chain in `packages/ai/src/model-router.ts`:

1. **BYOK**: If user has `preferences.apiKeys.anthropic`, create a dedicated provider via `createAnthropic({ apiKey })`
2. **User Preference**: If user selected a specific model in settings
3. **Tier Default**: Free → Claude Haiku 4.5, Paid → Claude Opus 4.6
4. **Environment Default**: Fallback to `DEFAULT_AI_MODEL` env var

**Consequence**:

- BYOK users always get their preferred model regardless of subscription
- `createAnthropic()` (not the default `anthropic()` helper) is required for custom API keys
- Keys stored at `preferences.apiKeys.anthropic` in user's JSONB preferences column

**Status**: Implemented and functional.

---

## ADR-003: Email URL Centralization

**Context**: Email templates contain links to the app (dashboard, settings, etc.). These links must work correctly in all environments (dev, staging, production).

**Decision**: Create a `getAppUrl()` helper in `packages/email/src/index.ts` that reads `NEXT_PUBLIC_APP_URL` with `https://everjobs.ai` fallback. All send functions use this for default URL generation.

**Consequence**:

- Zero hardcoded URLs in email templates or send functions
- Environment-specific URLs work automatically via env var
- `settingsUrl` derived from `dashboardUrl` via string replace

**Status**: Implemented.

---

## ADR-004: Welcome Email via BetterAuth Database Hook

**Context**: New users should receive a welcome email on signup. Options: (a) API route after login redirect, (b) BetterAuth database hook, (c) separate webhook.

**Decision**: Use BetterAuth's `databaseHooks.user.create.after` callback in `packages/auth/src/index.ts`.

**Rationale**:

- Fires exactly once per user creation (not on every login)
- No additional API calls needed
- Happens server-side, no client dependency
- Fail-safe: wrapped in try/catch so email failure doesn't block user creation

**Status**: Implemented.

---

## ADR-005: Dual Application Tracking

**Context**: When a user applies to a job via the AI agent, we need to track it in two tables: `applications` (detailed tracking with agent state, questions/answers) and `userJobs` (user-facing status for profile display).

**Decision**: `applyJobTool` upserts into both tables:

- Creates `applications` record with agent instance reference
- Upserts `userJobs` with status "applied" (may upgrade from "favorited")

**Consequence**:

- Profile API can query `userJobs` for a simple list of applied jobs
- Detailed application state (questions, answers, cover letters) lives in `applications`
- A favorited job that gets applied to changes status from "favorited" to "applied"

**Status**: Implemented.

---

## ADR-006: Zod Validation on All API Routes

**Context**: API routes need input validation to prevent malformed data and provide clear error messages.

**Decision**: Use Zod schemas on every API route handler. Validate request body/params at the top of each handler, return 400 with Zod error details on failure.

**Consequence**:

- Consistent error format across all endpoints
- Type-safe parsing (Zod infers TypeScript types)
- No invalid data reaches DB queries
- Schema definitions serve as API documentation

**Status**: Implemented across all API routes.

---

## ADR-007: Security Headers via Middleware

**Context**: The app needs Content Security Policy and other security headers for production deployment.

**Decision**: Add security headers in `apps/web/middleware.ts` applied to all responses:

- `Content-Security-Policy`: Restrict script/connect/frame sources (allows Stripe, Supabase)
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy`: Restrict camera, microphone, geolocation

**Consequence**:

- Headers applied to all routes via Next.js middleware
- CSP allows required third-party domains (Stripe JS, Supabase WebSocket)
- Can be tightened further for production (remove `unsafe-eval`, `unsafe-inline`)

**Status**: Implemented.

---

## ADR-008: Trigger.dev for Background Tasks

**Context**: The app needs scheduled background tasks for job syncing, alert delivery, and data cleanup.

**Decision**: Use Trigger.dev v3 with three cron tasks:

- `sync-jobs`: Every 15 minutes, fetch new jobs from Ever Jobs API
- `send-alerts`: Daily/twice-daily/weekly, match jobs to user alert criteria and send emails
- `cleanup`: Daily, expire old jobs and clean stale chat sessions

**Consequence**:

- Declarative cron schedules with Trigger.dev's scheduler
- Tasks run in separate process, don't block web server
- Each task is independently deployable and monitorable
- Alert frequency matching (daily, twice_daily, weekly) handled by comparing `lastSentAt` against threshold

**Status**: Implemented.

---

## ADR-009: Subscription Gating via API Middleware

**Context**: Free tier users have limited access to features (10 messages/day, 5 searches/day, etc.). Need a way to enforce limits.

**Decision**: Implement gating at the API route level:

- Chat route checks subscription status and daily message count
- Search tools check daily search count
- Cover letter generation checks weekly count
- Feature-specific tools (alerts, application agent) check subscription status

**Consequence**:

- Limits enforced server-side (cannot be bypassed by client)
- Subscription status checked from DB on each request
- Clear error messages returned when limits exceeded
- Paid users get unlimited access to all features

**Status**: Implemented.

---

## ADR-010: Chat Deep-Links via Query Parameters

**Context**: Users may arrive at the chat page with a specific intent (e.g., from a job listing wanting to ask about a specific job).

**Decision**: Chat page reads `?job=` query parameter and auto-sends as initial prompt:

- `ChatPanel` accepts `initialPrompt` prop
- Uses `useRef` to ensure prompt sent only once
- `useEffect` waits for chat to be ready before sending

**Consequence**:

- Job cards can link to `/chat?job=Tell me about [job title] at [company]`
- Structured data SearchAction can use `/chat?q={search_term_string}`
- Initial prompt sent automatically without user intervention
- Guard prevents duplicate sends on re-renders

**Status**: Implemented.

---

## ADR-011: OpenRouter as Primary LLM Provider

**Context**: The app previously called Anthropic's API directly. We need multi-model support, cost optimization, and the ability to switch providers without code changes.

**Decision**: Route all non-BYOK LLM requests through OpenRouter. The model router translates Anthropic model IDs to OpenRouter model IDs using a constant map (`ANTHROPIC_TO_OPENROUTER`).

**Priority chain**:

1. BYOK → `createAnthropic({ apiKey })` (direct to Anthropic)
2. Non-BYOK → `createOpenRouter()` with translated model ID
3. Fallback → `anthropic()` if neither OpenRouter nor Anthropic key set

**Consequence**:

- Model switching happens at the config level, not code level
- OpenRouter handles load balancing and fallbacks
- Anthropic keys only needed for BYOK users
- Tier defaults updated: Free → Haiku 4.5, Paid → Sonnet 4, BYOK → Opus 4

**Status**: Implemented.

---

## ADR-012: Langfuse for Prompt Management

**Context**: AI prompts need to be iterable without code deployments. Prompt engineering should be decoupled from application code.

**Decision**: Use Langfuse's prompt management API via `packages/ai/src/prompts.ts`. The `getPrompt()` helper:

1. Fetches prompt from Langfuse by name/version
2. Falls back to hardcoded defaults if Langfuse is unavailable (no env vars, network error, etc.)
3. Caches prompts in-memory to avoid repeated API calls

**Consequence**:

- Prompts can be edited in Langfuse dashboard without redeployment
- App works offline/without Langfuse (graceful degradation)
- All Langfuse env vars are optional
- Orchestrator agent's system prompt is async (fetched at request time)

**Status**: Implemented.

---

## ADR-013: Jest Configuration for AI SDK Compatibility

**Context**: ts-jest would OOM when type-checking files that import AI SDK v6's deeply-nested generics (`tool<T>`, `generateObject<T>`). Tests would crash before running.

**Decision**: Configure ts-jest with `diagnostics: false` and `tsconfig: { isolatedModules: true }`. This skips type-checking during test compilation (type-checking happens separately via `tsc --noEmit` in the build step).

**Key findings**:

- AI SDK v6 `tool()` returns objects with `inputSchema` (not `parameters`) at runtime
- `--max-old-space-size=4096` heap allocation needed in CI
- `--experimental-vm-modules` required for ESM support in Jest

**Consequence**:

- Tests compile fast without OOM
- Type safety maintained via separate build step
- CI/CD allocates sufficient memory for test runs
- Test count: 38 suites, 1240 tests across 9 projects

**Status**: Implemented.

---

## ADR-014: GitHub Actions CI/CD Pipeline

**Context**: Need automated quality gates before code reaches production.

**Decision**: Three-job GitHub Actions pipeline:

1. **Lint & Type Check**: Runs `turbo build` with dummy env vars on every push to main/develop
2. **Unit Tests**: Runs Jest with coverage, uploads coverage artifact
3. **E2E Tests**: Runs Playwright on PRs targeting main only (expensive)

**Consequence**:

- Concurrency groups cancel redundant runs
- Node 22, pnpm 9 cached for speed
- E2E tests gated to main PRs to save CI minutes
- Coverage reports uploaded as build artifacts

**Status**: Implemented.

---

## ADR-015: Environment Variable Validation

**Context**: Multiple packages read env vars with `!` non-null assertions, which crash at runtime if vars are missing. Need fail-fast behavior.

**Decision**: `apps/web/lib/env.ts` validates all env vars at import time:

- `required()`: throws if missing
- `optional()`: returns undefined or fallback
- Cross-field validations: warns if no AI provider key is set

**Consequence**:

- Missing required vars fail at server startup, not at request time
- Clear error messages reference `.env.example`
- AI keys are both optional (at least one required, validated via cross-field check)
- Langfuse, Redis, Trigger.dev are fully optional

**Status**: Implemented.

---

## ADR-016: Build-Safe Environment Variable Validation

**Context**: The `env.ts` module validates all env vars at import time. However, during `next build`, route handlers are pre-rendered/collected and runtime env vars are unavailable, causing build failures.

**Decision**: Detect the build phase via `process.env.NEXT_PHASE === "phase-production-build"` and skip validation:

- `required()`: Returns `""` during build phase instead of throwing
- `devOptional()`: Skips the production-only check during build phase
- Runtime behavior is unchanged — missing required vars still throw at server startup

**Consequence**:

- `pnpm build` succeeds without all env vars being set
- Runtime validation is unaffected (enforced at startup)
- `NEXT_PHASE` is set internally by Next.js, not a user-configured env var
- Tests for `devOptional` vars split into dev-mode (no throw) and production-mode (throws) variants

**Status**: Implemented.

---

## ADR-017: Email Verification for Password Signups

**Context**: Users signing up with email/password need to verify their email address to prevent abuse and ensure deliverability of transactional emails.

**Decision**: Use BetterAuth's built-in `emailVerification` configuration in `packages/auth/src/index.ts`:

- `sendOnSignUp: true` — sends verification email immediately on registration
- `autoSignInAfterVerification: true` — auto-signs user in after clicking verification link
- `expiresIn: 86400` (24 hours) — token expiry
- `requireEmailVerification: true` — blocks login until verified

**Scope**: Only email/password registrations require verification. OAuth providers (LinkedIn, Google, GitHub) are trusted to have pre-verified emails.

**Implementation**:

- Verification email template at `packages/email/src/templates/verification-email.tsx`
- `sendVerificationEmail()` in `packages/email/src/send.ts` with retry logic
- `/verify-email` page at `apps/web/app/(auth)/verify-email/page.tsx`

**Consequence**:

- Reduces spam accounts and validates email deliverability
- Users see a clear "check your email" prompt after signup
- Token-based verification with 24h expiry balances UX and security

**Status**: Implemented.

---

## ADR-018: Uppy + Supabase Storage for File Uploads

**Context**: The app needs file upload capabilities for CVs and avatars. Previously, CV uploads used a custom `CVDropzone` component. The approach needs standardization.

**Decision**: Adopt **Uppy** as the standard file upload library and **Supabase Storage** as the storage backend for all user-uploaded files.

- **Uppy Core** (`@uppy/core`) + **Dashboard** (`@uppy/dashboard`) + **XHR Upload** (`@uppy/xhr-upload`) for the client-side upload UI
- **Supabase Storage** helpers in `packages/supabase/src/storage.ts`: `uploadFile()`, `getPublicUrl()`, `deleteFile()`
- Avatar images stored at `avatars/{userId}.{ext}` in Supabase Storage
- CV PDFs stored at `cvs/{userId}/{filename}` in Supabase Storage

**API routes**:

- `/api/user/avatar` — handles avatar upload, stores in Supabase, updates `photoUrl`
- `/api/cv/upload` — handles CV upload to Supabase + AI extraction pipeline

**Consequence**:

- Single upload library across the app (replaces custom `CVDropzone`)
- CDN-backed storage with public URLs via Supabase
- `SUPABASE_SERVICE_ROLE_KEY` required for server-side uploads
- Deprecated: `apps/web/components/canvas/cv-dropzone.tsx` (deleted)

**Status**: Implemented. Profile page uses `UppyCvUpload` and `UppyAvatarUpload` components.

---

## ADR-019: Dark Mode Toggle on Auth Pages

**Context**: The dashboard has theme support via `next-themes`, but auth pages (login, reset-password) had no way to switch themes before the user is authenticated.

**Decision**: Add a `ThemeToggle` component to the top-right corner of all public auth pages (login, reset-password). The component uses `useTheme()` from `next-themes` with Sun/Moon icons.

**Implementation**:

- `apps/web/components/shared/theme-toggle.tsx` — reusable toggle with animated icon swap
- Rendered in `apps/web/app/(auth)/login/page.tsx` and `apps/web/app/(auth)/reset-password/page.tsx`

**Status**: Implemented.

---

## ADR-020: Global 429 Rate Limit Feedback

**Context**: API routes enforce rate limits, but the client had no unified way to detect and communicate rate limiting to users.

**Decision**: Implement a global `RateLimitInterceptor` component that patches `window.fetch()` to detect HTTP 429 responses and display a user-friendly toast notification via Sonner.

**Details**:

- Mounted once in the root layout (`apps/web/app/layout.tsx`)
- Patches `window.fetch` on mount, restores on unmount
- De-duplicates toasts with a 5-second cooldown to avoid flooding
- Shows "Too many requests — please wait a moment." toast

**Consequence**:

- Consistent UX for all rate-limited endpoints (no per-route handling needed)
- Users get immediate actionable feedback instead of silent failures
- Does not block the 429 response — calling code still receives the original response

**Status**: Implemented.

---

## Document Index

| Document               | Location                                                              | Description                         |
| ---------------------- | --------------------------------------------------------------------- | ----------------------------------- |
| Product Requirements   | [docs/PRD.md](./PRD.md)                                               | Full PRD with implementation status |
| MVP Summary            | [docs/MVP-IMPLEMENTATION-SUMMARY.md](./MVP-IMPLEMENTATION-SUMMARY.md) | Detailed implementation changelog   |
| Architecture Decisions | [docs/ARCHITECTURE-DECISIONS.md](./ARCHITECTURE-DECISIONS.md)         | This document                       |
| Testing Guide          | [docs/TESTING.md](./TESTING.md)                                       | Test setup, running, writing tests  |
| Security               | [SECURITY.md](../SECURITY.md)                                         | Auth security measures              |
| README                 | [README.md](../README.md)                                             | Project setup and getting started   |
| Environment Variables  | [.env.example](../.env.example)                                       | Required environment variables      |

---

_Generated on 2026-02-15, updated 2026-02-24 with ADR-017–020 (Email Verification, Uppy + Supabase Storage, Dark Mode Toggle, Rate Limit Feedback)._
