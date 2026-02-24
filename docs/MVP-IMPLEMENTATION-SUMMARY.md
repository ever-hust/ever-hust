# Hust — MVP Implementation Summary

**Date**: 2026-02-23 (updated)
**Branch**: `claude/agitated-davinci`
**Status**: MVP Complete + Production Hardening (12 implementation batches)

---

## Overview

This document summarizes all MVP implementation work completed across 7 batches of commits. The work addressed gaps identified between the PRD specification and the actual codebase, fixing bugs, wiring missing integrations, and ensuring all MVP features work end-to-end.

---

## Commit History

| Commit    | Description                                                                             |
| --------- | --------------------------------------------------------------------------------------- |
| `bf38ec3` | feat: complete MVP gaps — alerts API, email templates, Zod validation, tests, and fixes |
| `82da2f1` | feat: add CSP headers, BYOK settings, alerts UI, agent status, and structured data      |
| `c29a734` | feat: wire subscription emails, BYOK model routing, chat deep-links, and cleanup export |
| `8f3032f` | fix: resolve BYOK key path, submitAnswers schema, app tracking, and UX gaps             |
| `2e470e0` | fix: complete BYOK with createAnthropic, add favicon and icon metadata                  |
| `772e254` | fix: correct all /dashboard/ URLs to match route group paths, add welcome email         |
| `f1fd961` | fix: use env-based URLs in email send functions instead of hardcoded everjobs.ai        |

---

## Batch 1 — Alerts API, Email Templates, Validation & Tests

### What was done

- **Alerts API** (`apps/web/app/api/user/alerts/route.ts`): Full CRUD — GET (list alerts), POST (create alert), PATCH (toggle active), DELETE
- **Email templates**: Created 3 React Email templates:
  - `packages/email/src/templates/job-alert.tsx` — Job alert notification
  - `packages/email/src/templates/welcome.tsx` — Welcome email on signup
  - `packages/email/src/templates/subscription-confirmed.tsx` — Subscription confirmation
- **Email sending functions** (`packages/email/src/send.ts`): `sendJobAlertEmail()`, `sendWelcomeEmail()`, `sendSubscriptionConfirmedEmail()`
- **Zod validation**: Added input validation to all API routes (chat, jobs search, alerts, favorites, profile, stripe checkout/webhook, CV upload)
- **E2E tests**: Expanded Playwright test coverage for landing page, auth, chat, jobs, profile, and subscription flows
- **Jest unit tests**: Added tests for Stripe plan configuration and webhook handling
- **Trigger.dev tasks**: Completed `send-alerts.ts` (match jobs to alert criteria, send emails), `sync-jobs.ts` (fetch from Ever Jobs API, upsert), `cleanup.ts` (expire old jobs, clean stale sessions)

---

## Batch 2 — CSP Headers, BYOK Settings, Alerts UI, Agent Status, Structured Data

### What was done

- **Security headers** (`apps/web/middleware.ts`): Content Security Policy, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy
- **BYOK settings UI** (`apps/web/app/(dashboard)/settings/page.tsx`): API key input field for Anthropic, stored in user preferences
- **Alerts management UI**: Settings page section to view, toggle, and delete alerts
- **Agent status indicator** (`apps/web/components/chat/agent-status.tsx`): Shows when AI agents are processing
- **Structured data** (`apps/web/components/landing/structured-data.tsx`): JSON-LD for Organization, WebSite with SearchAction, and WebApplication
- **ISR revalidation**: Landing page and pricing page use `revalidate = 3600`
- **maxDuration config**: Chat route set to 60s, Stripe webhook to 30s

---

## Batch 3 — Subscription Emails, BYOK Model Routing, Chat Deep-Links

### What was done

