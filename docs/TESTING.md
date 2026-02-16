# Testing Guide

## Overview

Ever Jobs uses a multi-layer testing strategy:

| Layer | Tool | Location | Purpose |
|-------|------|----------|---------|
| Unit | Jest + ts-jest | `packages/*/src/**/*.test.ts` | Test business logic, schemas, utilities |
| Integration | Jest | `packages/*/src/**/*.test.ts` | Test cross-package interactions |
| E2E | Playwright | `tests/e2e/*.spec.ts` | Test user flows in the browser |

## Running Tests

```bash
# Run all unit/integration tests
pnpm test

# Run specific test suite
pnpm test -- --selectProjects ai
pnpm test -- --selectProjects stripe
pnpm test -- --selectProjects utils

# Run with coverage
pnpm test -- --coverage

# Run E2E tests (requires dev server)
pnpm test:e2e

# Run E2E in headed mode (for debugging)
pnpm exec playwright test --headed

# Run specific E2E test
pnpm exec playwright test tests/e2e/landing.spec.ts
```

## Test Structure

### Unit Tests (Jest)

Located in each package alongside source files:

```
packages/
├── ai/src/
│   ├── model-router.ts
│   ├── model-router.test.ts     ← Tests for model routing
│   ├── prompts.ts
│   ├── prompts.test.ts          ← Tests for Langfuse prompt management
│   ├── rate-limit.ts
│   ├── rate-limit.test.ts       ← Rate limiting tests
│   └── tools/__tests__/
│       └── tool-schemas.test.ts ← Tool schema validation tests
├── stripe/src/
│   └── plans.test.ts            ← Pricing plan tests
├── utils/src/
│   └── helpers.test.ts          ← Utility function tests
├── cv-parser/src/
│   └── index.test.ts            ← CV parser tests
├── email/src/
│   └── send.test.ts             ← Email retry logic & all email types
└── jobs-api/src/
    └── types.test.ts            ← API type validation tests
```

### E2E Tests (Playwright)

Located in the `tests/e2e/` directory:

```
tests/e2e/
├── auth.spec.ts          ← Authentication flow
├── landing.spec.ts       ← Landing page, navigation
├── chat.spec.ts          ← AI chat interface
├── jobs.spec.ts          ← Job search and listing
├── profile.spec.ts       ← User profile management
├── subscription.spec.ts  ← Stripe checkout flow
└── fixtures/
    ├── mock-jobs.ts      ← Test data
    └── mock-user.ts      ← Test user data
```

### Jest Configuration

The `jest.config.ts` at the repo root defines 6 test projects:

- **ai** — AI model routing, prompt management, rate limiting, tool schemas
- **stripe** — Pricing plans, subscription logic
- **cv-parser** — PDF parsing, data extraction
- **jobs-api** — API client, type validation
- **utils** — Utility functions (formatSalary, formatDate, truncate)
- **email** — Email sending, retry logic

## When to Run Tests

> **IMPORTANT:** Tests must be run after every large feature build.

### Before commits:
```bash
pnpm test          # Unit tests
pnpm run build     # Type-check + build
```

### Before PRs:
```bash
pnpm test          # Unit tests
pnpm run build     # Full build
pnpm test:e2e      # E2E tests (if touching UI)
```

### CI Pipeline

The GitHub Actions workflow (`.github/workflows/ci.yml`) runs automatically:

1. **On every push** to `main` or `develop`:
   - Lint & Type Check (full build)
   - Unit Tests with coverage

2. **On PRs to `main`**:
   - All of the above
   - E2E tests with Playwright

## Writing New Tests

### Unit Test Template

```typescript
import { myFunction } from "./my-module";

describe("myFunction", () => {
  it("should handle the happy path", () => {
    const result = myFunction("input");
    expect(result).toBe("expected");
  });

  it("should handle edge cases", () => {
    expect(myFunction("")).toBe("");
    expect(myFunction(null)).toBe(null);
  });

  it("should throw on invalid input", () => {
    expect(() => myFunction(-1)).toThrow();
  });
});
```

### E2E Test Template

```typescript
import { test, expect } from "@playwright/test";

test.describe("Feature Name", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/route");
  });

  test("renders key elements", async ({ page }) => {
    await expect(page.getByRole("heading")).toBeVisible();
  });

  test("handles user interaction", async ({ page }) => {
    await page.getByRole("button", { name: /submit/i }).click();
    await expect(page.getByText(/success/i)).toBeVisible();
  });
});
```

## Environment Variables for Tests

Unit tests don't require real API keys — they test business logic in isolation.

E2E tests need a running dev server with env vars set. Copy `.env.example` to `.env.local` and fill in values, or use the CI dummy values defined in `.github/workflows/ci.yml`.

## Current Test Suite Summary

**9 suites, 131 tests** — all passing.

| Project | Suite(s) | Tests | What's tested |
|---------|----------|-------|---------------|
| ai | model-router, prompts, rate-limit, tool-schemas | 56 | Model routing, prompt management, rate limiting, tool input schemas |
| stripe | plans | 8 | Pricing plans, plan lookup helpers |
| utils | helpers | 18 | formatSalary, formatDate, truncate |
| cv-parser | index | 8 | PDF parsing, data extraction, Zod schemas |
| email | send | 13 | Retry logic, error handling, all 3 email types |
| jobs-api | types | 7 | API client types, schema validation |

## Test Coverage Goals

| Package | Current | Target |
|---------|---------|--------|
| @repo/ai | ~70% | 80%+ |
| @repo/stripe | ~90% | 90%+ |
| @repo/utils | ~90% | 90%+ |
| @repo/cv-parser | ~50% | 70%+ |
| @repo/email | ~80% | 90%+ |
| E2E flows | 6 specs | 10+ specs |

## Known Test Notes

- **ts-jest** runs with `isolatedModules: true` and `diagnostics: false` to avoid OOM on deeply-nested AI SDK generics.
- Tests use `--experimental-vm-modules` flag for ESM support (required by ts-jest).
- The **email** suite uses `jest.useFakeTimers()` for most tests but switches to `jest.useRealTimers()` for error rejection tests (fake timers don't properly flush async rejection chains).
- The CI workflow allocates 4GB heap (`--max-old-space-size=4096`) for safety.
