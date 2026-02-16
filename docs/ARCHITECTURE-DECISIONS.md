# Ever Jobs — Architecture Decision Records (ADR)

**Date**: 2026-02-15

This document captures key architectural decisions made during the MVP implementation of Ever Jobs.

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
- Test count: 9 suites, 131 tests

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

## Document Index

| Document | Location | Description |
|----------|----------|-------------|
| Product Requirements | [docs/PRD.md](./PRD.md) | Full PRD with implementation status |
| MVP Summary | [docs/MVP-IMPLEMENTATION-SUMMARY.md](./MVP-IMPLEMENTATION-SUMMARY.md) | Detailed implementation changelog |
| Architecture Decisions | [docs/ARCHITECTURE-DECISIONS.md](./ARCHITECTURE-DECISIONS.md) | This document |
| Testing Guide | [docs/TESTING.md](./TESTING.md) | Test setup, running, writing tests |
| README | [README.md](../README.md) | Project setup and getting started |
| Environment Variables | [.env.example](../.env.example) | Required environment variables |

---

*Generated on 2026-02-15, updated 2026-02-16 with ADR-011 through ADR-015.*
