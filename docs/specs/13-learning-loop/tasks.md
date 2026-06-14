# Tasks: 13 — Personalization & Continuous-Learning Loop (two-layer data contract)

> Status legend: `[ ]` pending • `[~]` in-progress • `[x]` done • `[-]` dropped

## Phase 1 — Two-layer data model + reconciliation core

- [ ] T01 — Create `user_feedback` table (append-only event log)
  - **Files:** `packages/db/src/schema/user-feedback.ts`; export from `packages/db/src/schema/index.ts`
  - **Acceptance:**
    - Table `user_feedback` uses house style: `integer("id").primaryKey().generatedAlwaysAsIdentity()`;
      `text("user_id").notNull().references(() => users.id, { onDelete: "cascade" })`;
      optional `jobId integer references jobs.id`; `kind` via
      `text("kind", { enum: ["score_dispute","suggestion_accepted","suggestion_rejected","artifact_edited","outcome_recorded"] }).notNull()`;
      `targetRef text` (artifact/machine-summary id); `value jsonb("value").$type<...>()`;
      `timestamp("created_at").notNull().defaultNow()`.
    - Index `user_feedback_user_created_idx` on `(userId, createdAt)`.
    - Exported and importable as `import { userFeedback } from "@ever-hust/db"`.
  - **Estimate:** 0.5 day

- [ ] T02 — Create `user_overrides` table (durable per-user preferences)
  - **Files:** `packages/db/src/schema/user-overrides.ts`; export from `packages/db/src/schema/index.ts`
  - **Acceptance:**
    - One row per user: `userId` FK with `onDelete: "cascade"`, `unique("user_overrides_user_unique")`.
    - `overrides jsonb("overrides").$type<UserOverrides>().default(...)` holding `version`,
      `weightOverrides`, `phrasingPrefs`, `alwaysRules`, `neverRules`.
    - `timestamp("created_at")` + `timestamp("updated_at")` both `.notNull().defaultNow()`.
    - Exported as `import { userOverrides } from "@ever-hust/db"`.
  - **Estimate:** 0.5 day

- [ ] T03 — Push schema to the database
  - **Files:** (no source) run `pnpm db:push` against `packages/db/drizzle.config.ts` (schema `./src/schema/index.ts`)
  - **Acceptance:**
    - `pnpm db:push` completes with no errors; `user_feedback` and `user_overrides` exist in the DB.
    - `pnpm db:studio` shows both tables with the expected columns/indexes.
  - **Estimate:** 0.5 day

- [ ] T04 — Reconciliation core (`reconcile.ts`) + `UserOverrides` Zod type
  - **Files:** `packages/ai/src/learning/reconcile.ts`
  - **Acceptance:**
    - Exports a Zod `UserOverrides` schema (versioned per #5) with `.min()/.max()`-clamped
      `weightOverrides` and `.max()`-bounded string arrays for phrasing/always/never rules.
    - Exports pure `reconcileOverrides(systemDefaults, userOverrides)` → user-wins merged result; no
      I/O, no DB access.
    - On version mismatch, applies a migration shim rather than throwing.
  - **Estimate:** 1 day

- [ ] T05 — Unit tests for schema typing + reconciliation (user-wins)
  - **Files:** `packages/ai/src/learning/reconcile.test.ts`; `packages/db/src/schema/user-overrides.test.ts`
  - **Acceptance:**
    - `reconcile.test.ts`: user override wins over a conflicting system default; empty overrides pass
      system defaults through unchanged; a simulated system-pack bump leaves the user-overrides input
      object unmutated (Layer-1 immutability).
    - Out-of-range weight override is clamped, not accepted raw.
    - `pnpm test -- --selectProjects ai` and `--selectProjects db` green.
  - **Estimate:** 0.5 day

## Phase 2 — Capture path (service + tool + API route)

- [ ] T06 — Feedback read/write service
  - **Files:** `packages/ai/src/learning/feedback-service.ts`
  - **Acceptance:**
    - `recordFeedback({ userId, kind, jobId?, targetRef?, value })` inserts one `user_feedback` row
      via `import { db } from "@ever-hust/db"`.
    - `getActiveOverrides(userId)` returns the user's `UserOverrides` (or an empty validated default
      if no row).
    - `proposeOverrideFromFeedback(userId, event)` returns a *proposed* override (with `confidence`)
      and does NOT write `user_overrides` (activation is a separate, explicit accept).
  - **Estimate:** 1 day

