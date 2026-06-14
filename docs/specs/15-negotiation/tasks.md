# Tasks: 15 — Negotiation Brief

> Status legend: `[ ]` pending • `[~]` in-progress • `[x]` done • `[-]` dropped

## Phase 1 — Comp-range math + artifact contract

- [ ] T01 — Extract a db-free `compRange()` comp-range helper (+ unit test)
  - **Files:** `packages/ai/src/tools/negotiation-helpers.ts`, `packages/ai/src/tools/negotiation-helpers.test.ts` (reuse `annualise`/`median` from `packages/ai/src/tools/salary-helpers.ts`)
  - **Acceptance:**
    - `compRange(rows, { jobTitle, location, jobLevel })` returns `{ low, mid, high, p25, p75, currency, sampleSize }` plus a `basis` `{ jobTitle, location, jobLevel, sampleSize }` for citation.
    - Pure / no DB import — operates on an array of `{ salaryMin, salaryMax, salaryInterval, salaryCurrency }`-shaped rows.
    - Empty or sub-threshold (`< 5`) sample returns `range: null` with an honest `basis.sampleSize`; **never** synthesises a figure.
    - Tests cover: fixture sample → expected median/p25/p75; mixed intervals annualised correctly; empty array → `range: null`.
    - `pnpm test -- --selectProjects ai` passes for the new file.
  - **Estimate:** 1 day

- [ ] T02 — Define the `negotiationBrief` Zod artifact + schema-version (+ unit test)
  - **Files:** `packages/ai/src/structured/schemas/negotiation.ts`, `packages/ai/src/structured/schemas/negotiation.test.ts`, export added to `packages/ai/src/structured/index.ts`
  - **Acceptance:**
    - `NEGOTIATION_SCHEMA_VERSION = 1`; `negotiationArtifact = defineArtifact(...)` mirroring the `evaluation` artifact pattern.
    - Summary schema includes: `targetRange` (`{ low, mid, high, currency } | null`), `basis` (sample size + filters that produced the range), `budgetFit` (reuse `budgetFitSchema` from the evaluation schema), `scripts` (array of `{ kind: "counter" | "competing_offer" | "non_comp_ask", title, body }`), `checklist` (string array), `caveat` (string).
    - All strings/arrays `.max()`-bounded (Article 8.3).
    - Tests: a valid object passes `assertArtifact`; a missing-field / oversize object throws `ArtifactValidationError`.
    - `pnpm test -- --selectProjects ai` passes.
  - **Estimate:** 0.5 day

## Phase 2 — `negotiationCoach` tool + persistence

- [ ] T03 — Add `negotiationBriefs` table + export + `db:push`
  - **Files:** `packages/db/src/schema/negotiation-briefs.ts`, export in `packages/db/src/schema/index.ts`
  - **Acceptance:**
    - Table follows house style: `integer("id").primaryKey().generatedAlwaysAsIdentity()`; `userId text` → `users.id` `onDelete: "cascade"`; `jobId integer` → `jobs.id` `onDelete: "cascade"`; `targetRange`/`scripts`/`checklist`/`basis` as `jsonb().$type<...>()`; `budgetFit` via `text(..., { enum: [...] })`; `schemaVersion integer().default(1)`; `createdAt`/`updatedAt timestamp().defaultNow()`.
    - `unique("negotiation_briefs_user_job_unique").on(userId, jobId)` + `index` on `userId` and `(userId, jobId)` (mirrors `evaluations`).
    - DX interface comment notes it mirrors the `@ever-hust/ai` `negotiationBrief` artifact and that `@ever-hust/db` must not import `@ever-hust/ai`.
    - `pnpm db:push` applies cleanly; `pnpm test -- --selectProjects db` green.
  - **Estimate:** 0.5 day

- [ ] T04 — Implement the `negotiationCoach` tool (Pro-gated, cited, grounded) (+ unit test)
  - **Files:** `packages/ai/src/tools/negotiation-coach.ts`, `packages/ai/src/tools/__tests__/negotiation-coach.test.ts`
  - **Acceptance:**
    - `tool({ description, inputSchema, execute })` with `inputSchema` = `userId` (optional; server-injected — never trusted from the LLM), `jobId: z.number()`, `offerAmount: z.number().optional()`, `userLevel: z.string().max(50).optional()`, `competingOffer: z.boolean().optional()`; all strings `.max()`-bounded.
    - Loads job (`jobs`) + user (`users`) like `interview-prep.ts`; Pro-gate: non-`active`/`past_due` returns `{ error, requiresUpgrade: true }`.
    - Computes the range by querying `jobs` for matching titles/level/location and passing rows to `compRange()`; reads `evaluations.blocks.compDemand` for this `(userId, jobId)` when present to set `budgetFit`/anchor; falls back to `"unknown"` if no evaluation.
    - Returns structured script context + an `instruction` block (draft-from-grounded-context, like `interview-prep.ts`), the validated `negotiationBrief` artifact (built then `assertArtifact`-checked), and persists/upserts the brief into `negotiationBriefs`.
    - No outbound/send path of any kind (human-in-the-loop, Article 4).
    - Tests cover: free-tier → `requiresUpgrade`; happy path → cited range with `basis.sampleSize > 0`; thin sample → `targetRange: null` + honest basis (no invented number); artifact present + valid; job-not-found path.
    - `pnpm test -- --selectProjects ai` green.
  - **Estimate:** 1 day

