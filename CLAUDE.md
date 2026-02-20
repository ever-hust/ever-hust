# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Ever Jobs Platform is an AI-powered job search platform where the primary UX is a conversational AI assistant. Users interact through a split-screen interface: AI chat on the left, dynamic jobs canvas on the right. Authentication is via LinkedIn OAuth.

**Domain**: everjobs.ai | **License**: Proprietary (Ever Co. LTD)

## Commands

```bash
pnpm install              # Install all dependencies
pnpm dev                  # Start dev server (port 3000, Turbopack)
pnpm build                # Build all packages and apps (via Turborepo)
pnpm lint                 # Lint all packages (eslint --max-warnings 0)
pnpm check-types          # Type-check all packages
pnpm format               # Format with Prettier

# Testing
pnpm test                 # Run all Jest unit tests across packages
pnpm test -- --selectProjects ai          # Run tests for a single package
pnpm test -- --testPathPattern rate-limit  # Run a specific test file
pnpm test:e2e             # Run Playwright E2E tests (starts dev server automatically)

# Database (Drizzle ORM + Supabase PostgreSQL)
pnpm db:push              # Push schema changes to database
pnpm db:migrate           # Run database migrations
pnpm db:generate          # Generate migration files from schema changes
pnpm db:seed              # Seed database with test data
pnpm db:studio            # Open Drizzle Studio GUI

# Bundle analysis
ANALYZE=true pnpm build   # Generate bundle analysis report
```

## Tech Stack

- **Next.js 16.1** (App Router, React 19, Server Components, Turbopack)
- **Tailwind CSS 4.1** + **ShadCN UI** (components in `packages/ui/`)
- **Turborepo** monorepo with **pnpm 9** workspaces
- **BetterAuth v1** (LinkedIn OAuth, session cookies)
- **PostgreSQL** via Supabase, **Drizzle ORM** for schemas/queries
- **Vercel AI SDK v6** with Claude models (Anthropic direct or OpenRouter)
- **Langfuse** for AI observability (OTEL-based tracing, prompt management)
- **Stripe** for subscriptions, **Resend** + React Email for transactional email
- **Trigger.dev v3** for scheduled background tasks
- **Upstash Redis** for rate limiting
- **Playwright** (E2E) + **Jest** with ts-jest (unit tests)

## Architecture

### Monorepo Structure

Turborepo with `apps/*` and `packages/*` workspaces. All packages use `@repo/` namespace and are referenced via `workspace:*` protocol.

- **`apps/web/`** — Next.js application (the only app)
- **`packages/ai/`** — AI orchestrator agent, tools, model router, prompts, rate limits
- **`packages/db/`** — Drizzle ORM schemas, database client (lazy singleton via Proxy), and shared DB helpers (e.g. `escapeIlike`)
- **`packages/auth/`** — BetterAuth configuration with LinkedIn OAuth + welcome email hook
- **`packages/ui/`** — ShadCN components exported as `@repo/ui/<component-name>`
- **`packages/stripe/`** — Stripe checkout, portal, webhook parsing, plan definitions
- **`packages/jobs-api/`** — Ever Jobs external API client with circuit breaker + retry
- **`packages/email/`** — React Email templates + Resend sender
- **`packages/triggers/`** — Trigger.dev scheduled tasks (job sync, alerts, cleanup)
- **`packages/supabase/`** — Supabase client for Realtime + Storage
- **`packages/cv-parser/`** — CV/resume parsing logic
- **`packages/eslint-config/`** — Shared ESLint configs (base, next, react-internal)
- **`packages/typescript-config/`** — Shared tsconfig presets

### AI Chat Flow

1. **Client**: `apps/web/app/(dashboard)/chat/page.tsx` renders `SplitScreen` with `ChatPanel` (left) + `JobsCanvas` (right)
2. **API Route**: `apps/web/app/api/ai/chat/route.ts` — authenticates user, applies rate limits, resolves AI model via `getModelForUser()`, streams response
3. **Model Router** (`packages/ai/src/model-router.ts`): Routes to correct model based on subscription tier and user preferences. BYOK users get direct Anthropic; platform users go through OpenRouter (if configured) or direct Anthropic. Free tier gets Haiku, paid tier gets Sonnet/Opus.
4. **Orchestrator** (`packages/ai/src/agents/orchestrator.ts`): Uses `streamText()` with 11 tools (searchJobs, favoriteJob, generateCoverLetter, interviewPrep, etc.). Max 5 agentic steps per turn.
5. **Canvas Sync**: Tool results flow back to the client via `useCanvasSync` hook, which updates the jobs canvas in real-time. Supabase Realtime pushes new jobs from background sync tasks.