- [ ] T07 — `recordFeedback` orchestrator tool + barrel export
  - **Files:** `packages/ai/src/tools/record-feedback.ts`; export `recordFeedbackTool` from `packages/ai/src/tools/index.ts`
  - **Acceptance:**
    - `tool({ description, inputSchema: z.object({...}).max()-bounded, execute })` matching the
      existing 14-tool pattern; `userId` is NOT in the LLM-facing schema (injected server-side).
    - `inputSchema` enforces `.max()` on every string/array (Article 8.3); `kind` is an enum
      matching `user_feedback.kind`.
    - `execute` delegates to `feedback-service.recordFeedback` and returns a structured object
      (`{ recorded: true, kind, proposedOverride?: {...} }`).
  - **Estimate:** 1 day

- [ ] T08 — Register `recordFeedback` in the orchestrator + document in the system prompt
  - **Files:** `packages/ai/src/agents/orchestrator.ts` (add to the `tools: { ... }` map with
    server-side `userId`); `packages/ai/src/prompts.ts` (`getOrchestratorPrompt`, mirror in Langfuse
    `orchestrator-system`)
  - **Acceptance:**
    - `recordFeedback` appears in the `streamText` `tools` map, wrapping `execute` to inject
      `{ ...params, userId }` like `favoriteJob`/`savePreferences`.
    - `MAX_AI_STEPS_PER_TURN` / `stepCountIs(5)` unchanged.
    - System prompt lists the tool with when-to-use guidance (dispute a score, save an edit as style,
      record an outcome) and the human-in-the-loop note (propose, don't auto-apply).
  - **Estimate:** 0.5 day

- [ ] T09 — `POST /api/feedback` route + Zod body schema
  - **Files:** `apps/web/app/api/feedback/route.ts`; `feedbackBodySchema` in `apps/web/lib/api-schemas.ts`
  - **Acceptance:**
    - Route calls `requireSessionUser()`, then `applyRateLimit(userId, "authenticated")`.
    - Body validated by `feedbackBodySchema` (`.max()`-bounded); invalid → `apiBadRequest()`;
      failures → `apiError()` (from `apps/web/lib/api-response.ts`).
    - Persists via `feedback-service.recordFeedback`; never accepts a client-supplied `userId`.
  - **Estimate:** 1 day

- [ ] T10 — Unit tests: service, tool, route
  - **Files:** `packages/ai/src/learning/feedback-service.test.ts`; `packages/ai/src/tools/record-feedback.test.ts`; `apps/web/app/api/feedback/route.test.ts`
  - **Acceptance:**
    - Service test: a recorded event persists; `getActiveOverrides` returns empty default for a new
      user; `proposeOverrideFromFeedback` returns a proposal and writes NO override row.
    - Tool test: schema rejects oversized input and any LLM-supplied `userId`; `execute` returns the
      structured shape.
    - Route test: 401 without session; 400 on bad body; 200 + persisted on valid body; rate-limit tier
      applied.
    - `pnpm test -- --selectProjects ai` and `--selectProjects web-lib` green.
  - **Estimate:** 1 day

## Phase 3 — Application: wire overrides into evaluation (#3) + generation defaults

- [ ] T11 — Apply `weightOverrides` inside the #3 evaluator weight-merge
  - **Files:** `packages/ai/src/tools/evaluate-job.ts` (the #3 evaluator); reuse `packages/ai/src/learning/reconcile.ts` + `feedback-service.getActiveOverrides`
  - **Acceptance:**
    - The evaluator fetches `getActiveOverrides(userId)` and feeds `weightOverrides` into its existing
      merge order via `reconcileOverrides` (user wins over system-pack defaults).
    - When no override exists, the computed score is byte-for-byte identical to pre-epic behaviour.
    - #3's recommendation bands are unchanged.
  - **Estimate:** 1 day

- [ ] T12 — Apply phrasing prefs / always-never rules in generation tools
  - **Files:** `packages/ai/src/tools/generate-cover-letter.ts`; `packages/ai/src/tools/resume-builder.ts`; `packages/ai/src/tools/interview-prep.ts`
  - **Acceptance:**
    - Each tool reads `getActiveOverrides(userId)` and applies `phrasingPrefs` / `alwaysRules` /
      `neverRules` to the generation instruction via `reconcile.ts`.
    - #6 grounding/no-invent helpers run AFTER override application; overrides restyle only and cannot
      introduce ungrounded facts.
    - No-override path produces the current output.
  - **Estimate:** 1 day

- [ ] T13 — Integration test: override measurably changes next evaluation + generation
  - **Files:** `packages/ai/src/learning/apply-overrides.test.ts`
  - **Acceptance:**
    - For a fixed (user, job), a stored `weightOverride` produces a different (deterministic) score
      than the default; reverting the override restores the default score.
    - A stored phrasing pref demonstrably changes the generated draft's instruction/style; a grounded
      facts-only assertion confirms no new invented facts (Article 7).
    - `pnpm test -- --selectProjects ai` green.
  - **Estimate:** 1 day

## Phase 4 — UI affordances + canvas sync + E2E

- [ ] T14 — Feedback controls component (thumb / dispute / keep-my-edit)
  - **Files:** `apps/web/components/canvas/feedback-controls.tsx` (template: `apps/web/components/canvas/salary-insights-card.tsx`)
  - **Acceptance:**
    - Renders thumb-up / thumb-down + "dispute this score" + "keep my edit as my style", built with
      `@ever-hust/ui/button`, `@ever-hust/ui/badge`, `@ever-hust/ui/dialog`, `cn()` from
      `@ever-hust/ui/lib/utils`.
    - On action, POSTs to `/api/feedback`; shows a confirm/undo state; never auto-applies (the user
      must confirm to activate a proposed override).
    - Embeddable into the evaluation breakdown card and generated-artifact cards under
      `apps/web/components/canvas/`.
  - **Estimate:** 1 day

- [ ] T15 — Canvas sync: handle `recordFeedback`
  - **Files:** `apps/web/hooks/use-canvas-sync.ts`
  - **Acceptance:**
    - New `case "recordFeedback"` in `handleToolResult` surfaces the structured result (e.g. confirm
      toast / proposed-override prompt) and updates canvas state without overwriting jobs.
    - Unknown-tool default branch remains intact.
  - **Estimate:** 0.5 day

- [ ] T16 — Surface the funnel-proposed override accept affordance (#8 seam)
  - **Files:** `apps/web/components/canvas/feedback-controls.tsx` (accept variant); wire where #8 renders its insight under `apps/web/components/canvas/`
  - **Acceptance:**
    - When #8 supplies a score-floor proposal, an "accept this floor" control persists it as a
      `user_overrides` rule via `/api/feedback`.
    - If #8 is not yet merged, the affordance is absent / no-ops cleanly (no runtime error).
  - **Estimate:** 0.5 day

- [ ] T17 — Component test for feedback controls
  - **Files:** `apps/web/components/canvas/feedback-controls.test.tsx`
  - **Acceptance:**
    - Renders all affordances; clicking dispute opens the confirm flow; confirm fires a POST to
      `/api/feedback`; no network call fires before explicit confirm (human-in-the-loop).
    - `pnpm test -- --selectProjects web-lib` green.
  - **Estimate:** 0.5 day

- [ ] T18 — Playwright E2E: full dispute → re-evaluate → reflected loop
  - **Files:** `tests/e2e/learning-loop.spec.ts`
  - **Acceptance:**
    - Authenticated flow against `http://localhost:8443`: dispute a score, confirm; re-evaluate the
      same job and assert the override is reflected.
    - Edit a generated artifact, choose "keep my style", regenerate and assert the style pref is
      reflected.
    - `pnpm test:e2e` green for the new spec.
  - **Estimate:** 1 day

- [ ] T19 — Rollback flag + docs + competitor-clean self-check
  - **Files:** `packages/ai/src/agents/orchestrator.ts` (guard `recordFeedback` + override reads behind `LEARNING_LOOP_ENABLED`); `apps/web/.env.example` (document the flag); update `docs/specs/ROADMAP.md` progress
  - **Acceptance:**
    - With `LEARNING_LOOP_ENABLED` off, overrides are not read and behaviour matches pre-epic (proven
      by a toggled test).
    - `docs/specs/ROADMAP.md` epic-13 progress updated.
    - Grep of all changed files returns **zero competitor references** (Article 11) before commit.
  - **Estimate:** 0.5 day

## Notes

- Write tests alongside each implementation task; do not batch testing into a final task.
- Verify **zero competitor references** before every commit (see constitution Article 11).
- Human-in-the-loop (Article 4): the loop *proposes* overrides; activation requires an explicit user
  accept. Never auto-apply, auto-submit, or auto-send.
- Standalone-first (Article 2): no Gauzy coupling and no Ever Jobs API calls are introduced by this
  epic.
- Update `docs/specs/ROADMAP.md` progress when an epic's tasks complete.
