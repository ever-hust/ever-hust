# Tasks: 17 — Recruiter / LinkedIn Outreach (draft-only)

> Status legend: `[ ]` pending • `[~]` in-progress • `[x]` done • `[-]` dropped

## Phase 1 — Structured contract + persistence

- [ ] T01 — Define the `outreach` structured artifact (Zod machine summary)
  - **Files:** `packages/ai/src/structured/schemas/outreach.ts` (new); export from
    `packages/ai/src/structured/index.ts`
  - **Acceptance:**
    - `outreachArtifact` defined via `defineArtifact` from `packages/ai/src/structured/contract.ts`
      (same pattern as `schemas/evaluation.ts`).
    - Summary captures: `contactType` enum (`connection_note | follow_up | referral_ask`),
      `targetRole` (`.max()` string), `targetCompany` (`.max()` string), framework object
      `{ hook, credibility, ask }` each a bounded string, `groundedSources` and `usedFacts` arrays
      (`.max()`-bounded), and an `OUTREACH_SCHEMA_VERSION` constant.
    - All strings/arrays carry `.max()` bounds (Article 8.3); types exported from `index.ts`.
  - **Estimate:** 0.5 day

- [ ] T02 — Unit test the `outreach` artifact schema
  - **Files:** `packages/ai/src/structured/schemas/outreach.test.ts` (new)
  - **Acceptance:**
    - Valid artifact parses; missing/oversized framework lines reject.
    - Invalid `contactType` rejects; `usedFacts`/`groundedSources` over `.max()` reject.
    - `assertArtifact(outreachArtifact, ...)` round-trips a valid object.
    - `pnpm test -- --selectProjects ai` green for this file.
  - **Estimate:** 0.5 day

- [ ] T03 — Add `outreachDrafts` table + export
  - **Files:** `packages/db/src/schema/outreach.ts` (new); export from
    `packages/db/src/schema/index.ts`
  - **Acceptance:**
    - `outreachDrafts` follows house style: `integer("id").primaryKey().generatedAlwaysAsIdentity()`;
      `userId` text FK → `users.id` `onDelete: "cascade"`; optional `jobId` integer FK → `jobs.id`;
      `contactType` text enum `.notNull()`; jsonb `framework`/`summary` `$type<>()` mirroring the
      T01 artifact; `created_at`/`updated_at` `defaultNow()`.
    - Indexes `outreach_drafts_user_id_idx` and `outreach_drafts_user_job_idx` via `(table) => [...]`.
    - Exported from `schema/index.ts`; `packages/db` type-checks.
  - **Estimate:** 0.5 day

- [ ] T04 — Push schema + unit-test table types
  - **Files:** `packages/db/src/schema/outreach.test.ts` (new); run `pnpm db:push`
  - **Acceptance:**
    - `pnpm db:push` applies the `outreach_drafts` table with no diff/error.
    - Test asserts column set, enum values, FK/cascade config, and index names.
    - `pnpm test -- --selectProjects db` green.
  - **Estimate:** 0.5 day

## Phase 2 — `outreachDraft` tool + orchestrator wiring

- [ ] T05 — Implement the `outreachDraft` tool (grounded, draft-only)
  - **Files:** `packages/ai/src/tools/outreach-draft.ts` (new)
  - **Acceptance:**
    - `tool({ description, inputSchema, execute })` with inputs `jobId?: number`,
      `companyName?: string` (`.max(200)`), `contactType` enum, optional `tone`/`focusAreas`
      (`.max()`-bounded); `userId` is **optional/server-injected**, never LLM-driven (mirrors
      `generate-cover-letter.ts`).
    - `execute` reads the user profile + the `jobs` row via `import { db } from "@ever-hust/db"`,
      computes matching skills, and returns a grounded context object + an `instruction` that
      enforces the hook→credibility→ask framework and **forbids invented facts/placeholders**
      (Article 7).
    - Returns a Zod-validated `outreach` artifact (via `runValidatedGeneration`/`assertArtifact`)
      alongside prose context (Article 5).
    - Output is draft-only: no send/connect/submit code path; on missing user/job returns a safe
      `{ error }` object like the sibling tools.
  - **Estimate:** 1 day

- [ ] T06 — Persist generated drafts to `outreachDrafts`
  - **Files:** `packages/ai/src/tools/outreach-draft.ts` (extend T05)
  - **Acceptance:**
    - On a successful draft, inserts one row into `outreachDrafts` with `userId`, optional `jobId`,
      `contactType`, `framework`, and the validated `summary`.
    - Insert failure is caught and does not break the chat turn (logs + returns the draft anyway).
    - Covered by a unit test (see T08).
  - **Estimate:** 0.5 day

- [ ] T07 — Export + register the tool in the orchestrator (server-side `userId`)
  - **Files:** `packages/ai/src/tools/index.ts`; `packages/ai/src/agents/orchestrator.ts`
  - **Acceptance:**
    - `outreachDraftTool` exported from `tools/index.ts`.
    - Added to the `tools: { ... }` object in `createOrchestratorStream` with the
      `{ ...params, userId }` server-injection wrapper (same as `generateCoverLetter`/`applyJob`).
    - `userId` never appears as an LLM-supplied param; `stopWhen stepCountIs(5)` unchanged.
    - `pnpm check-types` green; orchestrator test (if present) lists the new tool.
  - **Estimate:** 0.5 day

