# Ever Jobs - Product Requirements Document (PRD)

**Version**: 1.9
**Date**: 2026-02-19
**Status**: MVP Implemented + Production Hardening + Growth Features + Enterprise Features + Audit Fixes + Post-MVP Polish (Phase 9 Complete + Post-Audit + Batches 2-7)
**Previous Versions**: 1.8 (2026-02-19), 1.7 (2026-02-19), 1.6 (2026-02-18), 1.5 (2026-02-18), 1.4 (2026-02-18), 1.3 (2026-02-18), 1.2 (2026-02-18), 1.1 (2026-02-15), 1.0 (2026-02-14, Approved)
**Domain**: everjobs.ai
**License**: Proprietary (All Rights Reserved)
**Repository**: github.com/ever-co/ever-jobs-website

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Product Vision and Objectives](#2-product-vision-and-objectives)
3. [Target Users](#3-target-users)
4. [Technology Stack](#4-technology-stack)
5. [System Architecture](#5-system-architecture)
6. [Monorepo Structure](#6-monorepo-structure)
7. [Database Schema](#7-database-schema)
8. [AI Model Configuration](#8-ai-model-configuration)
9. [AI Agent Architecture](#9-ai-agent-architecture)
10. [Feature Specifications](#10-feature-specifications)
    - 10.1 Landing Page
    - 10.2 Authentication
    - 10.3 Main App Layout
    - 10.4 AI Chat System
    - 10.5 Jobs Canvas
    - 10.6 Job Alerts
    - 10.7 AI Cover Letters
    - 10.8 CV Upload & Parsing
    - 10.9 User Profile
    - 10.10 Subscriptions & Billing
    - 10.11 Application Agent
11. [Ever Jobs API Integration](#11-ever-jobs-api-integration)
12. [Routing & Navigation](#12-routing--navigation)
13. [Security Architecture](#13-security-architecture)
14. [Deployment & Infrastructure](#14-deployment--infrastructure)
15. [Testing Strategy](#15-testing-strategy)
16. [Implementation Phases](#16-implementation-phases)
17. [Data Flow Diagrams](#17-data-flow-diagrams)
18. [API Contracts](#18-api-contracts)
19. [Non-Functional Requirements](#19-non-functional-requirements)
20. [Success Metrics](#20-success-metrics)
- [Appendix A: Implementation Status](#appendix-a-implementation-status-v19)
- [Appendix B: License](#appendix-b-license)

---

## 1. Executive Summary

Ever Jobs is an AI-first job search platform where the primary user experience is conversational. After authenticating via LinkedIn OAuth, users interact with an AI assistant through a split-screen interface: an AI chat panel on the left and a dynamic data canvas on the right. The AI guides users through job discovery, application preparation, and career management.

The platform consumes job data from an external Ever Jobs API (github.com/ever-co/ever-jobs, deployed separately in Kubernetes), which aggregates listings from 25 sources including LinkedIn, Indeed, Glassdoor, ZipRecruiter, and multiple ATS platforms. Jobs are stored locally in a shared PostgreSQL database (Supabase) and presented through an intelligent, agent-driven interface.

The system is built as a Turborepo monorepo deployed on Vercel, with a Supabase PostgreSQL database managed via Drizzle ORM. Monetization is handled through Stripe subscriptions at three pricing tiers. Background jobs (alerts, job syncing) are managed by Trigger.dev v3. The AI layer uses Vercel AI SDK v6 with a unified orchestrator agent that handles all tasks (job search, application, cover letter, interview prep) via 11 registered tools and behavioral guidance in the system prompt, with OpenRouter for multi-model routing, Langfuse for observability, and human-in-the-loop approval flows.

---

## 2. Product Vision and Objectives

### Vision

Eliminate the friction of job searching by making an AI assistant the primary interface between candidates and opportunities. Users should never need to scroll through job boards again.

### Primary Objectives

- Reduce time-to-application by 80% through AI-guided workflows
- Provide a single pane of glass for job discovery across 25+ sources/boards/ATSs
- Enable AI-generated cover letters personalized to each job posting
- Deliver proactive job alerts matching user preferences
- Build an extensible agent platform that can automate end-to-end application workflows
- Allow users to apply to jobs entirely within the chat interface (future phases)

### What Makes Ever Jobs Different

1. **AI Chat as Primary UX**: Not a search box with filters, but a conversation that understands career goals
2. **Agent-First Architecture**: Built from day 1 as a unified orchestrator agent platform with tool-based capabilities, not a traditional web app with AI bolted on
3. **25 Source Aggregation**: Powered by the Ever Jobs API, covering major boards, ATS platforms, and direct company scrapers
4. **End-to-End Application**: Moving toward fully automated job applications via AI agents (Phase 5+)
5. **Real-Time Canvas**: Job results update live as the AI conversation refines preferences

---

## 3. Target Users

### Primary: Active Job Seekers
- Currently unemployed or actively looking for new roles
- Applying to multiple positions weekly
- Frustrated with the manual process of searching across multiple boards
- Value speed (being first to apply) and personalization

### Secondary: Passive Job Seekers
- Employed but open to opportunities
- Want alerts for specific criteria without actively searching
- Will only apply if something compelling appears
- Value low-effort, high-signal notifications

### Tertiary: Career Changers
- Exploring new industries or role types
- Need guidance on skills matching and positioning
- Benefit most from AI-guided conversation about career direction
- May need help reframing their experience for new fields

---

## 4. Technology Stack

| Layer | Technology | Version | Rationale |
|-------|-----------|---------|-----------|
| Framework | Next.js | 16.1 | App Router, Server Components, Turbopack (stable default bundler), React 19 |
| Styling | Tailwind CSS | 4.1 | CSS-first config via `@theme`, 5x faster builds, zero-config content detection |
| Components | ShadCN UI | latest | Monorepo-compatible (`packages/ui`), copy-paste, accessible, Tailwind v4 native |
| Build System | Turborepo + pnpm | latest | Parallel builds, remote caching on Vercel, workspace protocol |
| Auth | BetterAuth | v1 | LinkedIn OAuth, TypeScript-first, database adapter, session management |
| ORM | Drizzle ORM | 0.45.1 | Type-safe, PostgreSQL identity columns, lightweight, push/migrate workflows |
| Database | PostgreSQL (Supabase) | 16+ | Vercel integration, Realtime subscriptions, Storage, Row Level Security |
| Realtime | Supabase Realtime | latest | Live job updates, chat message sync, agent status broadcasting |
| File Storage | Supabase Storage | latest | CV uploads, company logos, user assets with CDN |
| AI SDK | Vercel AI SDK | v6 | ToolLoopAgent, Agent interface, needsApproval HITL, useChat hook, streaming |
| AI Model (default) | Claude Opus 4.6 | latest | Configurable via env var; per-user by tier; BYOK support |
| AI Routing | Vercel AI Gateway | latest | Multi-provider routing, fallback, per-user model configuration |
| Background Jobs | Trigger.dev | v3 | Declarative cron, imperative schedules, Next.js integration |
| Payments | Stripe | latest | Checkout, Customer Portal, webhook-driven subscription lifecycle |
| Email | React Email + Resend | latest | Type-safe templates, reliable delivery, analytics |
| E2E Tests | Playwright | latest | Cross-browser, reliable selectors, fixtures, Turborepo integration |
| Unit Tests | Jest | latest | Component/utility testing, mocking, snapshot tests |
| Deployment | Vercel | - | Edge functions, ISR, image optimization, Turbopack, analytics |

---

## 5. System Architecture

```
+--------------------+       +------------------+       +-------------------+
|                    |       |                  |       |                   |
|   Browser Client   |<----->|   Vercel Edge    |<----->|   Supabase        |
|   (Next.js 16.1)   |       |   + Serverless   |       |   PostgreSQL      |
|                    |       |                  |       |   Realtime        |
+--------------------+       +--------+---------+       |   Storage         |
        |                             |                 +-------------------+
        |  Supabase Realtime          |
        |  (WebSocket)                |
        |<--------------------------->|
                          +-----------+-----------+
                          |           |           |
                    +-----v----+ +---v------+ +--v---------+
                    |          | |          | |            |
                    | Ever Jobs| |  Stripe  | | Trigger.dev|
                    | API (k8s)| |  API     | | (Cron/Jobs)|
                    |          | |          | |            |
                    +----------+ +----------+ +------------+
                                                    |
                                              +-----v-----+
                                              |           |
                                              | Resend    |
                                              | (Email)   |
                                              |           |
                                              +-----------+
```

### Data Flow Summary

1. **Job Ingestion**: Trigger.dev scheduled task calls Ever Jobs API every 15 minutes, fetches new jobs, deduplicates, and upserts into the shared `jobs` table. Supabase Realtime broadcasts changes to connected clients.
2. **User Session**: User authenticates via LinkedIn OAuth (BetterAuth). LinkedIn profile data is extracted and stored in `users` table.
3. **Chat Interaction**: User messages flow from `useChat` hook to `/api/ai/chat` route. The unified orchestrator agent selects appropriate tools based on user intent. Tools (search jobs, update filters, generate cover letters, etc.) are called directly by the orchestrator. Tool results update the canvas in real time via streaming.
4. **Canvas Updates**: Job search results stream back through tool invocation results. The frontend reacts to tool invocation parts in the message stream and updates the jobs canvas accordingly.
5. **Subscriptions**: Stripe Checkout creates subscriptions. Webhooks update `subscriptions` table. Middleware checks subscription status for gated features.
6. **Alerts**: Trigger.dev cron tasks query user alert criteria, match against new jobs, and send email notifications via Resend.

---

## 6. Monorepo Structure

```
ever-jobs-website/
├── apps/
│   └── web/                              # Next.js 16.1 application
│       ├── app/
│       │   ├── (marketing)/              # Public marketing pages
│       │   │   ├── page.tsx              # Landing page (/)
│       │   │   ├── pricing/
│       │   │   │   └── page.tsx          # Pricing page (/pricing)
│       │   │   └── layout.tsx            # Marketing layout
│       │   ├── (auth)/                   # Authentication pages
│       │   │   ├── login/
│       │   │   │   └── page.tsx          # Login page (/login)
│       │   │   └── layout.tsx            # Auth layout
│       │   ├── (dashboard)/              # Protected application
│       │   │   ├── layout.tsx            # Split-screen layout with auth guard
│       │   │   ├── page.tsx              # Dashboard redirect
│       │   │   ├── chat/
│       │   │   │   └── page.tsx          # Main chat + canvas view
│       │   │   ├── jobs/
│       │   │   │   ├── page.tsx          # Jobs listing (canvas only)
│       │   │   │   └── [id]/
│       │   │   │       └── page.tsx      # Job detail page
│       │   │   ├── profile/
│       │   │   │   └── page.tsx          # User profile
│       │   │   └── settings/
│       │   │       └── page.tsx          # Settings + subscription
│       │   ├── api/
│       │   │   ├── auth/
│       │   │   │   └── [...all]/
│       │   │   │       └── route.ts      # BetterAuth catch-all handler
│       │   │   ├── ai/
│       │   │   │   └── chat/
│       │   │   │       └── route.ts      # AI chat streaming endpoint
│       │   │   ├── jobs/
│       │   │   │   ├── route.ts          # Jobs CRUD
│       │   │   │   └── search/
│       │   │   │       └── route.ts      # Job search endpoint
│       │   │   ├── stripe/
│       │   │   │   ├── checkout/
│       │   │   │   │   └── route.ts      # Create checkout session
│       │   │   │   ├── portal/
│       │   │   │   │   └── route.ts      # Customer portal session
│       │   │   │   └── webhook/
│       │   │   │       └── route.ts      # Stripe webhook handler
│       │   │   ├── user/
│       │   │   │   ├── profile/
│       │   │   │   │   └── route.ts      # Profile CRUD
│       │   │   │   ├── favorites/
│       │   │   │   │   └── route.ts      # Favorite jobs
│       │   │   │   └── alerts/
│       │   │   │       └── route.ts      # Alert CRUD
│       │   │   └── cv/
│       │   │       └── upload/
│       │   │           └── route.ts      # CV upload + parsing
│       │   ├── globals.css               # Tailwind 4.1 @theme + imports
│       │   ├── layout.tsx                # Root layout (ThemeProvider, fonts)
│       │   └── page.tsx                  # Root redirect
│       ├── components/                   # App-specific components
│       │   ├── chat/
│       │   │   ├── chat-panel.tsx        # Main chat container
│       │   │   ├── message-list.tsx      # Message rendering
│       │   │   ├── message-bubble.tsx    # Individual message
│       │   │   ├── tool-approval.tsx     # Human-in-the-loop approval UI
│       │   │   ├── chat-input.tsx        # Message input with file upload
│       │   │   └── agent-status.tsx      # Agent activity indicator
│       │   ├── canvas/
│       │   │   ├── jobs-canvas.tsx       # Jobs grid/list container
│       │   │   ├── job-card.tsx          # Individual job card
│       │   │   ├── job-filters.tsx       # Filter bar
│       │   │   ├── canvas-header.tsx     # Canvas title + view toggles
│       │   │   └── cv-dropzone.tsx       # CV upload dropzone
│       │   ├── landing/
│       │   │   ├── hero.tsx
│       │   │   ├── features-grid.tsx
│       │   │   ├── integrations.tsx
│       │   │   ├── how-it-works.tsx
│       │   │   ├── pricing-cards.tsx
│       │   │   ├── testimonials.tsx
│       │   │   ├── cta-section.tsx
│       │   │   └── footer.tsx
│       │   ├── layout/
│       │   │   ├── split-screen.tsx      # Left/right panel layout
│       │   │   ├── sidebar-nav.tsx       # Navigation sidebar
│       │   │   ├── mobile-toggle.tsx     # Chat/canvas toggle on mobile
│       │   │   └── theme-toggle.tsx      # Dark/light switch
│       │   └── shared/
│       │       ├── cover-letter-modal.tsx
│       │       ├── job-detail-panel.tsx
│       │       └── subscription-gate.tsx # Feature gating component
│       ├── hooks/
│       │   ├── use-jobs.ts              # Jobs data hook
│       │   ├── use-favorites.ts         # Favorites management
│       │   ├── use-canvas-sync.ts       # Sync chat tool results to canvas
│       │   └── use-subscription.ts      # Subscription status
│       ├── lib/
│       │   ├── auth-client.ts           # BetterAuth client instance
│       │   └── utils.ts                 # App utilities
│       ├── middleware.ts                 # Auth guard + rate limiting
│       ├── public/
│       │   ├── logo.svg
│       │   ├── og-image.png
│       │   └── icons/
│       ├── next.config.ts
│       ├── tsconfig.json
│       └── package.json
├── packages/
│   ├── ui/                              # ShadCN UI shared components
│   │   ├── src/
│   │   │   ├── components/              # Button, Card, Dialog, Input, etc.
│   │   │   ├── hooks/                   # use-mobile, use-media-query
│   │   │   ├── lib/
│   │   │   │   └── utils.ts             # cn() utility
│   │   │   └── styles/
│   │   │       └── globals.css           # Shared Tailwind theme tokens
│   │   ├── components.json
│   │   ├── tsconfig.json
│   │   └── package.json
│   ├── db/                              # Drizzle ORM schemas + migrations
│   │   ├── src/
│   │   │   ├── schema/
│   │   │   │   ├── users.ts
│   │   │   │   ├── jobs.ts
│   │   │   │   ├── user-jobs.ts
│   │   │   │   ├── user-alerts.ts
│   │   │   │   ├── chat.ts              # Combined sessions + messages
│   │   │   │   ├── agents.ts
│   │   │   │   ├── subscriptions.ts
│   │   │   │   ├── applications.ts
│   │   │   │   └── index.ts
│   │   │   ├── migrations/
│   │   │   ├── seed.ts
│   │   │   ├── client.ts               # Database connection + drizzle instance
│   │   │   └── index.ts
│   │   ├── drizzle.config.ts
│   │   ├── tsconfig.json
│   │   └── package.json
│   ├── auth/                            # BetterAuth configuration
│   │   ├── src/
│   │   │   ├── index.ts               # BetterAuth server config (includes LinkedIn profile logic)
│   │   │   └── client.ts              # BetterAuth client helpers
│   │   ├── tsconfig.json
│   │   └── package.json
│   ├── ai/                              # AI agents, tools, prompts, model router
│   │   ├── src/
│   │   │   ├── agents/
│   │   │   │   └── orchestrator.ts     # Unified agent handling all tasks via tools + system prompt
│   │   │   ├── tools/
│   │   │   │   ├── search-jobs.ts
│   │   │   │   ├── update-filters.ts
│   │   │   │   ├── favorite-job.ts
│   │   │   │   ├── get-job-details.ts
│   │   │   │   ├── get-user-profile.ts
│   │   │   │   ├── save-preferences.ts
│   │   │   │   ├── generate-cover-letter.ts
│   │   │   │   ├── create-alert.ts
│   │   │   │   ├── apply-job.ts
│   │   │   │   ├── submit-answers.ts
│   │   │   │   ├── interview-prep.ts
│   │   │   │   └── index.ts
│   │   │   ├── prompts/
│   │   │   │   ├── orchestrator-system.ts # Unified system prompt (onboarding, search, cover letters, etc.)
│   │   │   │   ├── guidance-topics.ts    # Topics the AI should explore
│   │   │   │   └── index.ts
│   │   │   ├── model-router.ts         # Multi-model routing (tier + BYOK)
│   │   │   ├── crypto.ts              # BYOK AES-256-GCM encryption
│   │   │   ├── rate-limit.ts          # AI request rate limiting
│   │   │   └── index.ts
│   │   ├── tsconfig.json
│   │   └── package.json
│   ├── jobs-api/                        # Ever Jobs API client library
│   │   ├── src/
│   │   │   ├── index.ts               # HTTP client + mappers (consolidated)
│   │   │   ├── types.ts               # API request/response types (ScraperInputDto, JobPostDto)
│   │   │   └── types.test.ts          # Type validation tests
│   │   ├── tsconfig.json
│   │   └── package.json
│   ├── stripe/                          # Stripe billing integration
│   │   ├── src/
│   │   │   ├── plans.ts               # Plan definitions + price IDs
│   │   │   ├── plans.test.ts          # Plan configuration tests
│   │   │   ├── checkout.ts
│   │   │   ├── portal.ts
│   │   │   ├── webhook.ts            # Stripe webhook handler (singular)
│   │   │   └── index.ts
│   │   ├── tsconfig.json
│   │   └── package.json
│   ├── email/                           # Email templates + sending
│   │   ├── src/
│   │   │   ├── templates/
│   │   │   │   ├── job-alert.tsx       # React Email template
│   │   │   │   ├── welcome.tsx
│   │   │   │   └── subscription-confirmed.tsx
│   │   │   ├── send.ts               # Email sending via Resend
│   │   │   └── index.ts
│   │   ├── tsconfig.json
│   │   └── package.json
│   ├── triggers/                        # Trigger.dev task definitions
│   │   ├── src/
│   │   │   ├── sync-jobs.ts           # Cron: fetch new jobs from Ever Jobs API
│   │   │   ├── send-job-alerts.ts     # Cron: match jobs to alerts, send emails
│   │   │   └── trigger.config.ts
│   │   ├── tsconfig.json
│   │   └── package.json
│   ├── supabase/                        # Supabase client (Realtime)
│   │   ├── src/
│   │   │   ├── client.ts             # Supabase browser client instance
│   │   │   ├── server.ts             # Supabase server client instance
│   │   │   ├── realtime.ts           # Realtime subscription helpers
│   │   │   └── index.ts
│   │   ├── tsconfig.json
│   │   └── package.json
│   ├── cv-parser/                       # CV parsing logic (AI-powered extraction)
│   │   ├── src/
│   │   │   ├── index.ts              # Consolidated parser with AI-powered extraction
│   │   │   └── index.test.ts         # Parser tests
│   │   ├── tsconfig.json
│   │   └── package.json
│   ├── utils/                           # Shared utilities
│   │   ├── src/
│   │   │   ├── helpers.ts             # Shared utility functions
│   │   │   ├── helpers.test.ts        # Utility tests
│   │   │   └── index.ts
│   │   ├── tsconfig.json
│   │   └── package.json
│   └── config/                          # Shared configurations
│       ├── eslint/
│       │   └── base.js
│       ├── typescript/
│       │   └── base.json
│       └── tailwind/
│           └── base.css                 # Shared Tailwind @theme tokens
├── tests/
│   └── e2e/                             # Playwright E2E tests
│       ├── tests/
│       │   ├── landing.spec.ts
│       │   ├── auth.spec.ts
│       │   ├── chat.spec.ts
│       │   ├── jobs.spec.ts
│       │   ├── profile.spec.ts
│       │   └── subscription.spec.ts
│       ├── fixtures/
│       │   ├── mock-jobs.ts
│       │   └── mock-user.ts
│       ├── playwright.config.ts
│       └── package.json
├── docs/
│   └── PRD.md                           # This document
├── turbo.json
├── pnpm-workspace.yaml
├── package.json
├── .env.example
├── .gitignore
├── LICENSE
└── README.md
```

### Workspace Configuration

**pnpm-workspace.yaml**:
```yaml
packages:
  - "apps/*"
  - "packages/*"
  - "tests/*"
```

**Turborepo Pipeline** (turbo.json key tasks):
- `build` - depends on `^build` (topological)
- `dev` - persistent, parallel
- `lint` - parallel
- `test` - depends on build
- `test:e2e` - depends on build
- `db:push` - no cache
- `db:migrate` - no cache
- `db:seed` - no cache

---

## 7. Database Schema

All tables use Drizzle ORM with PostgreSQL (Supabase). Identity columns via `generatedAlwaysAsIdentity()`. JSONB for flexible, evolving data.

### 7.1 Auth Tables (BetterAuth-Managed)

BetterAuth v1 requires `user`, `session`, and `account` tables, defined in `packages/db/src/schema/auth.ts` and managed by BetterAuth's Drizzle adapter.

### 7.2 Users Table

```typescript
export const users = pgTable("users", {
  id: text("id").primaryKey(),                     // BetterAuth generates this
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  linkedinId: text("linkedin_id").unique(),
  linkedinData: jsonb("linkedin_data"),             // Full LinkedIn profile JSON
  location: text("location"),
  skills: jsonb("skills").$type<string[]>(),
  experience: jsonb("experience"),                  // Parsed experience entries
  headline: text("headline"),
  photoUrl: text("photo_url"),
  cvUrl: text("cv_url"),                            // Supabase Storage URL
  cvParsedData: jsonb("cv_parsed_data"),
  preferences: jsonb("preferences").$type<{
    jobType: ("remote" | "hybrid" | "onsite")[];
    salaryMin: number | null;
    salaryMax: number | null;
    salaryCurrency: string;
    industries: string[];
    roleLevel: string[];
    skillsFocus: string[];
    locationPreferences: string[];
    companySize: string[];
    aiModel: string | null;                         // User's preferred AI model
    apiKeys: Record<string, string> | null;         // Encrypted BYOK keys
    other: Record<string, unknown>;
  }>(),
  subscriptionStatus: text("subscription_status").default("free"),
  stripeCustomerId: text("stripe_customer_id"),
  onboardingCompleted: integer("onboarding_completed").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
```

### 7.3 Jobs Table (SHARED Across All Users)

Maps from Ever Jobs API `JobPostDto`:

```typescript
export const jobs = pgTable("jobs", {
  id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
  externalId: text("external_id").notNull().unique(), // JobPostDto.id e.g. "li-3693012711"
  site: text("site").notNull(),                       // linkedin, indeed, glassdoor, etc.
  title: text("title").notNull(),
  companyName: text("company_name").notNull(),
  companyUrl: text("company_url"),
  companyLogo: text("company_logo"),
  jobUrl: text("job_url").notNull(),
  jobUrlDirect: text("job_url_direct"),
  applyUrl: text("apply_url"),
  locationCity: text("location_city"),
  locationState: text("location_state"),
  locationCountry: text("location_country"),
  isRemote: boolean("is_remote").default(false),
  jobType: jsonb("job_type").$type<string[]>(),       // fulltime, parttime, etc.
  salaryMin: integer("salary_min"),
  salaryMax: integer("salary_max"),
  salaryCurrency: text("salary_currency").default("USD"),
  salaryInterval: text("salary_interval"),             // yearly, monthly, hourly
  salarySource: text("salary_source"),
  description: text("description"),
  skills: jsonb("skills").$type<string[]>(),
  department: text("department"),
  team: text("team"),
  employmentType: text("employment_type"),
  jobLevel: text("job_level"),
  jobFunction: text("job_function"),
  companyIndustry: text("company_industry"),
  companyNumEmployees: integer("company_num_employees"),
  companyDescription: text("company_description"),
  datePosted: timestamp("date_posted"),
  expiresAt: timestamp("expires_at"),
  rawData: jsonb("raw_data"),                          // Full API response
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Indexes
// CREATE INDEX idx_jobs_skills ON jobs USING gin (skills);
// CREATE INDEX idx_jobs_location_country ON jobs (location_country);
// CREATE INDEX idx_jobs_is_remote ON jobs (is_remote);
// CREATE INDEX idx_jobs_date_posted ON jobs (date_posted DESC);
// CREATE INDEX idx_jobs_title_trgm ON jobs USING gin (title gin_trgm_ops);
```

### 7.4 User-Jobs Junction Table

```typescript
export const userJobs = pgTable("user_jobs", {
  id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  jobId: integer("job_id").notNull().references(() => jobs.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("viewed"),  // viewed | applied | favorited | rejected
  appliedAt: timestamp("applied_at"),
  coverLetter: text("cover_letter"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  uniqueUserJob: unique().on(table.userId, table.jobId),
}));
```

### 7.5 User Alerts Table

```typescript
export const userAlerts = pgTable("user_alerts", {
  id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  frequency: text("frequency").notNull().default("daily"),
  email: text("email").notNull(),
  criteria: jsonb("criteria").$type<{
    keywords: string[];
    locations: string[];
    remoteType: string[];
    salaryMin: number | null;
    salaryMax: number | null;
    skills: string[];
    roleLevel: string[];
    industries: string[];
  }>().notNull(),
  isActive: integer("is_active").default(1),
  lastSentAt: timestamp("last_sent_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
```

### 7.6 Chat Sessions Table

```typescript
export const chatSessions = pgTable("chat_sessions", {
  id: text("id").primaryKey(),                        // UUID
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  agentType: text("agent_type").notNull().default("orchestrator"),
  context: jsonb("context").$type<{
    currentFilters: Record<string, unknown>;
    activeAgentId: string | null;
    onboardingStep: string | null;
  }>(),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
```

### 7.7 Chat Messages Table

```typescript
export const chatMessages = pgTable("chat_messages", {
  id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
  sessionId: text("session_id").notNull().references(() => chatSessions.id, { onDelete: "cascade" }),
  role: text("role").notNull(),                       // user | assistant | system | tool
  content: text("content"),
  toolCalls: jsonb("tool_calls"),
  toolResults: jsonb("tool_results"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
```

### 7.8 Agent Instances Table

```typescript
export const agentInstances = pgTable("agent_instances", {
  id: text("id").primaryKey(),                        // UUID
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  agentType: text("agent_type").notNull(),
  jobId: integer("job_id").references(() => jobs.id),
  sessionId: text("session_id").references(() => chatSessions.id),
  status: text("status").notNull().default("idle"),   // idle | running | waiting_input | completed | failed
  state: jsonb("state"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
```

### 7.9 Subscriptions Table

```typescript
export const subscriptions = pgTable("subscriptions", {
  id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  stripeSubscriptionId: text("stripe_subscription_id").notNull().unique(),
  planType: text("plan_type").notNull(),               // monthly | quarterly | annual
  status: text("status").notNull(),                    // active | past_due | canceled | trialing
  currentPeriodStart: timestamp("current_period_start"),
  currentPeriodEnd: timestamp("current_period_end"),
  cancelAtPeriodEnd: integer("cancel_at_period_end").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
```

### 7.10 Applications Table

```typescript
export const applications = pgTable("applications", {
  id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  jobId: integer("job_id").notNull().references(() => jobs.id),
  agentInstanceId: text("agent_instance_id").references(() => agentInstances.id),
  status: text("status").notNull().default("pending"),
  externalApiResponse: jsonb("external_api_response"),
  questionsAsked: jsonb("questions_asked").$type<{
    question: string;
    fieldType: string;
    required: boolean;
    options: string[] | null;
  }[]>(),
  answersProvided: jsonb("answers_provided").$type<{
    questionId: string;
    answer: string;
  }[]>(),
  coverLetter: text("cover_letter"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
```

### Entity Relationship Diagram

```
users (1) ----< (N) user_jobs >---- (1) jobs
users (1) ----< (N) user_alerts
users (1) ----< (N) chat_sessions (1) ----< (N) chat_messages
users (1) ----< (N) agent_instances >---- (0..1) jobs
users (1) ----< (N) subscriptions
users (1) ----< (N) applications >---- (1) jobs
chat_sessions (1) ----< (N) agent_instances
```

---

## 8. AI Model Configuration

### Default Model
- **Claude Opus 4.6** (`claude-opus-4-6`) via Vercel AI SDK v6
- Configurable via `DEFAULT_AI_MODEL` environment variable

### Per-User Model Selection (Subscription Tier)
- **Free tier**: Claude Haiku 4.5 (fast, cost-efficient for basic chat)
- **Paid tiers**: Claude Opus 4.6 (default), option to switch to GPT-4o, Gemini, etc. in settings
- Model selection stored in `users.preferences.aiModel`

### BYOK (Bring Your Own Key)
- Users can provide their own API keys (OpenAI, Anthropic, Google, etc.) in settings
- Keys stored encrypted in `users.preferences.apiKeys` (JSONB, encrypted at rest)
- When BYOK key is present, routes to that provider instead of platform key
- `packages/ai/src/model-router.ts` handles routing priority: BYOK -> user preference -> tier default -> env default

### Model Router Implementation

```typescript
// packages/ai/src/model-router.ts
export function getModelForUser(user: User): LanguageModel {
  // 1. BYOK: user has own API key
  if (user.preferences?.apiKeys?.anthropic) {
    return createAnthropic({
      apiKey: decrypt(user.preferences.apiKeys.anthropic)
    })("claude-opus-4-6");
  }
  // 2. User preference: user selected a specific model
  if (user.preferences?.aiModel) {
    return resolveModel(user.preferences.aiModel);
  }
  // 3. Tier default: free = haiku, paid = opus
  if (user.subscriptionStatus === "free") {
    return anthropic("claude-haiku-4-5-20251001");
  }
  // 4. Platform default from env var
  return resolveModel(process.env.DEFAULT_AI_MODEL ?? "claude-opus-4-6");
}
```

---

## 9. AI Agent Architecture

Built on Vercel AI SDK v6 with a **unified orchestrator agent** architecture. All task-specific behavior (onboarding, job search, cover letters, applications, interview prep) is driven by the system prompt and tool selection, not separate agent instances. Model routing uses OpenRouter for multi-provider access and Langfuse for prompt management and observability.

### Architecture Overview

```
                        +-------------------+
                        |                   |
   User Message ------->|  Orchestrator     |
                        |  Agent            |
                        |  (unified)        |
                        +--------+----------+
                                 |
              All 11 tools registered directly
                                 |
         +-------+-------+------+------+-------+-------+
         |       |       |      |      |       |       |
     search  update  favorite  get   save   generate  create
     Jobs   Filters   Job    Details Prefs  CoverLtr  Alert
                                 |
                    +------+-----+------+
                    |      |            |
                 apply  submit     interview
                 Job   Answers       Prep
                (HITL)  (HITL)
```

**Key Design Principle**: "Agent routing" is handled by the LLM interpreting the system prompt at `packages/ai/src/prompts/orchestrator-system.ts`, NOT by code dispatching to separate agent instances. The system prompt includes behavioral guidance for all workflows.

### 9.1 Orchestrator Agent (Unified)

**Purpose**: Single agent that handles ALL user interactions -- onboarding, job search, cover letters, applications, interview prep, and general conversation.

**File**: `packages/ai/src/agents/orchestrator.ts`

**Capabilities**:
- All 11 tools registered directly on a single agent instance
- System prompt (`orchestrator-system.ts`) contains behavioral guidance for each workflow domain
- Intent detection is implicit via LLM reasoning, not explicit code routing
- Handles general conversation and complex multi-step workflows alike
- Human-in-the-loop approval for sensitive actions (apply, submit answers)

**Behavioral Domains** (driven by system prompt, not separate agents):
- **Onboarding**: Guides new users through preference collection using LinkedIn data; AI-guided with topic list from `guidance-topics.ts`, not hardcoded questions
- **Job Search**: Translates natural language to structured filter parameters, queries jobs table, returns results with commentary
- **Cover Letters**: Generates personalized cover letters using user profile + job description
- **Applications**: End-to-end job application with HITL approval flows
- **Interview Prep**: Interview question identification, STAR method coaching, mock interviews, company research

### 9.2 Onboarding Behavior

**Driven by**: System prompt guidance + `guidance-topics.ts`

**Key Design**: NOT hardcoded questions. AI-guided with a topic list:
- Job type preference (remote/hybrid/on-site)
- Salary expectations and currency
- Industry/sector preferences
- Role level (entry/junior/mid/senior/lead/executive)
- Key skills to match
- Location preferences (city, country, willingness to relocate)
- Company size preference (startup/SMB/enterprise)
- Work culture preferences
- Timeline (urgently seeking vs. passively looking)
- Deal-breakers (things to exclude)

The AI weaves these topics into natural conversation, not an interrogation.

### 9.3 Application Flow (Human-in-the-Loop)

**Purpose**: Handles end-to-end job application. Uses `needsApproval: true` on sensitive tools.

**Flow**:
1. User says "Apply to Senior React Developer at TechCorp"
2. Orchestrator identifies application intent from conversation context
3. Agent calls applyJob tool (needsApproval) -> client shows approval UI
4. User approves -> tool opens application URL or sends to external API
5. If external API returns questions -> agent presents in chat
6. User answers -> agent calls submitAnswers (needsApproval)
7. User reviews and approves -> submitted
8. Agent confirms completion, updates applications table

**State Persistence**: Agent state (current step, pending questions, answers) saved to `agent_instances.state` as JSON. Resumable if user navigates away.

**Note**: The Ever Jobs API is read-only (no apply endpoint). Initially, the Apply button opens `applyUrl`/`jobUrl` in a new tab. In Phase 5, a separate external auto-apply API will handle automated applications.

### 9.4 Tools

All tools in `packages/ai/src/tools/`:

| Tool | Description | HITL |
|------|-------------|------|
| `search-jobs` | Query jobs table with filters | No |
| `update-filters` | Push filter state to canvas UI | No |
| `favorite-job` | Toggle favorite status | No |
| `get-job-details` | Fetch single job details | No |
| `get-user-profile` | Read user profile data | No |
| `save-preferences` | Save user preferences and settings | No |
| `generate-cover-letter` | AI cover letter generation | No |
| `create-alert` | Create job alert | No |
| `apply-job` | Initiate application | **Yes** |
| `submit-answers` | Submit application answers | **Yes** |
| `interview-prep` | Interview preparation and coaching | No |

### 9.5 Canvas Sync (Critical Bridge)

Chat tool results stream to client via `useChat` hook. A custom `use-canvas-sync` hook watches for tool invocation results and dispatches to the canvas state store:

- `search-jobs` result -> Updates job cards grid
- `update-filters` result -> Updates filter UI state
- `favorite-job` result -> Toggles heart icon
- `generate-cover-letter` result -> Opens cover letter modal

This means the chat and canvas are synchronized through the AI tool result stream, not a separate API.

---

## 10. Feature Specifications

### 10.1 Landing Page

**Route**: `/` (inside `(marketing)` route group)

**Sections** (top to bottom):

1. **Navigation Header**: Logo ("Ever Jobs"), nav links (Features, Pricing), "Login" and "Get Started" CTAs. Sticky on scroll.

2. **Hero Section**:
   - Headline: "Your AI-Powered Job Search Assistant"
   - Subheadline: "Stop scrolling job boards. Start talking to AI. Ever Jobs finds, filters, and helps you apply -- all through conversation."
   - Primary CTA: "Start Free with LinkedIn" (LinkedIn branded button)
   - Secondary CTA: "See How It Works"
   - Hero visual: Split-screen mockup showing chat + job cards
   - Subtle animated gradient background, dark/light theme aware

3. **Integration Bar**:
   - "Powered by data from 25+ job boards and ATSs"
   - Logo cloud: LinkedIn, Indeed, Glassdoor, ZipRecruiter, Google Jobs, Greenhouse, Lever, Workday, etc.
   - Scrolling animation

4. **Features Grid** (6 cards, 3-column desktop):
   - AI Chat Interface
   - Smart Job Alerts
   - One-Click Cover Letters
   - LinkedIn Integration
   - Multi-Source Search (25+ sources)
   - Application Agent (AI applies for you)

5. **How It Works** (3-step flow):
   - Connect LinkedIn -> Chat with AI -> Land Your Job

6. **Pricing Section** (3 cards):
   - Monthly: $20/mo
   - Quarterly: $12/mo ($36 billed quarterly) - "Most Popular"
   - Annual: $7/mo ($84 billed annually) - "Best Value"
   - Free tier callout

7. **Testimonials**: 3 cards with quotes, names, roles

8. **Final CTA**: "Ready to let AI find your next job?" + button

9. **Footer**: Logo, links (Privacy, Terms, Contact), social links, copyright

**Technical**: Static generated with ISR. OG meta tags. JSON-LD structured data.

### 10.2 Authentication

**Route**: `/login`

**Provider**: BetterAuth v1 with LinkedIn OAuth (OpenID Connect)

**Flow**:
1. User clicks "Start with LinkedIn"
2. BetterAuth redirects to LinkedIn OAuth
3. User authorizes on LinkedIn
4. Callback creates/updates user with LinkedIn data:
   - `sub` -> linkedinId
   - `name` -> name
   - `email` -> email
   - `picture` -> photoUrl
   - `locale.country` -> location (approximate)
5. For new users: `onboardingCompleted = 0`, welcome email sent via Resend
6. Redirect to `/chat`

**Session**: HTTP-only cookie, 30-day expiry, refreshed every 24 hours.

### 10.3 Main App Layout

**Route**: `(dashboard)/layout.tsx`

**Desktop** (>= 1024px):
```
+-------+---------------------------+----------------------------+
| Nav   |      AI Chat Panel        |       Data Canvas          |
| Side  |      (Left, ~40%)         |       (Right, ~60%)        |
| bar   |                           |                            |
| (64px)|  [Messages scrollable]    |  [Content area]            |
|       |                           |                            |
|       |  [Input bar at bottom]    |  [Header + filters]        |
|       |                           |  [Job cards grid]          |
+-------+---------------------------+----------------------------+
```

**Tablet** (768-1023px): 50/50 split, icon-only nav sidebar

**Mobile** (< 768px): Full-screen toggle between Chat and Canvas views. Bottom tab bar.

**Theme**: Dark/light via `next-themes` + Tailwind 4.1 `@theme`. Stored in cookie.

### 10.4 AI Chat System (Left Panel)

**Initial Message** (personalized using LinkedIn data):
```
"Hey [Name]! I'm your AI job assistant. I can see from your LinkedIn
profile that you're a [headline] based in [location]. Let's find your
perfect next role!

Tell me about what you're looking for, or I can ask a few questions
to get started."
```

**System Prompt** (`packages/ai/src/prompts/orchestrator-system.ts`):
- Act as career advisor and job search assistant
- Use conversational style (not interrogative)
- Reference user's profile data
- Guide through preference topics naturally
- Call tools to search/filter/display jobs
- Handle commands ("apply to X", "cover letter for Y")
- Maintain context across conversation

**Guidance Topics** (`packages/ai/src/prompts/guidance-topics.ts`):
Topics to explore naturally during conversation (NOT hardcoded question sequence):
- Job type, salary, industry, role level, skills, location, company size, culture, timeline, deal-breakers

### 10.5 Jobs Canvas (Right Panel)

**Job Card Design**:
```
+--------------------------------------------------+
| [Company Logo]  Company Name              [Heart] |
|                                                    |
| Job Title                                          |
|                                                    |
| [Remote Badge]  Location  |  $120k-$150k/yr       |
|                                                    |
| Brief description (2 lines, truncated)...          |
|                                                    |
| [React] [TypeScript] [Node.js] [AWS]              |
|                                                    |
| Posted 2 days ago  |  via LinkedIn                 |
|                                                    |
| [AI Cover Letter]           [Apply ->]             |
+--------------------------------------------------+
```

**Interactions**:
- Click card body -> detail panel or `/jobs/[id]`
- Heart icon -> toggle favorite (optimistic UI)
- Apply button -> opens `applyUrl` in new tab
- AI Cover Letter button -> triggers cover letter generation

**Filter Bar** (independent of chat):
- Search text input
- Location with autocomplete
- Remote/Hybrid/On-site toggle
- Salary range slider
- "More filters" expandable

**Pagination**: Infinite scroll, 25 jobs per page, skeleton cards during loading.

### 10.6 Job Alerts

**Entry Point**: Banner in chat sidebar or AI prompt during onboarding.

**Chat Flow**:
1. AI asks: frequency (daily/twice daily/weekly)
2. AI confirms email (from LinkedIn)
3. AI summarizes criteria from conversation
4. User confirms
5. AI creates alert via `create-alert` tool

**Trigger.dev Tasks**:
- Daily alerts: `0 8 * * *` (8 AM UTC)
- Twice daily: `0 8,18 * * *` (8 AM + 6 PM UTC)
- Weekly: `0 8 * * 1` (Monday 8 AM UTC)

**Email**: React Email template via Resend. Includes matched jobs with direct links.

### 10.7 AI Cover Letters

**Trigger**: Click "AI Cover Letter" on card or chat command.

**Generation**: Cover Letter Agent uses user profile + job description.

**Output Modal**: Generated letter with actions:
- Edit inline (textarea mode)
- Copy to clipboard
- Download as PDF
- Regenerate with different tone
- Save to `user_jobs.cover_letter`

### 10.8 CV Upload & Parsing

**Entry Point**: Onboarding chat or Profile page.

**Canvas**: Drag & drop zone with file browser fallback.

**Supported**: PDF, DOCX (max 10MB).

**Flow**:
1. File uploaded to Supabase Storage -> `cvUrl`
2. Text extracted (pdf-parse for PDF, mammoth for DOCX)
3. AI-powered structured data extraction (skills, experience, education, certifications, summary)
4. Parsed data stored in `users.cvParsedData`
5. AI confirms extracted data with user in chat

### 10.9 User Profile

**Route**: `/profile`

**Sections**:
1. Header card (photo, name, headline, location, LinkedIn link)
2. Skills (tag chips with add/remove, source indicators)
3. Experience (timeline of positions)
4. Preferences (editable job search preferences)
5. CV (preview/download/re-upload)
6. Subscription status + manage button
7. Application history (table with status, dates)
8. Favorite jobs (grid of cards)

### 10.10 Subscriptions & Billing

**Plans** (`packages/stripe/src/plans.ts`):

| Plan | Price | Billing | Badge |
|------|-------|---------|-------|
| Monthly | $20/month | Monthly | - |
| Quarterly | $12/month | $36 every 3 months | Most Popular |
| Annual | $7/month | $84 annually | Best Value |

**Free Tier Limitations**:
- 10 AI chat messages per day
- 5 job searches per day
- 1 cover letter per week
- No job alerts
- No application agent
- No interview prep agent

**Checkout Flow**: Stripe Checkout -> Webhook -> DB update -> Feature unlock

**Webhook Events**: `checkout.session.completed`, `invoice.payment_succeeded`, `invoice.payment_failed`, `customer.subscription.updated`, `customer.subscription.deleted`

**Customer Portal**: Self-service subscription management via Stripe.

### 10.11 Application Agent (Future-Ready)

Initially: "Apply" opens `applyUrl`/`jobUrl` in new tab.

Phase 5: Agent uses a separate external auto-apply API (NOT the Ever Jobs API, which is read-only) to handle end-to-end applications with HITL approval gates, multi-step Q&A, and state persistence.

The architecture supports any external API that returns questions and accepts answers. The agent instance state is persisted to DB for resumability.

---

## 11. Ever Jobs API Integration

**Source**: [github.com/ever-co/ever-jobs](https://github.com/ever-co/ever-jobs) (NestJS, TypeScript)
**OpenAPI Docs**: Available at `/docs` (Scalar) and `/swg` (Swagger)

### Endpoints

**POST /api/jobs/search** (Primary)

Request body (`ScraperInputDto`):
```json
{
  "searchTerm": "React developer",
  "location": "New York",
  "distance": 50,
  "isRemote": true,
  "jobType": "fulltime",
  "siteType": ["linkedin", "indeed", "glassdoor"],
  "resultsWanted": 15,
  "offset": 0,
  "hoursOld": 72,
  "country": "USA",
  "descriptionFormat": "markdown",
  "enforceAnnualSalary": true
}
```

Query params: `paginate=true`, `page=1`, `page_size=25`

Response:
```json
{
  "count": 50,
  "total_pages": 2,
  "current_page": 1,
  "page_size": 25,
  "cached": false,
  "jobs": [
    {
      "id": "li-3693012711",
      "site": "linkedin",
      "title": "Senior React Developer",
      "companyName": "TechCorp",
      "companyLogo": "https://...",
      "jobUrl": "https://linkedin.com/jobs/view/3693012711",
      "applyUrl": null,
      "location": { "city": "New York", "state": "NY", "country": "USA" },
      "isRemote": true,
      "jobType": ["fulltime"],
      "compensation": {
        "interval": "yearly",
        "minAmount": 130000,
        "maxAmount": 160000,
        "currency": "USD"
      },
      "description": "We are looking for...",
      "skills": ["React", "TypeScript", "Node.js"],
      "datePosted": "2026-02-12",
      "jobLevel": "senior",
      "companyIndustry": "Technology"
    }
  ]
}
```

**POST /api/jobs/analyze** - Search + summary statistics + company intelligence

**Auth**: Optional `x-api-key` header (when `ENABLE_API_KEY_AUTH=true`)

### 25 Job Sources

**Search Boards (11)**: LinkedIn, Indeed, Glassdoor, ZipRecruiter, Google Jobs, Bayt, Naukri, BDJobs, Internshala, Exa, Upwork

**ATS Platforms (7)**: Ashby, Greenhouse, Lever, Workable, SmartRecruiters, Rippling, Workday

**Company Scrapers (7)**: Amazon, Apple, Microsoft, Nvidia, TikTok, Uber, Cursor

### Job Sync Strategy

Trigger.dev task (`packages/triggers/src/jobs/sync-jobs.ts`) runs every 15 minutes:
1. Calls `POST /api/jobs/search` with broad, rotating search terms
2. Maps `JobPostDto` -> DB `jobs` table schema via `packages/jobs-api/src/mappers.ts`
3. Upserts on `external_id` unique constraint
4. Stores full API response in `raw_data` JSONB column
5. Supabase Realtime broadcasts new jobs to connected clients

### Important Notes
- **API is read-only** - No apply endpoint. Applications go through `jobUrl`/`applyUrl`.
- Response caching: Optional in-memory TTL (default 3600s)
- Salary enrichment: Auto-extraction from descriptions for USA jobs

---

## 12. Routing & Navigation

> **Important**: The `(dashboard)` directory is a Next.js **route group** — parentheses mean it does NOT add a URL segment. The actual URLs are `/chat`, `/jobs`, etc., NOT `/dashboard/chat`.

| Route | Access | Description |
|-------|--------|-------------|
| `/` | Public | Landing page |
| `/pricing` | Public | Pricing page |
| `/login` | Public | LinkedIn OAuth login |
| `/chat` | Protected | Main chat + canvas view |
| `/jobs` | Protected | Jobs browse (canvas only) |
| `/jobs/[id]` | Protected | Job detail page |
| `/profile` | Protected | User profile |
| `/settings` | Protected | Settings + subscription management |
| `/dashboard` | Legacy | Redirects to `/chat` |

**Middleware** (`apps/web/middleware.ts`):
- Routes `/chat`, `/jobs`, `/profile`, `/settings` require valid BetterAuth session
- Redirect to `/login` if not authenticated
- Legacy `/dashboard` and `/dashboard/*` redirect to `/chat`
- Security headers (CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy)
- Rate limiting headers on API routes

---

## 13. Security Architecture

### Authentication & Authorization
- BetterAuth session-based auth with HTTP-only cookies
- CSRF protection via BetterAuth's built-in CSRF token
- Session rotation on sensitive operations

### API Security
- Rate limiting: 100 req/min authenticated, 20/min public (Upstash/similar)
- Input validation with Zod schemas on every API endpoint
- All API routes validate session before processing

### Data Security
- SQL injection: Prevented by Drizzle ORM parameterized queries
- XSS: React default escaping + Content Security Policy headers
- BYOK API keys encrypted at rest in database
- Environment variables never exposed to client (`NEXT_PUBLIC_` prefix only for public)
- Stripe webhook signature verification

### Content Security Policy
```
default-src 'self';
script-src 'self' 'unsafe-eval' 'unsafe-inline' https://js.stripe.com;
connect-src 'self' https://api.stripe.com wss://*.supabase.co;
frame-src https://js.stripe.com https://hooks.stripe.com;
img-src 'self' https://*.supabase.co data:;
```

### Environment Variables
```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
DATABASE_URL=

# BetterAuth
BETTER_AUTH_SECRET=
BETTER_AUTH_URL=https://everjobs.ai

# LinkedIn OAuth
LINKEDIN_CLIENT_ID=
LINKEDIN_CLIENT_SECRET=

# AI
ANTHROPIC_API_KEY=
DEFAULT_AI_MODEL=claude-opus-4-6

# Ever Jobs API
EVER_JOBS_API_URL=
EVER_JOBS_API_KEY=

# Stripe
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_MONTHLY_PRICE_ID=
STRIPE_QUARTERLY_PRICE_ID=
STRIPE_ANNUAL_PRICE_ID=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=

# Trigger.dev
TRIGGER_SECRET_KEY=

# Email
RESEND_API_KEY=
EMAIL_FROM=alerts@everjobs.ai
```

---

## 14. Deployment & Infrastructure

### Vercel Configuration
- **Framework**: Next.js 16.1 (auto-detected)
- **Build System**: Turborepo (native Vercel support with remote caching)
- **Root Directory**: `apps/web`
- **Node.js**: 22.x (LTS)

### Function Configuration
- AI chat endpoint: `maxDuration = 60` (streaming), `runtime = "nodejs"`
- Auth middleware: Edge runtime
- Stripe webhook: `maxDuration = 30`, `runtime = "nodejs"`

### Supabase
- Provisioned via Vercel Supabase integration
- Connection pooling via Supabase's built-in PgBouncer
- Database branching for preview deployments (if available)
- Storage buckets: `cvs` (private), `avatars` (public)

### Optimizations
- **ISR**: Landing page, pricing page (revalidate every 3600s)
- **Edge Functions**: Auth middleware, rate limiting
- **Image Optimization**: Company logos via `next/image`
- **Vercel Analytics**: Web Vitals monitoring

---

## 15. Testing Strategy

### Playwright E2E Tests (`tests/e2e/`)

| Test File | Scenarios |
|-----------|-----------|
| `landing.spec.ts` | All sections render, pricing correct, CTAs work, theme toggle |
| `auth.spec.ts` | Login redirects to LinkedIn, callback creates user, session, logout |
| `chat.spec.ts` | Chat panel renders, sends message, receives response, tool results update canvas |
| `jobs.spec.ts` | Job cards render, pagination, filters work, favorites toggle, apply opens tab |
| `profile.spec.ts` | Profile data displays, edit works, CV upload works |
| `subscription.spec.ts` | Pricing page, checkout redirect, feature gating |

### Jest Unit Tests (co-located `*.test.ts`)

| Package | Test Focus |
|---------|-----------|
| `packages/jobs-api` | API response mapping, type validation |
| `packages/cv-parser` | Text extraction, structured data parsing |
| `packages/stripe` | Plan config, webhook event handling |
| `packages/utils` | Zod schema validation |
| `packages/ai/tools` | Tool input/output validation, filter generation |

### Integration Tests
- Stripe webhook handler with mock events
- BetterAuth callback handler
- AI chat route with mock LLM responses

---

## 16. Implementation Phases

### Phase 0: Documentation & Setup
- Write PRD document (`docs/PRD.md`)
- Set proprietary license
- Create `.gitignore`, `.env.example`, `README.md`

### Phase 1: Foundation (Weeks 1-2)
- Turborepo monorepo with all packages scaffolded
- pnpm workspace, turbo.json, shared configs (TS, ESLint, Tailwind)
- `packages/db`: Full Drizzle schema, migrations, seed
- `packages/auth`: BetterAuth + LinkedIn OAuth
- `packages/ui`: ShadCN initialized, core components
- `packages/supabase`: Supabase client (Realtime + Storage)
- `apps/web`: Next.js 16.1 with App Router
- Landing page with all sections
- Dark/light theme system
- Login page with LinkedIn OAuth
- Auth middleware
- Vercel deployment (initial)

**Exit Criteria**: User visits landing page, logs in via LinkedIn, sees blank dashboard, toggles theme.

### Phase 2: Core Experience (Weeks 3-5)
- Split-screen layout (responsive)
- `packages/ai`: Orchestrator + onboarding agents, system prompts, model router
- AI chat with `useChat` integration
- Onboarding flow (LinkedIn greeting, preference collection)
- `packages/jobs-api`: Ever Jobs API client with full type mapping
- `packages/triggers`: Job sync task (every 15 min)
- Jobs canvas with cards, infinite scroll pagination, basic filters
- Canvas sync: chat tool results update jobs
- Mobile responsive with chat/canvas toggle

**Exit Criteria**: User chats with AI, provides preferences, sees matching jobs on canvas in real-time.

### Phase 3: Enhanced Features (Weeks 6-7)
- Favorites (heart icon, persist to user_jobs, profile section)
- Cover Letter Agent + modal UI
- `packages/cv-parser`: Upload to Supabase Storage, extract, parse
- CV drag-and-drop zone in canvas
- User profile page (all sections)
- Settings page (preferences, AI model selection)

**Exit Criteria**: User favorites jobs, generates AI cover letters, uploads CV, views/edits profile.

### Phase 4: Monetization & Alerts (Weeks 8-9)
- `packages/stripe`: Full Stripe integration (checkout, portal, webhooks)
- Pricing page with 3 plan cards
- Subscription middleware/feature gating
- Free tier limitations enforced
- `packages/email`: React Email templates + Resend
- `packages/triggers`: Alert tasks (daily, twice daily, weekly)
- Alert creation flow in chat + management in settings

**Exit Criteria**: User subscribes, pays, gets alerts on schedule via email.

### Phase 5: AI Agents (Weeks 10-12)
- Application Agent with HITL (needsApproval)
- Tool approval UI in chat (approve/deny buttons)
- Agent state persistence + resumption from DB
- Applications table tracking
- Interview Prep Agent
- Agent status indicators in chat
- Enhanced orchestrator routing
- BYOK settings UI

**Exit Criteria**: User says "apply to this job" and agent handles full flow with approval gates. Interview prep provides mock questions.

### Phase 6: Testing & Polish (Weeks 13-14)
- Playwright E2E test suite (all specs)
- Jest unit test suite (all packages)
- Performance optimization (lazy loading, bundle analysis, Core Web Vitals)
- Accessibility audit (WCAG 2.1 AA)
- SEO (meta tags, structured data, sitemap, robots.txt)
- Error boundaries and error pages (404, 500)
- Loading states and skeleton screens
- Toast notifications
- Mobile refinements

**Exit Criteria**: All E2E tests pass, Lighthouse 90+ all categories, WCAG 2.1 AA compliant.

### Phase 7: Production Hardening (Week 15)
- Vercel Analytics + Speed Insights integration
- Bundle analyzer + dynamic imports for heavy components
- BYOK API key encryption at rest (AES-256-GCM)
- Supabase Realtime subscriptions for live job updates
- WCAG 2.1 AA accessibility improvements
- `prefers-reduced-motion` support
- Focus management and ARIA enhancements

**Exit Criteria**: Lighthouse 95+ performance, BYOK keys encrypted at rest, live job updates on canvas, analytics dashboard active.

### Phase 8: Growth & Engagement (Weeks 16-18) — COMPLETE
- ~~Push notifications (web push API)~~ **DONE** — Web Push API with VAPID keys, service worker registration, push subscription management, notification settings card in settings page
- ~~Salary insights and market data visualization~~ **DONE** — `salaryInsights` AI tool with salary range visualization, by-level breakdown, remote vs on-site comparison, top-paying companies
- ~~Company research agent (company culture, Glassdoor reviews, funding)~~ **DONE** — `companyResearch` AI tool queries jobs DB by company name, aggregates positions/locations/departments/levels
- ~~Resume builder agent (generate ATS-optimized resumes)~~ **DONE** — `resumeBuilder` AI tool with ATS keyword extraction, skill overlap analysis, format tips, section suggestions
- ~~Job comparison tool (side-by-side comparison of 2-3 jobs)~~ **DONE** — `JobCompareDialog` with compare mode in canvas, difference highlighting, max 3 jobs
- ~~Social sharing (share job cards via link)~~ **DONE** — Share button on job cards using Web Share API with clipboard fallback
- ~~Referral program (invite friends, earn credits)~~ **DONE** — Referral invite/redeem flow with credit system, referral tracking, settings UI card

### Phase 9: Enterprise & Scale (Weeks 19-24) — COMPLETE
- ~~Team/organization accounts~~ **DONE** — Organizations DB schema (orgs, members, invitations), CRUD API routes, org auth helpers (requireOrgMember/requireOrgRole), organization list/detail pages, organization settings card, invitation acceptance flow
- ~~Admin dashboard for recruiters~~ **DONE** — Role-based access control (user/recruiter/admin), admin layout with sidebar, user management, stats dashboard, role change API
- ~~API access for enterprise customers~~ **DONE** — Enterprise API with SHA-256 hashed API keys, v1 endpoints (jobs search, job detail, companies, salary insights), developer API card in settings
- ~~Custom AI model fine-tuning per organization~~ **DONE** — Org AI config DB schema, GET/PUT API route, org-config merge helper in packages/ai (org overrides user prefs), OrgAiConfigCard settings component with model selector/temperature/max tokens/system prompt, admin AI config page
- ~~White-label support~~ **DONE** — Branding DB schema (brandingConfigs), admin branding settings card with color pickers, public branding resolve API with custom domain support and CDN caching, BrandingProvider context + useBranding hook
- ~~Advanced analytics and reporting~~ **DONE** — 5 analytics API endpoints (overview KPIs, user growth, job market stats, AI usage, subscriptions), full Recharts-powered dashboard with line/bar/pie charts, stat cards, session breakdowns
- ~~Multi-language support (i18n)~~ **DONE** — next-intl integration with cookie-based locale switching, English + Spanish translations, language switcher component

---

## 17. Data Flow Diagrams

### Job Search Flow

```
User types: "Find me remote React jobs over $130k"
  |
  v
useChat hook -> POST /api/ai/chat
  |
  v
Orchestrator Agent processes message
  |
  v
Calls searchJobs tool: { skills: ["React"], isRemote: true, salaryMin: 130000 }
  |
  v
Tool queries PostgreSQL: SELECT FROM jobs WHERE ... ORDER BY date_posted DESC LIMIT 25
  |
  v
Calls updateFilters tool: { isRemote: true, skills: ["React"], salaryMin: 130000 }
  |
  v
Both results stream to client via SSE
  |
  v
use-canvas-sync hook dispatches:
  - search-jobs result -> jobsStore updated -> canvas re-renders
  - update-filters result -> filtersStore updated -> filter chips shown
```

### Subscription Flow

```
User clicks "Subscribe" on Quarterly plan
  |
  v
POST /api/stripe/checkout { planType: "quarterly" }
  |
  v
Server creates Stripe Checkout Session
  |
  v
Redirect to Stripe Checkout page
  |
  v
Payment succeeds -> Stripe fires webhook
  |
  v
POST /api/stripe/webhook (checkout.session.completed)
  |
  v
Handler: verify signature -> create subscription record -> update user status
  |
  v
User redirected to /dashboard with active subscription
```

### Alert Delivery Flow

```
Trigger.dev cron fires: 0 8 * * * (daily 8 AM UTC)
  |
  v
Query: active alerts with frequency = "daily"
  |
  v
For each alert: query jobs matching criteria posted since lastSentAt
  |
  v
If matches found: render React Email template -> send via Resend
  |
  v
Update alert.lastSentAt
```

---

## 18. API Contracts

### AI Chat

```
POST /api/ai/chat
Content-Type: application/json

Request: { messages: Message[], sessionId: string }
Response: Server-Sent Events stream (Vercel AI SDK data stream)
  - Text parts: streamed tokens
  - Tool invocation parts: { toolName, args, result }
  - Tool approval parts: { toolName, args, state: "approval-requested" }
```

### Jobs Search

```
GET /api/jobs/search?q=react&location=new+york&remote=true&salaryMin=120000&page=1&pageSize=25

Response: {
  jobs: Job[],
  total: number,
  page: number,
  pageSize: number,
  hasMore: boolean
}
```

### Favorites

```
POST /api/user/favorites { jobId: 42 } -> 201 { status: "favorited" }
DELETE /api/user/favorites { jobId: 42 } -> 200 { status: "unfavorited" }
GET /api/user/favorites?page=1&pageSize=25 -> 200 { jobs: Job[], total: number }
```

### Alerts

```
POST /api/user/alerts { frequency, email, criteria } -> 201 { id, isActive, ... }
GET /api/user/alerts -> 200 { alerts: Alert[] }
PATCH /api/user/alerts/:id { isActive: false } -> 200 { id, isActive: false }
DELETE /api/user/alerts/:id -> 204
```

### Stripe

```
POST /api/stripe/checkout { planType: "quarterly" } -> 200 { url: "https://checkout.stripe.com/..." }
POST /api/stripe/portal -> 200 { url: "https://billing.stripe.com/..." }
POST /api/stripe/webhook (Stripe payload + signature) -> 200 { received: true }
```

### CV Upload

```
POST /api/cv/upload
Content-Type: multipart/form-data
Body: file (PDF/DOCX, max 10MB)

Response: {
  cvUrl: "https://supabase.storage/...",
  parsedData: { skills, experience, education, summary }
}
```

---

## 19. Non-Functional Requirements

### Performance
- Time to Interactive (landing): < 2.5s
- First Contentful Paint: < 1.5s
- Chat first token latency: < 500ms
- Job search response: < 1s total
- Canvas update after tool result: < 100ms

### Scalability
- Supabase connection pooling for serverless
- Jobs table indexed for 10M+ rows
- Vercel auto-scales serverless functions
- Rate limiting prevents LLM abuse

### Reliability
- Uptime: 99.9% (Vercel SLA)
- Error boundaries on all route segments
- Graceful degradation if Ever Jobs API is down (show cached jobs)
- Stripe webhook retry handling with idempotency

### Accessibility
- WCAG 2.1 AA compliance
- Keyboard navigation for all elements
- Screen reader support (ARIA labels, live regions for chat)
- Color contrast meets AA in both themes
- `prefers-reduced-motion` support

### Browser Support
- Chrome, Firefox, Safari, Edge (last 2 versions)
- iOS Safari 16+, Chrome Android 120+

---

## 20. Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| User activation (completes onboarding) | > 60% | % of signups that complete onboarding chat |
| Jobs viewed per session | > 10 | Average job cards viewed |
| Applications per user/week | > 3 | Average via apply button or agent |
| Alert-to-application conversion | > 15% | % of alert clicks leading to application |
| Free-to-paid conversion | > 5% | % of free users subscribing within 30 days |
| Chat engagement | > 5 messages/session | Average messages per chat session |
| Cover letters generated | > 2/user/week | Average for paid users |
| Net Promoter Score | > 50 | Quarterly survey |
| Lighthouse Performance | > 90 | All pages |
| WCAG Compliance | AA | Automated + manual audit |

---

## Appendix A: Implementation Status (v1.9)

> Updated 2026-02-19 (v1.9). See [MVP Implementation Summary](./MVP-IMPLEMENTATION-SUMMARY.md) for detailed change log.

### Phase Completion

| Phase | Status | Notes |
|-------|--------|-------|
| Phase 0: Documentation & Setup | ✅ Complete | PRD, LICENSE, .gitignore, .env.example, README |
| Phase 1: Foundation | ✅ Complete | Monorepo, DB schema, auth, UI, landing, theme, middleware |
| Phase 2: Core Experience | ✅ Complete | Split-screen, AI chat, job sync, canvas, mobile responsive |
| Phase 3: Enhanced Features | ✅ Complete | Favorites, cover letters, CV upload, profile, settings |
| Phase 4: Monetization & Alerts | ✅ Complete | Stripe, pricing, gating, email templates, alert cron tasks |
| Phase 5: AI Agents | ✅ Complete | Application agent (HITL), interview prep, BYOK, agent status |
| Phase 6: Testing & Polish | ✅ Complete | E2E + unit tests, error boundaries, loading states, SEO, sitemap |
| Phase 7: Production Hardening | ✅ Complete | Analytics, Speed Insights, bundle optimization, BYOK encryption, Realtime, a11y |
| Phase 8: Growth & Engagement | ✅ Complete | Job comparison, social sharing, company research, salary insights, resume builder, push notifications, referral program |
| Phase 9: Enterprise & Scale | ✅ Complete (7/7) | Team accounts, admin dashboard, enterprise API, org AI config, white-label, analytics, i18n |
| Post-Audit Fixes (v1.6) | ✅ Complete | Security hardening, broken link fixes, dead code cleanup, feature wiring |
| Post-MVP Polish (v1.7-1.9) | ✅ Complete | Batches 2-7: rate limiting, DB indexes, Stripe idempotency, SEO, health checks, env validation, test expansion (246→470, 19 suites), keyboard a11y, error standardization, Cache-Control headers, push handlers, structured data, XSS sanitization, zero-byte validation, Realtime reconnection, bundle optimization |

### Post-Audit Fixes (v1.6)

Comprehensive codebase audit identified and resolved 19 issues across security, completeness, and code quality:

#### Security Fixes
- **ILIKE wildcard escaping** in admin user search to prevent pattern injection
- **Crypto-based referral codes** — replaced `Math.random()` with `crypto.randomBytes()`
- **JSON-LD XSS prevention** — escape `</script>` in structured data component
- **DB transactions** for referral redemption and org invitation acceptance (race condition prevention)
- **Input validation** — max length on admin search schema

#### Broken Links & Missing Pages
- Created `/terms`, `/privacy`, `/about`, `/contact` marketing pages with real content
- Removed dead `/blog` link from footer
- Added `/organizations` to middleware protected routes
- Replaced admin jobs "Coming Soon" stub with real job management page + search/pagination API

#### Dead Code & Feature Wiring
- **Org AI config integration** — `mergeOrgConfig()` now called in chat route, org settings override user prefs
- **LanguageSwitcher** integrated into dashboard sidebar
- **Schema type fix** — `organizationId` changed from `text` to `integer` in branding + AI config schemas
- **OpenRouter mapping** added for `claude-sonnet-4-5-20250929`
- Removed dead `orchestrator-system.ts` prompt (outdated copy, never used)
- Extracted shared `StatCard` component; deduplicated `timeAgo`/`formatDate` across admin pages

#### Known Low-Severity Items (resolved in v1.7)
- ~~Inconsistent `withTimezone` on older schema tables~~ (deferred, low impact)
- ~~In-memory rate limiting (production should use Redis)~~ **RESOLVED** — Upstash Redis rate limiting on all routes with tiered limits
- ~~Missing DB indexes on `jobs.department`, `applications(userId, jobId)`~~ **RESOLVED** — Composite indexes added in Batch 3
- ~~Stripe webhook idempotency uses in-memory Map (production should use Redis SET NX)~~ **RESOLVED** — Database-backed idempotency in Batch 4

### Post-MVP Polish (v1.7-1.9) — Batches 2-7

After the v1.6 audit fixes, six additional improvement batches were completed to harden the platform for production readiness, improve developer experience, and polish the user-facing experience.

#### Batch 2: MVP Improvements

Focus: Route hardening, new user flows, admin polish, and code cleanup.

- **Rate limiting on admin/public routes** — Added Upstash Redis rate limiting to 11 admin and public API routes with 3 new tiers: `adminWrite` (30 req/min), `adminRead` (60 req/min), `publicRead` (100 req/min). All routes now have consistent rate limit enforcement.
- **Organization invitation acceptance page** — New `/organizations/invitations/[token]` page with GET handler that validates invitation tokens, shows org details, and allows users to accept invitations with a single click.
- **Referral code capture in login** — Login page captures `?ref=CODE` query parameter from referral links. Referral codes are stored in session and automatically redeemed when users reach the dashboard, crediting both referrer and referee.
- **API documentation page** — New `/developers` page for enterprise API consumers with endpoint documentation, authentication guide, code examples, rate limit details, and interactive "Try It" sections.
- **Mobile-responsive admin sidebar** — Admin layout sidebar now collapses to a hamburger menu on mobile viewports. Uses Sheet component from `@repo/ui` for slide-out navigation with proper focus management.
- **Admin error states with retry** — All admin pages now display user-friendly error states with retry buttons when data fetching fails, replacing silent failures with actionable UI.
- **AI tool export fixes** — `companyResearch` and `resumeBuilder` tools were defined but not exported from `packages/ai/src/tools/index.ts`. Both are now properly exported and available to the orchestrator.
- **Unused function cleanup** — Removed dead utility functions across packages. Consolidated triggers package by removing redundant task definitions and unifying shared helpers.

#### Batch 3: Production Hardening

Focus: Database performance, UI components, error handling, validation, and test coverage.

- **Database indexes** — Added GIN indexes on `jobs.skills` (JSONB) and `jobs.title` (trigram) for fast full-text and skill-based search. Added composite indexes on `applications(userId, jobId)` and `userJobs(userId, jobId)` for efficient favorite and application lookups. These indexes support the 10M+ row scalability target.
- **AlertDialog UI component** — Added ShadCN `AlertDialog` to `packages/ui/` for destructive action confirmations. Used for organization member removal with explicit "Remove Member" / "Cancel" actions instead of instant deletion.
- **Chat route error handling** — `/api/ai/chat` route now catches model provider errors, rate limit exhaustion, and malformed requests with graceful degradation. Returns structured error responses instead of 500s, and the chat UI displays user-friendly error messages with suggestions.
- **Supabase Realtime error handling** — `useRealtimeJobs` hook now handles subscription errors (auth failures, connection drops) with automatic reconnection and exponential backoff. Error states are surfaced to the canvas UI.
- **Environment variable validation** — Added runtime validation for `BYOK_ENCRYPTION_KEY` (required for BYOK features) and `NEXT_PUBLIC_APP_URL` / `APP_URL` (required for email links and OAuth callbacks). Missing variables now produce clear startup warnings instead of cryptic runtime errors.
- **Test suite expansion** — Expanded from 246 to 434 tests across all packages. New coverage includes: admin API routes, organization CRUD operations, rate limiting behavior, referral code flow, environment validation, error boundary rendering, and Supabase Realtime reconnection logic.

#### Batch 4: Infrastructure & Polish

Focus: Payment reliability, UI loading states, empty states, and developer experience.

- **Stripe webhook idempotency** — Replaced the in-memory `Map`-based idempotency check with a database-backed implementation using a `webhookEvents` table. Webhook event IDs are stored with `ON CONFLICT DO NOTHING` semantics, ensuring duplicate Stripe events are safely ignored even across serverless function instances and cold starts.
- **Loading spinners for async operations** — Added loading state indicators for AI model save in settings (prevents double-save) and job alert toggle switches (shows pending state while API call completes). Uses `useTransition` for non-blocking updates.
- **Empty states** — Added contextual empty state illustrations and messaging for: jobs canvas when search returns no results ("Try broadening your search"), job detail page when job data is unavailable, and admin search results when no users/jobs match the query.
- **Shared constants file** — Created `apps/web/lib/constants.ts` centralizing magic numbers and repeated strings: pagination defaults, rate limit tier names, subscription plan IDs, file upload size limits, and default filter values. Replaces scattered hardcoded values across components and API routes.
- **Comprehensive .env.example** — Updated `.env.example` to include all environment variables used across the monorepo, grouped by service (Supabase, Auth, AI, Stripe, Trigger.dev, Email, Analytics, Feature Flags). Each variable includes a comment describing its purpose and whether it is required or optional.

#### Batch 5: Production Readiness

Focus: SEO, monitoring, environment safety, and error resilience.

- **SEO metadata** — Added OpenGraph and Twitter Card metadata to all marketing pages (`/`, `/pricing`, `/about`, `/contact`, `/terms`, `/privacy`, `/developers`). Each page has unique `title`, `description`, `og:image`, and `twitter:card` tags. Uses Next.js `generateMetadata()` for dynamic metadata generation.
- **Updated sitemap** — `apps/web/app/sitemap.ts` now includes all public pages with appropriate `changeFrequency` and `priority` values. Marketing pages are prioritized; dashboard routes are excluded.
- **robots.txt** — Added `apps/web/app/robots.ts` that blocks crawlers from `/api/`, `/admin/`, and authenticated dashboard routes while allowing all marketing pages. Includes sitemap URL reference.
- **Health check endpoint** — Enhanced `/api/health` to include database connectivity check with a 5-second timeout, HEAD method support for lightweight monitoring, and response body with `version` (from `package.json`), `uptime` (process uptime), `status` ("healthy" / "degraded"), and `timestamp`. Returns 200 for healthy, 503 for degraded (DB unreachable).
- **Startup environment validation** — Added `apps/web/instrumentation.ts` logic that runs on server startup, validating environment variables in three tiers: **critical** (app crashes without these: `DATABASE_URL`, `BETTER_AUTH_SECRET`), **recommended** (features degrade: `STRIPE_SECRET_KEY`, `RESEND_API_KEY`, `ANTHROPIC_API_KEY`), and **optional** (nice-to-have: `LANGFUSE_PUBLIC_KEY`, `NEXT_PUBLIC_POSTHOG_KEY`). Missing critical vars throw; missing recommended vars log warnings.
- **Admin error boundary** — Added a dedicated error boundary for the `/admin` route segment. Previously, admin page errors would bubble up to the root error boundary, losing the admin sidebar context. The admin error boundary preserves the admin layout and provides a "Return to Dashboard" action.

#### Batch 6: Test Coverage & Accessibility Polish

Focus: Test suite expansion, keyboard accessibility, error response consistency, and missing page states.

- **Test coverage expansion (434 to 470 tests, 19 suites)** — Added 36 new unit tests, bringing the total to 470 across 19 test suites. Coverage now spans all core packages (`ai`, `stripe`, `cv-parser`, `jobs-api`, `utils`, `email`, `web-lib`) with deeper coverage of edge cases and integration scenarios.
- **Org-config merge tests** (`org-config.test.ts`) — New test file validating the `mergeOrgConfig()` helper that merges organization-level AI configuration overrides with user preferences. Tests cover: default fallback behavior, partial overrides, system prompt concatenation, temperature/max-token clamping, and edge cases with missing org or user configs.
- **Webhook idempotency tests** (`webhook-idempotency.test.ts`) — New test file verifying the database-backed Stripe webhook idempotency logic. Tests cover: first-time event processing, duplicate event rejection, concurrent event handling, and cleanup of expired event records.
- **Job not-found page** — Added `apps/web/app/(dashboard)/jobs/[id]/not-found.tsx`, a custom 404 page rendered when a job ID does not exist in the database. Provides a user-friendly message with a link back to the jobs listing, instead of the generic Next.js 404 page.
- **Admin loading skeleton** — Added `apps/web/app/(admin)/admin/loading.tsx`, a skeleton UI displayed while admin pages load. Preserves the admin layout context (sidebar) and shows shimmer placeholders for stat cards, tables, and charts, preventing layout shift during data fetching.
- **Job card keyboard accessibility in compare mode** — Job cards in the compare selection mode are now fully keyboard navigable. Users can tab between cards and toggle compare selection with Enter/Space. Focus indicators are visible and ARIA attributes (`aria-selected`, `aria-label`) are set correctly for screen reader compatibility.
- **Webhook error response standardization** — The Stripe webhook route (`/api/stripe/webhook`) now uses the standardized `apiBadRequest()` and `apiError()` helpers from `apps/web/lib/api-response.ts` for all error responses, replacing ad-hoc `NextResponse.json()` calls. This ensures consistent error shape (`{ error, message, status }`) across all API routes.
- **Startup check improvements** — Added `NEXT_PUBLIC_APP_URL` to the recommended environment variables validated during server startup in `apps/web/lib/startup-checks.ts`. Missing `NEXT_PUBLIC_APP_URL` now logs a warning at boot, since it is required for email template links, OAuth callback URLs, and Open Graph metadata.

#### Batch 7: Security, Caching & Resilience

Focus: API response security, push notification reliability, SEO structured data expansion, input validation hardening, and client-side resilience.

- **Default Cache-Control headers on all API responses** — All API routes now include `Cache-Control: private, no-cache, no-store, must-revalidate` headers by default. This prevents browsers and intermediate proxies from caching sensitive authenticated API responses (user data, subscription status, AI chat streams). Applied consistently across all route handlers via a shared response helper.
- **Push notification handlers in service worker** — The service worker (`public/sw.js`) now includes `push` and `notificationclick` event handlers for Web Push API integration. The `push` handler parses incoming push payloads and displays system notifications with the app icon, badge, and configurable actions. The `notificationclick` handler opens the relevant app page (e.g., job detail, chat) when the user taps a notification, focusing an existing window if available or opening a new one.
- **JSON-LD structured data for pricing and about pages** — Extended structured data coverage beyond the landing page. The `/pricing` page now includes `FAQPage` and `PricingTable`/`Offers` JSON-LD schemas for rich search results. The `/about` page includes an `Organization` schema with company details. All structured data types across the site: `Organization` (landing + about), `WebSite` (landing), `SoftwareApplication` (landing), `FAQPage` (pricing), `PricingTable`/`Offers` (pricing).
- **XSS sanitization for custom skill input** — Custom skill tags entered by users on the profile and onboarding flows are now sanitized to strip HTML tags and script content before storage. This prevents stored XSS attacks where malicious skill names could be rendered in job match displays, cover letters, or admin views.
- **Zero-byte file validation for CV uploads** — The CV upload endpoint (`/api/cv/upload`) now rejects zero-byte files with a descriptive error message, in addition to the existing 10MB max size and PDF/DOCX MIME type checks. Previously, empty files would pass validation but cause downstream parsing failures in the CV parser.
- **Realtime subscription auto-reconnection** — The `useRealtimeJobs` hook now implements automatic reconnection with exponential backoff (3 attempts, starting at 1 second). When the Supabase Realtime WebSocket connection drops (network interruption, server restart, auth token expiry), the hook automatically attempts to re-establish the subscription. Failed reconnection attempts surface an error state to the canvas UI, and successful reconnection resumes live job updates without user intervention.
- **Bundle optimization** — Added `optimizePackageImports` configuration in `next.config.ts` for `lucide-react` and `recharts`. This enables tree-shaking at the module level for these icon and chart libraries, reducing the client-side JavaScript bundle by eliminating unused exports. Particularly impactful for `lucide-react` which exports 1000+ icon components but only ~50 are used in the app.

### Phase 7: Production Hardening (v1.2) + Architecture Audit (v1.3)

Added in v1.2 to address known limitations from MVP. Updated in v1.3 to reflect architecture audit findings:

#### 7.1 Vercel Analytics & Speed Insights
- **`@vercel/analytics`**: Web analytics with page view tracking, custom events
- **`@vercel/speed-insights`**: Real User Monitoring (RUM) for Core Web Vitals (LCP, FID, CLS, TTFB, INP)
- Both integrated in root layout, zero-config on Vercel deployment

#### 7.2 Bundle Optimization
- **`@next/bundle-analyzer`**: Available via `ANALYZE=true pnpm build` for visual bundle inspection
- **Dynamic imports**: Heavy components (`CoverLetterModal`, `InterviewPrepPanel`, `CVDropzone`) loaded with `next/dynamic` to reduce initial bundle
- **Route-level code splitting**: Automatic via Next.js App Router (each route = separate chunk)

#### 7.3 BYOK API Key Encryption at Rest
- **Algorithm**: AES-256-GCM (authenticated encryption with associated data)
- **Key derivation**: PBKDF2 with SHA-256 from `BYOK_ENCRYPTION_KEY` env var
- **Implementation**: `packages/ai/src/crypto.ts` provides `encryptApiKey()` / `decryptApiKey()`
- **Storage format**: `iv:authTag:ciphertext` (base64-encoded, stored in `preferences.apiKeys`)
- **Integration**: Model router transparently decrypts BYOK keys before use
- **Settings UI**: Encrypts keys on save via API, never sends plaintext to client

#### 7.4 Supabase Realtime
- **`packages/supabase/src/realtime.ts`**: Typed subscription helpers for jobs table changes
- **`apps/web/hooks/use-realtime-jobs.ts`**: React hook subscribing to INSERT/UPDATE on `jobs` table
- **Canvas integration**: New jobs appear live on canvas without manual refresh
- **Cleanup**: Subscriptions properly unsubscribed on component unmount

#### 7.5 Accessibility (WCAG 2.1 AA)
- Focus management: Visible focus rings on all interactive elements
- Color contrast: Verified AA contrast ratios (4.5:1 text, 3:1 large text)
- ARIA labels: All form inputs, buttons, and regions properly labeled
- Live regions: Chat messages and canvas updates use `aria-live` for screen readers
- Reduced motion: `prefers-reduced-motion` respected for all animations
- Skip links: "Skip to main content" link in root layout
- Semantic HTML: Proper heading hierarchy, landmarks, and form associations

#### 7.6 OpenRouter Integration
- **Multi-model routing**: OpenRouter used as a provider for accessing multiple LLM backends (Anthropic, OpenAI, etc.) through a single API
- **Configuration**: Integrated into `model-router.ts` alongside direct provider access
- **Fallback**: Enables graceful model fallback when a primary provider is unavailable

#### 7.7 Langfuse Observability
- **Prompt management**: System prompts managed and versioned via Langfuse
- **Tracing**: AI request/response tracing for debugging and optimization
- **Analytics**: Token usage tracking, latency monitoring, and cost analysis per user/session

#### 7.8 Chat Persistence & Session History
- **3 API routes**: Chat sessions CRUD, message history retrieval, session management
- **Schema**: Combined `chat.ts` schema handles both sessions and messages in a single file
- **Resumable**: Users can continue previous conversations with full context restoration

#### 7.9 PWA Support
- **Install prompt**: Progressive Web App install prompt for mobile and desktop
- **Offline page**: Custom offline fallback page when network is unavailable
- **Service worker**: Caches critical assets for improved load performance

#### 7.10 Keyboard Shortcuts
- **System**: Global keyboard shortcuts for common actions (navigation, search focus, theme toggle)
- **Discoverability**: Shortcut hints displayed in UI tooltips

#### 7.11 API Endpoints
- **Health check**: `/api/health` endpoint for uptime monitoring and deployment verification
- **User data export**: `/api/user/export` endpoint for GDPR-compliant data export
- **Usage stats/quota tracking**: `/api/user/usage` endpoint for tracking AI usage against subscription tier limits

### Key Architectural Decisions Made During Implementation

1. **Route Groups**: `(dashboard)` does NOT add URL segments. Actual routes are `/chat`, `/jobs`, `/profile`, `/settings`.
2. **BYOK Provider**: Uses `createAnthropic({ apiKey })` from `@ai-sdk/anthropic` (not just the default `anthropic()` helper).
3. **Email URLs**: Centralized `getAppUrl()` helper reads `NEXT_PUBLIC_APP_URL` env var for all email template links.
4. **Welcome Email Hook**: Sent via BetterAuth's `databaseHooks.user.create.after`, not a separate API call.
5. **Application Tracking**: `applyJobTool` upserts into both `applications` and `userJobs` tables for complete tracking.
6. **Model Router Priority**: BYOK key → user preference → subscription tier default → environment variable default.
7. **BYOK Encryption**: AES-256-GCM with PBKDF2 key derivation; encrypted at rest in JSONB, decrypted only in model-router at runtime.
8. **Analytics**: Vercel Analytics + Speed Insights for zero-config RUM on Vercel deployment.
9. **Realtime Architecture**: Supabase Realtime subscriptions scoped to `jobs` table INSERTs; canvas updates via React hook.
10. **Unified Agent Architecture**: Single orchestrator agent with 12 tools (searchJobs, favoriteJob, generateCoverLetter, interviewPrep, applyJob, generateJobAlerts, parseCV, salaryInsights, scheduleFollowUp, getApplicationStatus, jobRecommendations, companyResearch), NOT multi-agent dispatch. All behavioral specialization lives in the system prompt.
11. **OpenRouter + Langfuse**: Multi-model routing via OpenRouter; prompt management and observability via Langfuse.
12. **Chat Persistence**: 3 API routes for session management; combined `chat.ts` schema for sessions + messages.

### Known Limitations (Out of Scope)

- Automated job applications (requires external auto-apply API)
- Database branching for preview deployments (Supabase feature)
- CV drag-and-drop zone in canvas (exists on profile page only)
- Multi-provider BYOK (only Anthropic keys supported; OpenAI/Google keys stored but not yet routed)
- Multi-agent architecture (consolidated into single orchestrator; separate agents may be reintroduced if complexity warrants it)

---

## Appendix B: License

This project is proprietary software. All rights reserved.

Copyright (c) 2026 Ever Co. LTD.

Unauthorized copying, modification, distribution, or use of this software, via any medium, is strictly prohibited.