- **Stripe webhook → email**: `sendSubscriptionConfirmedEmail()` called on `checkout.session.completed` webhook event
- **BYOK model routing** (`packages/ai/src/model-router.ts`): Reads user preferences from DB, passes to `getModelForUser()` for correct model selection
- **Chat deep-links**: `ChatPanel` accepts `initialPrompt` prop with auto-send via `useRef` + `useEffect`; chat page reads `?job=` query param to pre-populate prompt
- **Cleanup export**: `packages/triggers/src/index.ts` now exports `cleanupTask` and `cleanupSchedule`
- **DB query for preferences**: Chat API route fetches user record from DB for BYOK/model selection (was passing `null` before)

---

## Batch 4 — BYOK Key Path, Schema Fix, App Tracking, UX

### What was done

- **submitAnswersTool fix** (`packages/ai/src/tools/submit-answers.ts`): Corrected DB column from non-existent `answers`/`resumeUrl`/`notes` to actual `answersProvided` column
- **submitAnswersTool export**: Added missing export from `packages/ai/src/index.ts`
- **BYOK key storage alignment**: Settings page now stores at `preferences.apiKeys.anthropic` matching model-router's expected path (was `preferences.apiKey`)
- **Application tracking**: `applyJobTool` now upserts into `userJobs` table with "applied" status, so profile API returns applied jobs
- **Profile API**: Added `jobUrl` to applications query response
- **Chat input auto-resize**: `useEffect` auto-expands textarea for multiline input (up to 128px height)

---

## Batch 5 — BYOK Actually Working, Favicon

### What was done

- **BYOK functional fix** (`packages/ai/src/model-router.ts`): Was detecting BYOK key but still using default `anthropic()` provider. Fixed by importing and using `createAnthropic({ apiKey })` from `@ai-sdk/anthropic`
- **Favicon**: Created SVG favicon with indigo gradient and "EJ" text at `apps/web/public/favicon.svg`
- **Icon metadata**: Added `icons: { icon: "/favicon.svg" }` to root layout metadata

---

## Batch 6 — CRITICAL: Route Group URL Fix, Welcome Email

### Critical bug discovered

The `(dashboard)` directory is a **Next.js route group** — it does NOT add a URL segment. All actual routes are `/chat`, `/jobs`, `/profile`, `/settings` — NOT `/dashboard/chat`, `/dashboard/jobs`, etc. This was wrong across the entire application.

### Files fixed (8 files)

| File                                                      | Change                                                                                             |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `apps/web/components/layout/sidebar.tsx`                  | `/dashboard/chat` → `/chat`, `/dashboard/jobs` → `/jobs`, etc.                                     |
| `apps/web/app/(auth)/login/page.tsx`                      | `callbackURL: "/chat"` (was `/dashboard/chat`)                                                     |
| `apps/web/app/not-found.tsx`                              | `href="/chat"` (was `/dashboard/chat`)                                                             |
| `apps/web/components/landing/structured-data.tsx`         | Search action URL uses `/chat?q=`                                                                  |
| `packages/email/src/templates/subscription-confirmed.tsx` | Default URL and settings link                                                                      |
| `apps/web/middleware.ts`                                  | Protects `/chat`, `/jobs`, `/profile`, `/settings` directly; added `/dashboard` → `/chat` redirect |
| `tests/e2e/chat.spec.ts`                                  | Fixed selector from `/dashboard/i` to `/chat/i`                                                    |

### Welcome email wired

- Added `sendWelcomeEmail()` to BetterAuth's `databaseHooks.user.create.after` in `packages/auth/src/index.ts`

---

## Batch 7 — Environment-Based Email URLs

### What was done

- **`getAppUrl()` helper** (`packages/email/src/index.ts`): Reads `NEXT_PUBLIC_APP_URL` env var with `https://everjobs.ai` fallback
- **All send functions updated** (`packages/email/src/send.ts`): `sendJobAlertEmail()`, `sendWelcomeEmail()`, `sendSubscriptionConfirmedEmail()` all use `getAppUrl()` for default URLs instead of hardcoded domains
- **Subscription template**: `settingsUrl` derived from `dashboardUrl` prop via `replace(/\/chat$/, "/settings")`

