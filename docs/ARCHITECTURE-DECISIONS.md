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

## Document Index

| Document | Location | Description |
|----------|----------|-------------|
| Product Requirements | [docs/PRD.md](./PRD.md) | Full PRD with implementation status |
| MVP Summary | [docs/MVP-IMPLEMENTATION-SUMMARY.md](./MVP-IMPLEMENTATION-SUMMARY.md) | Detailed implementation changelog |
| Architecture Decisions | [docs/ARCHITECTURE-DECISIONS.md](./ARCHITECTURE-DECISIONS.md) | This document |
| README | [README.md](../README.md) | Project setup and getting started |
| Environment Variables | [.env.example](../.env.example) | Required environment variables |

---

*Generated on 2026-02-15 as part of the MVP documentation.*
