# Plan: 13 — Personalization & Continuous-Learning Loop (two-layer data contract)

| Field        | Value                              |
| ------------ | ---------------------------------- |
| Spec         | spec.md                            |
| Created      | 2026-06-14                         |
| Last updated | 2026-06-14                         |

## 1. Approach

The Learning Loop turns one-off user reactions — disputing a fit score, editing a generated
artifact, accepting or rejecting a suggestion, recording a real-world outcome — into durable,
per-user signal that measurably nudges the *next* evaluation and the *next* generation. It is a
backend-heavy epic: most of the value lives in two new tables, a small read/write service, and
the wiring that makes the evaluation engine (#3) and the generation tools read what the user has
told us. The user-facing surface is deliberately thin (a thumb / dispute affordance), because the
brand posture is human-in-the-loop, not magic.

The data model is two layers, exactly as the spec mandates. **Layer 1 — user data** is immutable
to any system update: `user_feedback` (an append-only event log of what the user did) and
`user_overrides` (the user's durable, distilled preferences — dimension-weight overrides, phrasing
preferences, and "always/never" rules). **Layer 2 — system content** (archetype packs, knowledge
packs, the rubric defaults that ship in #3) upgrades independently and never writes into Layer 1.
The single reconciliation rule is **user wins**: when a system pack default and a user override
disagree, the user override is applied. We implement this as a pure merge function with its own
unit suite, so the contract is enforced in code and not just by convention.

This epic depends hard on the **structured-output contract (#5)**: every captured feedback event
references a typed AI artifact (an evaluation's machine summary, a cover-letter machine summary),
and `user_overrides` is itself a versioned, Zod-validated object so a future system-pack bump can
read it safely. It also depends on the **evaluation engine (#3)**, whose scoring already merges a
weights object in a defined order — we insert the user's `weightOverrides` into that existing merge
step rather than re-architecting it. The **guardrails (#6)** stay in force: nothing the loop learns
may cause a generation tool to invent ungrounded facts; learned phrasing preferences only restyle,
never fabricate.

Capture happens at the existing approval gates, never silently. When a user disputes a score, edits
an artifact before approving it, or marks an application outcome, a write goes to `user_feedback`;
the loop then *proposes* an override (it does not auto-mutate the user's distilled preferences
without an explicit accept). The funnel (#8) is a second proposer: it surfaces "stop applying below
this score" and the user accepts it into `user_overrides`. Because Hust drafts and the user approves
(Constitution Article 4), an override only becomes active when the user opts in — the loop is
suggestive, not autonomous.

On the AI side we add a single new orchestrator tool, `recordFeedback`, following the exact pattern
of the existing 14 tools (`tool({ description, inputSchema: z.object().max()-bounded, execute })`,
`userId` injected server-side, structured object out). It is registered in the orchestrator's
`tools` map, exported from the tools barrel, and documented in the system prompt. The tool writes a
`user_feedback` row and returns a structured result the canvas can confirm. The reads — applying
overrides to a score and to a generation default — are done inside #3's evaluator and inside the
generation tools via a shared helper in `packages/ai`, so there is one code path for "apply this
user's learned preferences".

Personas/UI: a thumb-up / thumb-down + "dispute this score" affordance on the evaluation card and a
"keep my edit as my style" affordance on generated-artifact cards. These call a new authenticated,
rate-limited API route which persists via the feedback service. Canvas state is updated through the
existing `use-canvas-sync.ts` switch by adding a `case "recordFeedback"` so the chat-driven path and
the direct-UI path converge on the same structured result.

Standalone-first holds throughout: the only external dependency remains the Ever Jobs API, which
this epic does not call. No Gauzy coupling is introduced. Everything ships behind the normal
subscription gating already used by the orchestrator (`isSubscribed` / `users.subscriptionStatus`),
and the feature degrades to "no learned overrides" cleanly if the tables are empty.

## 2. Phases

### Phase 1 — Two-layer data model + reconciliation core

- Goal: Land the immutable user-data layer and the user-wins merge function, with no consumer
  wiring yet, so the contract is provable in isolation.
- Deliverables:
  - `packages/db/src/schema/user-feedback.ts` (`user_feedback` event log) and
    `packages/db/src/schema/user-overrides.ts` (`user_overrides` durable preferences), both
    exported from `packages/db/src/schema/index.ts`.
  - Schema pushed to the database via `pnpm db:push`.
  - A pure, versioned reconciliation helper `packages/ai/src/learning/reconcile.ts`
    (`reconcileOverrides(systemDefaults, userOverrides)` → user-wins merge) with a Zod-validated
    `UserOverrides` type that aligns with the #5 machine-summary versioning convention.
  - Unit tests for both schemas' typing and for `reconcile.ts` (user-wins, system-pack bump leaves
    user rows untouched, empty-overrides passthrough).
- Exit criteria: `pnpm db:push` succeeds; `pnpm test -- --selectProjects db` and
  `--selectProjects ai` green for the new files; reconciliation proven user-wins by tests.

### Phase 2 — Capture path (feedback service + `recordFeedback` tool + API route)

- Goal: Let the system record feedback events and propose overrides, through both the chat tool and
  a direct UI route, at the existing approval gates.
- Deliverables:
  - Feedback read/write service `packages/ai/src/learning/feedback-service.ts`
    (`recordFeedback`, `getActiveOverrides`, `proposeOverrideFromFeedback`).
  - New tool `packages/ai/src/tools/record-feedback.ts`, exported from
    `packages/ai/src/tools/index.ts`, registered in `packages/ai/src/agents/orchestrator.ts`
    (`userId` injected server-side), and documented in `packages/ai/src/prompts.ts`.
  - API route `apps/web/app/api/feedback/route.ts` (`requireSessionUser()`,
    `applyRateLimit(userId, "authenticated")`, Zod body from `apps/web/lib/api-schemas.ts`, errors
    via `apps/web/lib/api-response.ts`).
  - Unit tests for the service, the tool schema/execute, and the route handler.
- Exit criteria: a feedback event persists via both paths; an override is *proposed* (not
  auto-applied); tests green across `ai` and `web-lib` projects.

### Phase 3 — Application: wire overrides into evaluation (#3) + generation defaults

- Goal: Make a persisted override measurably change the next evaluation and the next generation for
  that user.
- Deliverables:
  - `getActiveOverrides(userId)` invoked inside #3's evaluator weight-merge step and inside the
    generation tools (`packages/ai/src/tools/generate-cover-letter.ts`,
    `resume-builder.ts`, `interview-prep.ts`) to apply phrasing prefs / always-never rules via the
    shared `reconcile.ts`.
  - A "user-wins" integration test proving that for a fixed (user, job) a stored `weightOverride`
    shifts the computed score versus the default, and a stored phrasing pref restyles a generated
    draft.
- Exit criteria: integration tests demonstrate measurable, deterministic change; guardrails
  (#6) unaffected (no new ungrounded output); CI green.

### Phase 4 — UI affordances + canvas sync + E2E

- Goal: Give the user the thumb / dispute / "keep my edit" affordances and confirm the full loop in
  a browser.
- Deliverables:
  - `apps/web/components/canvas/feedback-controls.tsx` (thumb up/down + dispute), embedded into the
    evaluation breakdown and generated-artifact cards under `apps/web/components/canvas/`.
  - `case "recordFeedback"` added to `apps/web/hooks/use-canvas-sync.ts`.
  - Funnel-proposed override accept affordance surfaced where #8 renders its insight.
  - Playwright spec `tests/e2e/learning-loop.spec.ts` covering dispute-a-score → persisted →
    re-evaluate reflects the override, and edit-artifact → "keep my style" → next draft reflects it.
- Exit criteria: `pnpm test:e2e` green for the new spec against `http://localhost:8443`; manual
  browser check of the dispute affordance; **zero competitor references** confirmed by grep.

## 3. Packages Touched

| Package                                                              | Change                                                                                                                                                                          |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/db/src/schema/user-feedback.ts`                           | **new** `user_feedback` table (append-only event log); export from `packages/db/src/schema/index.ts`                                                                            |
| `packages/db/src/schema/user-overrides.ts`                          | **new** `user_overrides` table (durable per-user preferences); export from `packages/db/src/schema/index.ts`                                                                    |
| `packages/db/src/schema/index.ts`                                   | add two `export { ... }` lines                                                                                                                                                  |
| `packages/ai/src/learning/reconcile.ts`                             | **new** pure user-wins merge + Zod `UserOverrides` type                                                                                                                         |
| `packages/ai/src/learning/feedback-service.ts`                      | **new** `recordFeedback` / `getActiveOverrides` / `proposeOverrideFromFeedback`                                                                                                 |
| `packages/ai/src/tools/record-feedback.ts`                          | **new** orchestrator tool (`tool({...})`, `userId` injected)                                                                                                                    |
| `packages/ai/src/tools/index.ts`                                    | export `recordFeedbackTool`                                                                                                                                                     |
| `packages/ai/src/agents/orchestrator.ts`                            | register `recordFeedback` in the `tools: { ... }` map with server-side `userId`                                                                                                 |
| `packages/ai/src/prompts.ts`                                        | document `recordFeedback` in `getOrchestratorPrompt` (mirror in Langfuse `orchestrator-system`)                                                                                 |
| `packages/ai/src/tools/generate-cover-letter.ts`, `resume-builder.ts`, `interview-prep.ts` | read `getActiveOverrides(userId)` and apply phrasing prefs via `reconcile.ts`                                                                  |
| `apps/web/app/api/feedback/route.ts`                                | **new** authenticated, rate-limited POST route persisting feedback                                                                                                              |
| `apps/web/lib/api-schemas.ts`                                       | add `feedbackBodySchema` (Zod, `.max()`-bounded)                                                                                                                                |
| `apps/web/hooks/use-canvas-sync.ts`                                 | add `case "recordFeedback"` to `handleToolResult`                                                                                                                               |
| `apps/web/components/canvas/feedback-controls.tsx`                  | **new** thumb / dispute / "keep my edit" component (template: `salary-insights-card.tsx`)                                                                                        |
| `packages/jobs-api`                                                 | (no change) — Ever Jobs API is not called by this epic                                                                                                                          |
| `packages/ui`                                                       | (no new component) — reuse `@ever-hust/ui/button`, `badge`, `dialog`, `cn`                                                                                                       |
| `tests/e2e/learning-loop.spec.ts`                                  | **new** Playwright spec for the full dispute → re-evaluate loop                                                                                                                 |

## 4. Dependencies

| Library                | Version  | Rationale                                                                                       |
| ---------------------- | -------- | ---------------------------------------------------------------------------------------------- |
| `drizzle-orm`          | existing | already the ORM; new tables use the house style (no new dep)                                    |
| `zod`                  | existing | `UserOverrides` schema + tool input + API body validation; no new dep                           |
| `ai` (Vercel AI SDK)   | existing | `tool({...})` for `recordFeedback`; no new dep                                                  |

No new direct dependencies. Upstream **epic** dependencies (not libraries):

- **#5 structured-output** — the machine-summary contract a feedback event references; `UserOverrides`
  follows its versioning convention. Hard prerequisite.
- **#3 evaluation engine** — owns the `evaluations` record and the weight-merge step the loop hooks
  into. Hard prerequisite for Phase 3.
- **#6 guardrails** — grounding/no-invent helpers stay authoritative over any learned phrasing.
- **#8 funnel analytics** — a *proposer* of overrides (score-floor); soft dependency for one Phase 4
  affordance, which no-ops gracefully if #8 is not yet merged.

## 5. Risks & Mitigations

| Risk                                                                                  | Likelihood | Impact | Mitigation                                                                                                          |
| ------------------------------------------------------------------------------------- | ---------- | ------ | ----------------------------------------------------------------------------------------------------------------- |
| A system-pack upgrade silently overwrites a user override (breaks the two-layer rule) | M          | H      | `reconcile.ts` is pure, user-wins, and gated by unit tests asserting Layer-1 rows are never mutated by Layer-2     |
| Learned phrasing preference pushes a generation tool to invent ungrounded facts       | L          | H      | Overrides only restyle; #6 grounding helpers run after override application; integration test asserts no new facts  |
| Loop auto-applies an override without user approval (violates human-in-the-loop)       | L          | H      | Service only *proposes*; activation requires an explicit user accept via the API route; tested                     |
| `user_feedback` grows unbounded (append-only log)                                      | M          | M      | Index on `(userId, createdAt)`; reads are bounded/limited; a later Trigger.dev compaction task can summarise        |
| Weight override skews scores so far they mislead the user                              | L          | M      | Clamp override weights in `UserOverrides` Zod schema (`.min()/.max()`); recommendation bands from #3 unchanged      |
| Override JSON shape drifts as #5 contract evolves                                      | M          | M      | Version field on `UserOverrides`; reconcile reads version and applies a migration shim; unit-tested                 |

## 6. Rollback Plan

The feature is additive and read-gated. To disable without data loss:

1. Unregister `recordFeedback` from the `tools` map in `packages/ai/src/agents/orchestrator.ts` and
   stop calling `getActiveOverrides` in the evaluator / generation tools (guard with an env flag,
   e.g. `LEARNING_LOOP_ENABLED`, defaulting off if rollback is needed). With overrides not read, the
   product reverts to system-pack defaults — identical to pre-epic behaviour.
2. Hide `feedback-controls.tsx` from the canvas cards and remove the `case "recordFeedback"` no-ops
   safely (unknown tool results are already ignored by `use-canvas-sync.ts`).
3. The `user_feedback` / `user_overrides` tables are left in place (no destructive drop) — user data
   is never deleted on rollback, honouring the immutable-user-data contract. Re-enabling re-reads the
   same rows.

## 7. Migration Plan

- **New tables only** — no change to existing columns; `users.preferences` handling is *extended*,
  not replaced (existing onboarding `savePreferences` continues to write `users.preferences`; the
  loop reads `user_overrides` *in addition*).
- Existing users start with empty `user_feedback` / `user_overrides`; `getActiveOverrides` returns an
  empty override set, and `reconcile.ts` passes system defaults through unchanged — so day-one
  behaviour for everyone is exactly current behaviour.
- No backfill is required. The first time a user disputes/edits, rows are created lazily.
- `pnpm db:push` applies the schema (push-based; no hand-written SQL migration needed for the
  additive tables).

## 8. Open Questions for Plan

- Should `proposeOverrideFromFeedback` require N corroborating events before proposing a durable
  override (debounce noise), or propose on the first signal? (Lean: propose on first, but mark
  `confidence`; let the user accept.)
- Where exactly does #8's score-floor proposal render — inside the funnel card or as a chat nudge?
  (Resolve with #8's plan; Phase 4 affordance no-ops until then.)
- Do we expose a "reset my learned preferences" control now, or defer to a settings epic?
- Should `user_overrides` be one row per user (single JSON) or one row per override kind? (Lean:
  single row, versioned JSON `$type<UserOverrides>()` — simplest user-wins reconciliation.)