---

## Key Files Modified (Summary)

### Apps

| File                                              | Purpose                                  |
| ------------------------------------------------- | ---------------------------------------- |
| `apps/web/app/api/ai/chat/route.ts`               | AI chat endpoint with BYOK model routing |
| `apps/web/app/api/user/alerts/route.ts`           | Alert CRUD API                           |
| `apps/web/app/api/stripe/webhook/route.ts`        | Stripe webhook with subscription email   |
| `apps/web/app/(dashboard)/settings/page.tsx`      | BYOK settings, alerts management         |
| `apps/web/components/chat/chat-panel.tsx`         | Initial prompt deep-linking              |
| `apps/web/components/chat/chat-input.tsx`         | Auto-resize textarea                     |
| `apps/web/components/chat/agent-status.tsx`       | Agent processing indicator               |
| `apps/web/components/layout/sidebar.tsx`          | Fixed navigation URLs                    |
| `apps/web/components/landing/structured-data.tsx` | JSON-LD structured data                  |
| `apps/web/middleware.ts`                          | CSP headers, auth guard, URL fixes       |
| `apps/web/app/layout.tsx`                         | Favicon metadata                         |
| `apps/web/app/not-found.tsx`                      | Fixed redirect URL                       |
| `apps/web/app/(auth)/login/page.tsx`              | Fixed callback URL                       |
| `apps/web/public/favicon.svg`                     | SVG favicon                              |

### Packages

| File                                                      | Purpose                                           |
| --------------------------------------------------------- | ------------------------------------------------- |
| `packages/ai/src/model-router.ts`                         | BYOK with `createAnthropic()`, tier-based routing |
| `packages/ai/src/tools/submit-answers.ts`                 | Fixed DB column mismatch                          |
| `packages/ai/src/tools/apply-job.ts`                      | Added userJobs tracking                           |
| `packages/ai/src/index.ts`                                | Added submitAnswersTool export                    |
| `packages/auth/src/index.ts`                              | Welcome email on user creation                    |
| `packages/email/src/index.ts`                             | `getAppUrl()` helper, exports                     |
| `packages/email/src/send.ts`                              | All send functions with env-based URLs            |
| `packages/email/src/templates/job-alert.tsx`              | Job alert email template                          |
| `packages/email/src/templates/welcome.tsx`                | Welcome email template                            |
| `packages/email/src/templates/subscription-confirmed.tsx` | Subscription email template                       |
| `packages/stripe/src/webhooks.ts`                         | Webhook event parsing                             |
| `packages/triggers/src/index.ts`                          | Cleanup task export                               |
| `packages/triggers/src/send-alerts.ts`                    | Alert matching and email sending                  |
| `packages/triggers/src/sync-jobs.ts`                      | Job sync from Ever Jobs API                       |
| `packages/triggers/src/cleanup.ts`                        | Data cleanup cron task                            |

### Tests

| File                                             | Purpose                 |
| ------------------------------------------------ | ----------------------- |
| `tests/e2e/chat.spec.ts`                         | Fixed URL selector      |
| `tests/e2e/landing.spec.ts`                      | Landing page E2E tests  |
| `tests/e2e/auth.spec.ts`                         | Auth flow tests         |
| `tests/e2e/subscription.spec.ts`                 | Subscription flow tests |
| `packages/stripe/src/__tests__/plans.test.ts`    | Plan config tests       |
| `packages/stripe/src/__tests__/webhooks.test.ts` | Webhook handler tests   |

---

## Critical Bugs Found & Fixed

### 1. Route Group URL Mismatch (Batch 6)

- **Impact**: ALL navigation, redirects, email links, middleware, and tests were broken
- **Root cause**: `(dashboard)` is a Next.js route group (parentheses = no URL segment), but code used `/dashboard/*` URLs everywhere
- **Fix**: Updated 8 files to use correct paths (`/chat`, `/jobs`, `/profile`, `/settings`)

