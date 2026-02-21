# Hust

AI-powered job search platform. Chat with AI to find, apply, and land your dream job.

## Overview

Hust is an AI-first job search platform where the primary UX is a conversational AI assistant. After LinkedIn login, users interact through a split-screen interface: AI chat on the left and a dynamic data canvas on the right.

**Domain**: everjobs.ai

## Tech Stack

- **Framework**: Next.js 16.1 (App Router, Server Components, Turbopack)
- **Styling**: Tailwind CSS 4.1 + ShadCN UI
- **Build**: Turborepo monorepo with pnpm
- **Auth**: BetterAuth v1 (LinkedIn OAuth)
- **Database**: PostgreSQL via Supabase (Drizzle ORM)
- **AI**: Vercel AI SDK v6 (Claude Opus 4.6 default, multi-model, BYOK)
- **Jobs**: Scheduled background tasks with Trigger.dev v3
- **Payments**: Stripe subscriptions
- **Email**: React Email + Resend
- **Testing**: Playwright (E2E) + Jest (Unit)
- **Deployment**: Vercel

## Project Structure

```
ever-jobs-website/
├── apps/web/          # Next.js 16.1 application
├── packages/
│   ├── ui/            # ShadCN shared components
│   ├── db/            # Drizzle ORM schemas + migrations
│   ├── auth/          # BetterAuth configuration
│   ├── ai/            # AI agents, tools, prompts
│   ├── jobs-api/      # Hust API client
│   ├── stripe/        # Stripe integration
│   ├── email/         # Email templates + sending
│   ├── triggers/      # Trigger.dev tasks
│   ├── supabase/      # Supabase client (Realtime + Storage)
│   ├── cv-parser/     # CV parsing logic
│   ├── utils/         # Shared utilities
│   └── config/        # Shared configs
├── tests/e2e/         # Playwright E2E tests
└── docs/              # Documentation
```

## Getting Started

### Prerequisites

- Node.js 22+
- pnpm 9+
- Supabase account
- LinkedIn Developer App
- Stripe account
- Anthropic API key

### Setup

```bash
# Install dependencies
pnpm install

# Copy environment variables
cp .env.example .env.local
# Fill in the values in .env.local

# Push database schema
pnpm db:push

# Seed development data
pnpm db:seed

# Start development
pnpm dev
```

### Commands

```bash
pnpm dev          # Start all apps in development mode
pnpm build        # Build all packages and apps
pnpm lint         # Lint all packages
pnpm test         # Run unit tests
pnpm test:e2e     # Run Playwright E2E tests
pnpm db:push      # Push schema changes to database
pnpm db:migrate   # Run database migrations
pnpm db:seed      # Seed database with test data
pnpm db:studio    # Open Drizzle Studio
```

## Documentation

- [Product Requirements Document](docs/PRD.md) — Full PRD with implementation status
- [MVP Implementation Summary](docs/MVP-IMPLEMENTATION-SUMMARY.md) — Detailed changelog of all MVP work
- [Architecture Decisions](docs/ARCHITECTURE-DECISIONS.md) — Key architectural decisions and rationale

## License

Proprietary. All rights reserved. See [LICENSE](LICENSE) for details.

Copyright (c) 2026 Ever Co. LTD.