- [ ] T08 — Unit test the `outreachDraft` tool
  - **Files:** `packages/ai/src/tools/outreach-draft.test.ts` (new)
  - **Acceptance:**
    - Asserts the returned context contains only grounded fields (no fabricated name/connection),
      that `instruction` requests the 3-line framework and forbids placeholders.
    - Asserts the emitted artifact validates against the T01 schema and `contactType` is echoed.
    - Asserts a `outreachDrafts` insert is attempted (db mocked) and a draft is still returned if
      the insert throws.
    - `pnpm test -- --selectProjects ai` green.
  - **Estimate:** 0.5 day

- [ ] T09 — Document the tool in the system prompt
  - **Files:** `packages/ai/src/prompts.ts` (`DEFAULT_ORCHESTRATOR_PROMPT`); note the same edit for
    the Langfuse `orchestrator-system` production prompt
  - **Acceptance:**
    - New `## Outreach Drafts` section: lists `outreachDraft` under capabilities, states the
      hook→credibility→ask framework, the **draft-only / HITL** rule (Hust sends nothing; user
      copies), and instructs the agent to confirm role/company/contact-type before drafting.
    - `packages/ai/src/prompts.test.ts` updated/green asserting the section/tool name is present.
  - **Estimate:** 0.5 day

- [ ] T10 — (Conditional) Add `checkOutreachLimit` gate
  - **Files:** `packages/ai/src/rate-limit.ts`; wrapper in `packages/ai/src/agents/orchestrator.ts`
  - **Acceptance:**
    - If gated (per plan Open Question 1), add `checkOutreachLimit(userId)` mirroring
      `checkCoverLetterLimit`; orchestrator wrapper returns an upgrade-style `{ error, requiresUpgrade }`
      when over-limit for non-subscribed users.
    - Unit test in `packages/ai/src/rate-limit.test.ts` covers allow/deny.
    - Drop this task (`[-]`) if the decision is ungated free-tier.
  - **Estimate:** 0.5 day

## Phase 3 — Canvas surface, read API, copy-to-send, E2E

- [ ] T11 — Add canvas-sync case for the outreach draft
  - **Files:** `apps/web/hooks/use-canvas-sync.ts`
  - **Acceptance:**
    - `CanvasState` gains `outreachDraft: OutreachDraftData | null`.
    - `handleToolResult` gets `case "outreachDraft"` that sets the draft into state (guarding on a
      valid framework, like the `salaryInsights` case).
    - A `clearOutreachDraft` callback is exported alongside `clearSalaryInsights`.
  - **Estimate:** 0.5 day

- [ ] T12 — Build the outreach draft canvas card (copy-to-send, no Send)
  - **Files:** `apps/web/components/canvas/outreach-draft-card.tsx` (new); wire into
    `apps/web/app/(dashboard)/chat/page.tsx`
  - **Acceptance:**
    - Modelled on `salary-insights-card.tsx`: `@ever-hust/ui/card` + `@ever-hust/ui/button` +
      `cn()`; renders the three framework lines (hook/credibility/ask) and target role/company.
    - A **Copy to clipboard** button copies the assembled message; shows copied confirmation.
    - **No Send/Connect control exists** (Article 4); card has a close/clear affordance.
    - Rendered on the canvas when `outreachDraft` is set.
  - **Estimate:** 1 day

- [ ] T13 — Read API route for saved drafts
  - **Files:** `apps/web/app/api/outreach/route.ts` (new); Zod in `apps/web/lib/api-schemas.ts`;
    uses `apps/web/lib/api-response.ts`
  - **Acceptance:**
    - GET-only: `requireSessionUser()`, `applyRateLimit(userId, "authenticated")`, returns the
      caller's `outreachDrafts` rows (scoped by `userId`); invalid query → `apiBadRequest()`.
    - **No POST/PUT send or submit handler** anywhere in the route.
    - Default cache-control headers applied per the route pattern.
  - **Estimate:** 0.5 day

- [ ] T14 — Unit test route + schema
  - **Files:** `apps/web/lib/api-schemas.test.ts` (extend); `apps/web/app/api/outreach/route.test.ts`
    (new, `web-lib` project)
  - **Acceptance:**
    - Zod query schema accepts valid params, rejects malformed ones.
    - Route returns 401 unauthenticated, scopes results to the session user, and exposes no
      send/submit verb.
    - `pnpm test -- --selectProjects web-lib` green.
  - **Estimate:** 0.5 day

- [ ] T15 — Playwright E2E: draft → card → copy, HITL assertion
  - **Files:** `tests/e2e/outreach.spec.ts` (new)
  - **Acceptance:**
    - Unauthenticated `/chat` access redirects to login (route protection, like `chat.spec.ts`).
    - Authenticated flow: asking for an outreach draft renders the outreach card with the three
      framework lines and a working **Copy** affordance.
    - **Asserts no auto-send/connect control is present** on the card (the structural HITL gate).
    - `pnpm test:e2e` green.
  - **Estimate:** 1 day

- [ ] T16 — Full CI green + roadmap update
  - **Files:** `docs/specs/ROADMAP.md` (progress); run `pnpm lint && pnpm check-types && pnpm test && pnpm test:e2e`
  - **Acceptance:**
    - `pnpm lint` (eslint `--max-warnings 0`), `pnpm check-types`, `pnpm test`, `pnpm test:e2e` all green.
    - Competitor-name grep over the diff is empty (Article 11).
    - `docs/specs/ROADMAP.md` marks epic 17 progress.
  - **Estimate:** 0.5 day

## Notes

- Write tests alongside each implementation task; do not batch testing into a final task.
- Verify **zero competitor references** before every commit (see constitution Article 11).
- Draft-only / HITL is structural: there is **no** send/connect/submit code path in any task here.
- `userId` is always server-injected by the orchestrator — never an LLM-supplied tool param.
- Update `docs/specs/ROADMAP.md` progress when an epic's tasks complete.