### 2. BYOK Not Functional (Batch 5)

- **Impact**: Users providing their own API key still used the platform's key
- **Root cause**: `model-router.ts` detected the BYOK key but called `anthropic()` (default provider) instead of `createAnthropic({ apiKey })`
- **Fix**: Import `createAnthropic` from `@ai-sdk/anthropic` and create provider with user's key

### 3. BYOK Key Path Mismatch (Batch 4)

- **Impact**: Settings page stored key at wrong path, model-router couldn't find it
- **Root cause**: Settings stored at `preferences.apiKey`, model-router read from `preferences.apiKeys.anthropic`
- **Fix**: Aligned settings page to store at `preferences.apiKeys.anthropic`

### 4. submitAnswersTool Schema Mismatch (Batch 4)

- **Impact**: Application answer submission would fail with DB errors
- **Root cause**: Tool wrote to non-existent columns (`answers`, `resumeUrl`, `notes`)
- **Fix**: Use actual DB column `answersProvided`, remove non-existent fields

### 5. Hardcoded Email URLs (Batch 7)

- **Impact**: Email links would point to wrong domain in non-production environments
- **Root cause**: Send functions used hardcoded `everjobs.ai` URLs
- **Fix**: Created `getAppUrl()` helper reading `NEXT_PUBLIC_APP_URL` env var

---

## MVP Feature Completeness

| PRD Feature                 | Status      | Notes                                              |
| --------------------------- | ----------- | -------------------------------------------------- |
| Landing page (all sections) | ✅ Complete | Hero, features, pricing, testimonials, CTA, footer |
| LinkedIn OAuth login        | ✅ Complete | BetterAuth + LinkedIn provider                     |
| Split-screen layout         | ✅ Complete | Responsive, mobile toggle                          |
| AI Chat System              | ✅ Complete | useChat, streaming, tool results                   |
| Orchestrator Agent          | ✅ Complete | Routes to specialized agents                       |
| Onboarding Agent            | ✅ Complete | LinkedIn data greeting, preference collection      |
| Job Search Agent            | ✅ Complete | Natural language → structured filters              |
| Cover Letter Agent          | ✅ Complete | Profile + job description generation               |
| Application Agent (HITL)    | ✅ Complete | needsApproval, state persistence                   |
| Interview Prep Agent        | ✅ Complete | Mock questions, STAR coaching                      |
| Jobs Canvas                 | ✅ Complete | Cards, filters, infinite scroll                    |
| Canvas Sync                 | ✅ Complete | Tool results → canvas updates                      |
| Favorites                   | ✅ Complete | Toggle, persist, profile display                   |
| Job Alerts                  | ✅ Complete | CRUD API, Trigger.dev cron, email delivery         |
| Cover Letter Modal          | ✅ Complete | Generate, edit, copy, regenerate                   |
| CV Upload & Parsing         | ✅ Complete | Supabase Storage, AI extraction                    |
| User Profile                | ✅ Complete | All sections, application history                  |
| Settings Page               | ✅ Complete | Preferences, BYOK, alerts management               |
| Stripe Subscriptions        | ✅ Complete | Checkout, portal, webhooks, gating                 |
| Free Tier Limits            | ✅ Complete | Message/search/cover letter limits                 |
| Email Templates             | ✅ Complete | Welcome, job alert, subscription confirmed         |
| Welcome Email               | ✅ Complete | Sent on user creation via BetterAuth hook          |
| Subscription Email          | ✅ Complete | Sent on checkout.session.completed webhook         |
| BYOK (Bring Your Own Key)   | ✅ Complete | Storage, UI, functional model routing              |
| Model Router                | ✅ Complete | BYOK → preference → tier → env default             |
| Zod Validation              | ✅ Complete | All API routes validated                           |
| CSP Headers                 | ✅ Complete | Full security header set                           |
| Structured Data             | ✅ Complete | JSON-LD for SEO                                    |
| Dark/Light Theme            | ✅ Complete | next-themes, cookie storage                        |
| E2E Tests                   | ✅ Complete | Playwright test suite                              |
| Unit Tests                  | ✅ Complete | Jest for Stripe, tools                             |
| Agent Status Indicator      | ✅ Complete | Shows processing state                             |
| Chat Deep-Links             | ✅ Complete | ?job= query param auto-sends                       |
| Favicon                     | ✅ Complete | SVG with gradient                                  |