- [ ] T05 — Export + register the tool in the orchestrator
  - **Files:** `packages/ai/src/tools/index.ts`, `packages/ai/src/agents/orchestrator.ts`
  - **Acceptance:**
    - `export { negotiationCoachTool } from "./negotiation-coach";` added to the tools barrel.
    - Registered as `negotiationCoach` inside the `tools: { ... }` object in `createOrchestratorStream`, injecting `userId` server-side (the `{ ...params, userId }` wrapper pattern), within the existing `stepCountIs(5)` budget.
    - `pnpm test -- --selectProjects ai` (incl. `orchestrator.test.ts`) green; type-check clean.
  - **Estimate:** 0.5 day

- [ ] T06 — Document `negotiationCoach` in the system prompt (+ prompts test)
  - **Files:** `packages/ai/src/prompts.ts`, `packages/ai/src/prompts.test.ts` (mirror update to Langfuse `orchestrator-system` is operational, noted in the file)
  - **Acceptance:**
    - `DEFAULT_ORCHESTRATOR_PROMPT` adds `negotiationCoach` to the capabilities list and a "## Negotiation" section: call at the offer stage, present the cited range + scripts + checklist, state figures trace to market data, **never invent a figure**, and that Hust drafts only — the user sends nothing.
    - Prompt explicitly notes Pro-only gating + the "not legal advice" caveat.
    - `prompts.test.ts` asserts the prompt text contains `negotiationCoach`.
    - `pnpm test -- --selectProjects ai` green.
  - **Estimate:** 0.5 day

## Phase 3 — Canvas + offer-stage UI

- [ ] T07 — Build the `NegotiationBriefCard` canvas component
  - **Files:** `apps/web/components/canvas/negotiation-brief-card.tsx`
  - **Acceptance:**
    - Exports `NegotiationBriefData` (matching the tool result shape) + `NegotiationBriefCard`, modelled on `salary-insights-card.tsx` (range bar, stat boxes, collapsible `Section`s) using `@ever-hust/ui/{card,badge,button}` + `cn()`.
    - Renders the cited `targetRange` with its `basis` (sample size shown), `budgetFit` badge, script blocks with copy-to-clipboard, the checklist, and the "not legal advice" caveat.
    - Thin-sample / `targetRange: null` path renders an honest "not enough market data" state instead of a number.
    - No "send"/"submit"/"auto-negotiate" affordance anywhere in the component.
  - **Estimate:** 1 day

- [ ] T08 — Wire the canvas-sync case + brief state
  - **Files:** `apps/web/hooks/use-canvas-sync.ts`
  - **Acceptance:**
    - `CanvasState` gains `negotiationBrief: NegotiationBriefData | null`; `case "negotiationCoach"` in `handleToolResult` sets it (guarded on a present/valid result, mirroring the `salaryInsights` case).
    - `clearNegotiationBrief` callback added and returned from the hook.
    - Type-check clean; existing canvas-sync behaviour unchanged.
  - **Estimate:** 0.5 day

- [ ] T09 — Read API for stored briefs (+ unit test)
  - **Files:** `apps/web/app/api/user/negotiation-brief/route.ts`, Zod query schema in `apps/web/lib/api-schemas.ts`, test `apps/web/lib/api-schemas.test.ts` (extend) or route-level lib test under `web-lib`
  - **Acceptance:**
    - `GET ?jobId=` returns the stored `negotiationBriefs` row for the session user; `requireSessionUser()` + `applyRateLimit(userId, "authenticated")`; query validated with Zod; errors via `apiBadRequest()`/`apiError()`.
    - Returns a clean empty/404 shape when no brief exists (UI degrades gracefully).
    - Default `Cache-Control: private, no-store` headers (repo convention).
    - Test asserts the query schema rejects a missing/non-numeric `jobId`.
    - `pnpm test -- --selectProjects web-lib` green.
  - **Estimate:** 0.5 day

- [ ] T10 — Offer-stage panel on the applications detail
  - **Files:** `apps/web/app/(dashboard)/applications/page.tsx`
  - **Acceptance:**
    - For an application at the `offer` stage (Kanban), the detail shows a "Negotiation Brief" panel that fetches the stored brief via `/api/user/negotiation-brief?jobId=` and renders `NegotiationBriefCard`.
    - When no brief exists, the panel shows a prompt to ask the assistant in chat (deep-links to the chat) — no figure is fabricated.
    - Scripts are copyable; no send/auto-apply control is present.
    - Lint + type-check clean.
  - **Estimate:** 1 day

- [ ] T11 — Playwright E2E for the offer-stage negotiation flow
  - **Files:** `tests/e2e/negotiation.spec.ts`
  - **Acceptance:**
    - Drives an authenticated user to an `offer`-stage application; asserts a cited target range, at least one script block, and the checklist render.
    - Asserts figures are present with a sample-size/basis indicator (traceable to market data).
    - Asserts there is **no** send / submit / auto-negotiate affordance in the offer-stage UI (human-in-the-loop).
    - `pnpm test:e2e` green against `http://localhost:8443`.
  - **Estimate:** 1 day

## Notes

- Write tests alongside each implementation task; do not batch testing into a final task.
- Verify **zero competitor references** before every commit (see constitution Article 11).
- Standalone-first: the only external dependency is the Ever Jobs API (`packages/jobs-api`); no Gauzy seam is touched in this epic.
- Grounded / no-invent: every surfaced figure must trace to `compRange().basis`; thin/empty samples degrade honestly to `null`, never a fabricated number.
- Update `docs/specs/ROADMAP.md` progress when an epic's tasks complete.