### System Prompt Management

Prompts are managed through Langfuse with local fallbacks. The orchestrator system prompt can be edited in Langfuse Cloud (prompt name: `orchestrator-system`, label: `production`) or locally in `packages/ai/src/prompts.ts`.

### Routing & Auth

- **Route Groups**: `(marketing)` for public pages, `(auth)` for login/signup, `(dashboard)` for authenticated pages
- **Proxy** (`apps/web/proxy.ts`): Checks BetterAuth session cookie for protected routes (`/chat`, `/jobs`, `/profile`, `/settings`, `/applications`, `/favorites`), applies security headers (CSP, HSTS, etc.) to all responses. Migrated from `middleware.ts` per Next.js 16.1 convention.
- **Auth catch-all**: `apps/web/app/api/auth/[...all]/route.ts` proxies to BetterAuth
- **Production build**: 72 routes total (62 static/dynamic pages + API routes)
- **Job not-found page**: `apps/web/app/(dashboard)/jobs/[id]/not-found.tsx` — custom 404 page for invalid job IDs
- **Organization not-found page**: `apps/web/app/(dashboard)/organizations/[orgId]/not-found.tsx` — custom 404 for invalid org IDs
- **Invitation not-found page**: `apps/web/app/(dashboard)/organizations/invitations/[token]/not-found.tsx` — custom 404 for invalid/expired invitations
- **Admin loading skeleton**: `apps/web/app/(admin)/admin/loading.tsx` — skeleton UI shown while admin pages load

### Subscription & Rate Limiting

- Free tier: Haiku model, 5 searches/day, 1 cover letter/week, daily message limit
- Pro tier (Stripe): Configurable model, unlimited searches/cover letters/messages, job alerts, interview prep, application agent
- Rate limiting uses Upstash Redis (`@upstash/ratelimit`) at both API route level and AI tool level

### Database Schema

Tables defined in `packages/db/src/schema/`: `users`, `sessions`, `accounts`, `verifications` (BetterAuth), `jobs`, `userJobs` (favorites), `userAlerts`, `chatSessions`, `chatMessages`, `agentInstances`, `subscriptions`, `applications`, `pushSubscriptions`, `referrals`, `referralCredits`, `apiKeys`, `organizations`, `organizationMembers`, `organizationInvitations`, `brandingConfigs`, `organizationAiConfigs`, `stripeWebhookEvents`.

The DB client (`packages/db/src/client.ts`) is a lazy singleton using a Proxy pattern — it only connects when first accessed.

### API Route Patterns

API routes in `apps/web/app/api/` follow a consistent pattern:

- Authenticate with `requireSessionUser()` (throws NextResponse on failure)
- Apply rate limiting with `applyRateLimit(key, tier)` from `apps/web/lib/rate-limit.ts`. Available tiers: `authenticated` (100 req/min), `public` (20 req/min), `publicHighThroughput` (100 req/min), `chat` (30 req/min), `admin` (60 req/min), `adminWrite` (30 req/min), `export` (5 req/min). Uses in-memory sliding window; swap to Redis/Upstash for distributed deployments.
- Validate request body with Zod schemas from `apps/web/lib/api-schemas.ts`
- Return errors via `apiBadRequest()` / `apiError()` helpers from `apps/web/lib/api-response.ts` (including the Stripe webhook route, which uses these standardized helpers for consistent error responses)
- All API responses include default `Cache-Control: private, no-cache, no-store, must-revalidate` headers to prevent sensitive data caching
- Streaming AI routes set `export const maxDuration = 60` for Vercel

### Component Organization