---

## Batch 8 — Langfuse Prompt Management, OpenRouter, Orchestrator Rewrite

### What was done

- **Langfuse integration** (`packages/ai/src/prompts.ts`): New `getPrompt()` helper fetches prompts from Langfuse with graceful fallback to hardcoded defaults when Langfuse is unavailable
- **OpenRouter model routing** (`packages/ai/src/model-router.ts`): Complete rewrite to route through OpenRouter as primary provider with `ANTHROPIC_TO_OPENROUTER` translation map; BYOK → user preference → tier default → env default priority chain
- **Orchestrator async rewrite** (`packages/ai/src/agents/orchestrator.ts`): Converted prompt loading to async to support Langfuse fetch at runtime
- **OTEL instrumentation** (`apps/web/instrumentation.ts`): Added OpenTelemetry auto-detection for Next.js 16
- **Environment variables**: Added `OPENROUTER_API_KEY`, `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_BASE_URL` to `.env.example`

---

## Batch 9 — Jest Fixes, Comprehensive Test Suite, CI/CD

### What was done

- **Jest OOM fix** (`jest.config.ts`): Added `diagnostics: false` and `tsconfig: { isolatedModules: true }` to ts-jest config, preventing OOM on deeply-nested AI SDK generics
- **Tool schema tests fixed** (`packages/ai/src/tools/__tests__/tool-schemas.test.ts`): Changed `.parameters.` → `.inputSchema.` to match AI SDK v6 runtime shape
- **New test suites**:
  - `packages/ai/src/model-router.test.ts` — 13 tests for model routing logic
  - `packages/ai/src/prompts.test.ts` — 7 tests for Langfuse prompt management
  - `packages/email/src/send.test.ts` — 13 tests for email retry logic and all 3 email types
- **Package.json test script**: Added `--max-old-space-size=4096` and `--experimental-vm-modules` flags
- **GitHub Actions CI/CD** (`.github/workflows/ci.yml`): 3-job pipeline: lint/typecheck, unit tests with coverage, E2E tests on main
- **Result**: 9 test suites, 131 tests, ALL PASSING

---

## Batch 10 — Error Handling, SEO, Env Validation, Polish

### What was done

- **API error handling** (`apps/web/app/api/jobs/search/route.ts`): Added try-catch with proper 500 error response; NaN-safe numeric parameter parsing
- **SEO metadata**: Added page-level metadata to all dashboard pages via layout files (chat, jobs, profile, settings) and the marketing home page
- **Environment validation** (`apps/web/lib/env.ts`): Updated AI section to make both `OPENROUTER_API_KEY` and `ANTHROPIC_API_KEY` optional (at least one required); added Langfuse env vars; cross-field validation warning
- **Client-side error handling**: Replaced silent `catch {}` blocks in jobs page and settings page with user-visible toast notifications
- **Settings page AI models**: Updated from 2 outdated models to 3 current models (Haiku 4.5, Sonnet 4, Opus 4) with correct IDs and tier badges

---

## Batch 11 — Production Hardening (Phase 7)

### What was done

