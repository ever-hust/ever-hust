# AGENTS.md

This file provides guidance to all AI coding assistants (GitHub Copilot, Google Gemini, Cursor, Windsurf, Claude Code, etc.) when working with this repository.

> [!CAUTION]
> **This project uses pnpm exclusively.** Do NOT use `npm` or `yarn` — they will fail to resolve workspace dependencies. The root `package.json` specifies `"packageManager": "pnpm@9.15.0"` and workspaces are defined in `pnpm-workspace.yaml`.

## Quick Reference

| Item                  | Value                                |
| --------------------- | ------------------------------------ |
| **Package Manager**   | pnpm 9 (NOT npm, NOT yarn)           |
| **Dev Server**        | `pnpm dev` → http://localhost:8443   |
| **Framework**         | Next.js 16.1 (App Router, Turbopack) |
| **Monorepo**          | Turborepo with pnpm workspaces       |
| **Package Namespace** | `@ever-hust/*`                       |
| **Workspace Config**  | `pnpm-workspace.yaml`                |
| **Node Version**      | ≥24                                  |

## Commands

```bash
pnpm install              # Install all dependencies
pnpm dev                  # Start dev server (port 8443, Turbopack)
pnpm build                # Build all packages and apps (via Turborepo)
pnpm lint                 # Lint all packages (eslint --max-warnings 0)
pnpm check-types          # Type-check all packages
pnpm test                 # Run all Jest unit tests
pnpm test:e2e             # Run Playwright E2E tests
pnpm db:push              # Push schema changes to database
pnpm db:migrate           # Run database migrations
pnpm db:generate          # Generate migration files
pnpm db:seed              # Seed database with test data
pnpm db:studio            # Open Drizzle Studio GUI
```

## Monorepo Structure

```
apps/web/                  — Next.js application (the only app)
packages/ai/               — AI orchestrator, tools, model router, prompts
packages/auth/             — BetterAuth with LinkedIn OAuth
packages/config/           — Shared configuration
packages/cv-parser/        — CV/resume parsing
packages/db/               — Drizzle ORM schemas + database client
packages/email/            — React Email templates + Resend sender
packages/eslint-config/    — Shared ESLint configs
packages/jobs-api/         — Ever Jobs external API client (circuit breaker + retry)
packages/stripe/           — Stripe checkout, portal, webhooks
packages/supabase/         — Supabase client (Realtime + Storage)
packages/triggers/         — Trigger.dev scheduled tasks
packages/typescript-config/— Shared tsconfig presets
packages/ui/               — ShadCN components (import as @ever-hust/ui/<name>)
packages/utils/            — Shared utilities and constants
```

## Key Conventions

- **UI imports**: `import { Button } from "@ever-hust/ui/button"` (direct file exports, no barrel)
- **Workspace deps**: Use `"@ever-hust/<pkg>": "workspace:*"` in `package.json`
- **API routes**: Authenticate via `requireSessionUser()`, validate with Zod, use `apiBadRequest()`/`apiError()` helpers
- **Testing**: Jest unit tests live alongside source as `*.test.ts`; Playwright E2E in `tests/e2e/`
- **DB client**: Lazy singleton via Proxy — only connects on first access
- **Environment**: Copy `.env.example` → `.env.local`; startup checks validate critical vars on boot

## Standalone-First Principle (Gauzy integration is optional)

> [!IMPORTANT]
> **Hust must always build, run, and ship without any Gauzy product.** The only hard external
> dependency is the **Ever Jobs API** (`packages/jobs-api`). Hust owns its own auth (BetterAuth +
> LinkedIn), users, DB, and apply flow.

Hust *optionally* integrates with the wider **Ever Gauzy** platform (for the agency/company
scenario) via two future seams, both through the **Gauzy AI API** and both off by default:

- **Seam A — Auto-apply:** default is manual apply (open the apply URL); optional auto-apply hands
  the application to Gauzy AI's `AutomationTask` queue + the Ever Gauzy AI Automation client.
- **Seam B — Identity/employee/org/tenant sync (SSO):** default is own BetterAuth + LinkedIn;
  optional SSO mirrors employees from Ever Gauzy API via a shared JWT and `external*Id` refs.

When adding/reviewing any Gauzy-related feature, keep these invariants:

1. **No hard Gauzy dependency** — standalone must work with zero Gauzy config.
2. **Flagged + adapter + graceful fallback** to the standalone behavior.
3. **Integrate via the Gauzy AI API**, not by embedding Gauzy internals.

Full design: [`docs/GAUZY-INTEGRATION.md`](docs/GAUZY-INTEGRATION.md).

## Important Notes

- `packages/jobs-api/` is a client for the **external** Ever Jobs API service — do not rename its API references to "Hust"
- The dev server runs on port **8443** (configured in `apps/web/package.json`)
- See `CLAUDE.md` for more detailed architecture documentation