- **`apps/web/components/canvas/`** — Jobs canvas, job cards (keyboard navigable in compare mode), filter bar, CV dropzone
- **`apps/web/components/chat/`** — Chat panel, messages, input, tool approval, agent status
- **`apps/web/components/landing/`** — Marketing page sections (hero, features, pricing, etc.)
- **`apps/web/components/layout/`** — Sidebar, split-screen layout
- **`apps/web/components/settings/`** — Settings page cards (AI model, API keys, subscription, etc.)
- **`apps/web/components/shared/`** — Reusable components (dialogs, error states, keyboard shortcuts)
- **`apps/web/components/onboarding/`** — New user onboarding flow
- **`apps/web/lib/constants.ts`** — Shared application constants (AI limits, free-tier caps, canvas settings)
- **`packages/ui/src/alert-dialog.tsx`** — ShadCN AlertDialog component (imported as `@repo/ui/alert-dialog`)

### Structured Data (JSON-LD)

All marketing pages include JSON-LD structured data: `Organization` (landing), `WebSite` (landing), `SoftwareApplication` (landing), `FAQPage` (pricing), `PricingTable`/`Offers` (pricing), and `Organization` (about). The structured data component escapes `</script>` to prevent XSS injection.

### Security Hardening

- **XSS sanitization**: Custom skill input on the profile/onboarding flow is sanitized to prevent stored XSS attacks
- **CV upload validation**: Rejects zero-byte files in addition to enforcing the 10MB max size and PDF/DOCX type checks
- **Service worker**: Includes `push` and `notificationclick` event handlers for Web Push notifications, in addition to offline caching

### Custom Hooks

Located in `apps/web/hooks/`. Key hooks:

- `useCanvasSync` — Manages jobs canvas state, syncs AI tool results to canvas
- `useRealtimeJobs` — Supabase Realtime subscription for live job updates with auto-reconnection (3 attempts with exponential backoff)
- `useFavorites` — Favorite job management
- `useChatPersistence` — Chat session persistence
- `useKeyboardShortcuts` — Global keyboard shortcut management
- `useReferralRedeem` — Auto-redeems referral codes stored in localStorage after authentication

### Testing

- **Jest**: 949 unit tests across 34 suites, living alongside source files as `*.test.ts`. Projects configured for: `ai`, `stripe`, `cv-parser`, `jobs-api`, `db`, `utils`, `email`, `triggers`, `web-lib`. Uses `ts-jest` with `isolatedModules: true` to avoid OOM from complex AI SDK/Zod generics. Key test files include `model-router.test.ts`, `prompts.test.ts`, `rate-limit.test.ts`, `tool-schemas.test.ts`, `crypto.test.ts`, `api-client.test.ts`, `api-response.test.ts`, `api-schemas.test.ts`, `subscription-gate.test.ts`, `referral-utils.test.ts`, `format-date.test.ts`, `org-config.test.ts`, `webhook-idempotency.test.ts`, `orchestrator.test.ts`, `constants.test.ts`, `env.test.ts`, `startup-checks.test.ts`, `safe-url.test.ts`, `salary-insights.test.ts`, `resume-builder.test.ts`, `webhook.test.ts`, `checkout.test.ts`, `portal.test.ts`, `plans.test.ts`, `client.test.ts`, `types.test.ts`, `guidance-topics.test.ts`, `db-helpers.test.ts`, `map-job.test.ts`, `helpers.test.ts`.
- **Playwright**: 175 E2E tests across 8 spec files in `tests/e2e/`. Specs for: auth, landing, chat, jobs, profile, subscription. Runs against `http://localhost:3000`.

### UI Package Pattern

ShadCN components in `packages/ui/src/` are imported as `@repo/ui/<component-name>` (e.g., `import { Button } from "@repo/ui/button"`). The package uses direct file exports, not a barrel.

### Telemetry

Langfuse tracing is set up via `apps/web/instrumentation.ts` (Next.js instrumentation hook). OTEL spans from the Vercel AI SDK are automatically sent to Langfuse when `LANGFUSE_PUBLIC_KEY` and `LANGFUSE_SECRET_KEY` are configured.

### Environment & Startup

- **`.env.example`** — Reference file listing all environment variables with descriptions. Copy to `.env.local` to get started.
- **Startup checks** (`apps/web/lib/startup-checks.ts`): Runs automatically via `instrumentation.ts` on server boot. Validates critical env vars (`DATABASE_URL`, `BETTER_AUTH_SECRET`) — missing ones throw and prevent startup. Logs warnings for recommended vars (Stripe, LinkedIn OAuth, Resend, Supabase, `NEXT_PUBLIC_APP_URL`) and info for optional vars (OpenRouter, Langfuse, Upstash, Trigger.dev). Also validates that at least one AI provider key is configured.