- **Vercel Analytics** (`@vercel/analytics`): Web analytics with page view tracking, integrated in root layout
- **Vercel Speed Insights** (`@vercel/speed-insights`): Real User Monitoring (RUM) for Core Web Vitals (LCP, FID, CLS, TTFB, INP)
- **Bundle Analyzer** (`@next/bundle-analyzer`): Available via `ANALYZE=true pnpm build` for visual bundle inspection
- **BYOK API Key Encryption** (`packages/ai/src/crypto.ts`): AES-256-GCM with PBKDF2 key derivation from `BYOK_ENCRYPTION_KEY` env var; 10 unit tests passing
- **Encryption integration**: Settings API route encrypts keys on save; model-router transparently decrypts on use; backwards-compatible with unencrypted keys
- **Supabase Realtime** (`packages/supabase/src/realtime.ts`): Typed subscription helpers for `jobs` table changes
- **Realtime React hook** (`apps/web/hooks/use-realtime-jobs.ts`): Subscribes to INSERT/UPDATE/DELETE on jobs table with proper cleanup
- **Canvas Realtime integration**: New jobs from background sync appear live on canvas via `addRealtimeJob()` method
- **Dynamic imports**: CVDropzone lazy-loaded on profile page via `next/dynamic`
- **Accessibility improvements**:
  - High contrast mode support (`forced-colors: active`)
  - Mobile touch target sizes (min 44px per WCAG 2.5.8)
  - `prefers-reduced-motion` already in place from prior work
  - Focus-visible rings and skip links verified
- **PRD v1.2**: Updated with Phase 7 (Production Hardening), Phase 8-9 (Growth & Enterprise) roadmap

### New files

| File                                  | Purpose                                             |
| ------------------------------------- | --------------------------------------------------- |
| `packages/ai/src/crypto.ts`           | AES-256-GCM encryption/decryption for BYOK API keys |
| `packages/ai/src/crypto.test.ts`      | 10 unit tests for crypto module                     |
| `packages/supabase/src/realtime.ts`   | Supabase Realtime subscription helpers              |
| `apps/web/hooks/use-realtime-jobs.ts` | React hook for live job updates                     |

### Modified files

| File                                        | Change                                                                 |
| ------------------------------------------- | ---------------------------------------------------------------------- |
| `apps/web/app/layout.tsx`                   | Added Analytics + SpeedInsights components                             |
| `apps/web/next.config.ts`                   | Added @next/bundle-analyzer wrapper                                    |
| `apps/web/package.json`                     | Added @vercel/analytics, @vercel/speed-insights, @next/bundle-analyzer |
| `apps/web/app/globals.css`                  | High contrast mode, mobile touch targets                               |
| `apps/web/app/api/user/settings/route.ts`   | Encrypt API keys on save                                               |
| `apps/web/app/(dashboard)/chat/page.tsx`    | Realtime jobs integration                                              |
| `apps/web/app/(dashboard)/profile/page.tsx` | Dynamic import for CVDropzone                                          |
| `apps/web/hooks/use-canvas-sync.ts`         | Added `addRealtimeJob()` method                                        |
| `packages/ai/src/model-router.ts`           | Decrypt BYOK keys before use                                           |
| `packages/ai/package.json`                  | Added crypto export path                                               |
| `packages/supabase/src/index.ts`            | Export realtime helpers                                                |
| `.env.example`                              | Added BYOK_ENCRYPTION_KEY                                              |
| `docs/PRD.md`                               | Updated to v1.2 with Phase 7-9                                         |

---

## Batch 12 — Infrastructure Integrations, Compare→Chat, Hidden Jobs, Split View

### What was done

- **Novu notifications** (`apps/web/lib/novu.ts`): Client initialization with trigger, subscriber management, and workflow ID constants
- **Sentry error tracking**: 3 config files for client, server, and edge runtimes (`sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`)
- **PostHog analytics** (`apps/web/lib/posthog.ts`, `apps/web/components/providers/posthog-provider.tsx`): Privacy-respecting defaults with automatic pageview tracking in root layout
- **OpenTelemetry** (`apps/web/lib/otel.ts`): Diagnostic logger initialization
- **Scalar API docs**: OpenAPI 3.1 spec at `/api/docs`, interactive Scalar reference at `/docs/api`
- **Zustand state stores** (`apps/web/lib/stores/job-store.ts`): Hidden jobs persistence, map visibility, compare state
- **Hidden jobs feature**: Schema update (added `hidden` status to `userJobs`), API endpoints (`/api/user/hidden-jobs`), React hook (`use-hidden-jobs.ts`), dashboard filtering
- **Address autocomplete**: Google Places-powered autocomplete replaces plain text location input in filter bar
- **Split view mode**: New 3-way List | Split | Map toggle; split shows scrollable job list + sticky map side-by-side
- **Compare → Chat integration**: "Discuss with AI" button in compare dialog generates comparison prompt and sends to chat via ChatContext
- **Cover letter deep link**: Wired `?job=` deep link through `ChatContext.initialPrompt` so prompt reaches ChatPanel and focuses input
- **Geocoding backfill API** (`/api/admin/geocode`): POST endpoint to backfill lat/lng coordinates for existing jobs
- **Removed duplicate Apply Now button** from job detail sidebar

### New files (14+)

| File                                                  | Purpose                      |
| ----------------------------------------------------- | ---------------------------- |
| `apps/web/lib/novu.ts`                                | Novu notification service    |
| `apps/web/lib/otel.ts`                                | OpenTelemetry initialization |
| `apps/web/lib/posthog.ts`                             | PostHog analytics client     |
| `apps/web/lib/stores/job-store.ts`                    | Zustand UI state stores      |
| `apps/web/sentry.client.config.ts`                    | Sentry client config         |
| `apps/web/sentry.server.config.ts`                    | Sentry server config         |
| `apps/web/sentry.edge.config.ts`                      | Sentry edge config           |
| `apps/web/app/api/docs/route.ts`                      | OpenAPI 3.1 spec endpoint    |
| `apps/web/app/(marketing)/docs/api/page.tsx`          | Scalar API reference page    |
| `apps/web/app/api/admin/geocode/route.ts`             | Geocoding backfill API       |
| `apps/web/app/api/user/hidden-jobs/route.ts`          | Hidden jobs API              |
| `apps/web/components/providers/posthog-provider.tsx`  | PostHog provider             |
| `apps/web/components/canvas/address-autocomplete.tsx` | Google Places autocomplete   |
| `apps/web/hooks/use-hidden-jobs.ts`                   | Hidden jobs React hook       |

### Modified files

| File                                                | Change                                   |
| --------------------------------------------------- | ---------------------------------------- |
| `packages/db/src/schema/user-jobs.ts`               | Added `hidden` status enum value         |
| `apps/web/components/chat/chat-context.tsx`         | Added `initialPrompt`/`setInitialPrompt` |
| `apps/web/components/layout/chat-shell.tsx`         | Passes `initialPrompt` to ChatPanel      |
| `apps/web/components/canvas/job-card.tsx`           | Added `onHide` prop with EyeOff button   |
| `apps/web/components/canvas/jobs-canvas.tsx`        | `onHideJob` prop, split view mode        |
| `apps/web/components/canvas/filter-bar.tsx`         | AddressAutocomplete replaces text input  |
| `apps/web/components/canvas/job-compare-dialog.tsx` | "Discuss with AI" button                 |
| `apps/web/app/(dashboard)/dashboard/page.tsx`       | Hidden jobs filter, ChatContext bridge   |
| `apps/web/app/(dashboard)/jobs/[id]/page.tsx`       | Removed duplicate Apply button           |
| `apps/web/app/layout.tsx`                           | PostHogProvider in Suspense              |
| `apps/web/package.json`                             | 12 new deps, 4 new devDeps               |

### New packages added

| Package                   | Category           |
| ------------------------- | ------------------ |
| `@novu/api`               | Notifications      |
| `@sentry/nextjs`          | Error tracking     |
| `posthog-js`              | Analytics          |
| `@opentelemetry/api`      | Observability      |
| `zustand`                 | State management   |
| `tailwind-merge`          | CSS utility        |
| `react-google-recaptcha`  | Security           |
| `tailwindcss-animate`     | Animation (dev)    |
| `@tailwindcss/typography` | Prose styles (dev) |
| `@faker-js/faker`         | Test data (dev)    |

---

## Updated MVP Feature Completeness

| PRD Feature            | Status      | Notes                                      |
| ---------------------- | ----------- | ------------------------------------------ |
| Address Autocomplete   | ✅ Complete | Google Places in filter bar                |
| Hidden Jobs            | ✅ Complete | Hide/unhide with API + Zustand persistence |
| Split View             | ✅ Complete | List + Map side-by-side                    |
| Compare → Chat         | ✅ Complete | "Discuss with AI" sends comparison to chat |
| Cover Letter Deep Link | ✅ Complete | `?job=` wired through ChatContext          |
| Geocoding Backfill     | ✅ Complete | `/api/admin/geocode` POST endpoint         |
| Novu Notifications     | ✅ Complete | Client + trigger helpers                   |
| Sentry Error Tracking  | ✅ Complete | Client + server + edge configs             |
| PostHog Analytics      | ✅ Complete | Provider + pageview tracking               |
| API Documentation      | ✅ Complete | OpenAPI spec + Scalar UI                   |

---

## Known Limitations / Future Work

These items are intentionally out of scope:

1. **Automated job applications**: Currently opens `applyUrl` in new tab. Full auto-apply requires external API integration
2. ~~**Supabase Realtime**~~: ✅ **DONE** — Live job updates via Supabase Realtime subscriptions
3. ~~**Redis rate limiting**~~: ✅ **DONE** — Upstash Redis rate limiting with in-memory fallback
4. ~~**API key encryption**~~: ✅ **DONE** — AES-256-GCM encryption at rest with PBKDF2 key derivation
5. **CV drag-and-drop in canvas**: Upload exists on profile page; dedicated canvas dropzone planned
6. **Supabase Storage buckets**: CV upload endpoint exists but Supabase Storage integration needs env configuration
7. **Database branching**: Supabase database branching for preview deployments not configured
8. ~~**Accessibility audit**~~: ✅ **DONE** — Focus management, high contrast, touch targets, reduced motion, ARIA labels
9. ~~**Bundle optimization**~~: ✅ **DONE** — Bundle analyzer, dynamic imports, code splitting
10. ~~**Vercel Analytics**~~: ✅ **DONE** — Analytics + Speed Insights integrated
11. **LLM Observability**: Langfuse integration complete for prompt management; tracing can be enabled by setting Langfuse env vars
12. **Multi-provider BYOK**: Only Anthropic keys are routed; OpenAI/Google keys stored but not yet used

---

## Environment Variables Required

See `.env.example` for the complete list. Key additions from this implementation:

```env
# App URL (used in all email links)
NEXT_PUBLIC_APP_URL=https://everjobs.ai

# AI — at least one required
OPENROUTER_API_KEY=sk-or-v1-...
ANTHROPIC_API_KEY=sk-ant-...    # optional if OpenRouter set

# BYOK Encryption (required for API key encryption at rest)
BYOK_ENCRYPTION_KEY=your-random-hex-string  # Generate: openssl rand -hex 32

# Langfuse (optional — falls back to hardcoded prompts)
LANGFUSE_PUBLIC_KEY=pk-lf-...
LANGFUSE_SECRET_KEY=sk-lf-...
LANGFUSE_BASE_URL=https://cloud.langfuse.com

# Email
RESEND_API_KEY=
EMAIL_FROM=alerts@everjobs.ai
```

Runtime validation is in `apps/web/lib/env.ts` — missing required vars throw at startup, optional vars warn.

---

_Generated on 2026-02-15, updated 2026-02-23 with Batch 12 (Infrastructure Integrations + Compare→Chat + Hidden Jobs)._
