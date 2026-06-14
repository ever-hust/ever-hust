# Tasks: 14 — Writing-Style Personalization

> Status legend: `[ ]` pending • `[~]` in-progress • `[x]` done • `[-]` dropped

## Phase 1 — Descriptor contract & schema

- [ ] T01 — Define the privacy-safe style-descriptor schema + structured artifact (#5)
  - **Files:** `packages/ai/src/structured/schemas/writing-style.ts`, `packages/ai/src/structured/schemas/writing-style.test.ts`
  - **Acceptance:**
    - Exports `writingStyleSummarySchema` (Zod): `formality`/`warmth`/`hedging` numbers 0–1,
      `avgSentenceLen` enum `short|medium|long`, `jargonLevel` enum `low|medium|high`,
      `usesMetrics` boolean, `structurePref` enum `bullet|paragraph|mixed`; every string
      `.max()`-bounded (Article 8.3).
    - Exports `Artifact<"writing_style", WritingStyleSummary>` via `defineArtifact("writing_style", 1, schema)` from #5; `schemaVersion = 1`.
    - Schema contains **no free-form text field** capable of holding a raw sample.
    - Unit test: valid descriptor object parses; out-of-range number (e.g. `formality: 2`) and an unexpected `rawSample` key both reject.
  - **Estimate:** 0.5 day

- [ ] T02 — Add `style_fingerprints` table and push it
  - **Files:** `packages/db/src/schema/style-fingerprints.ts`, `packages/db/src/schema/index.ts`
  - **Acceptance:**
    - Table `style_fingerprints`: `id integer().primaryKey().generatedAlwaysAsIdentity()`,
      `userId text().notNull().references(() => users.id, { onDelete: "cascade" })`,
      `descriptors jsonb().$type<WritingStyleSummary>()`, `schemaVersion integer().notNull().default(1)`,
      `sampleCount integer().notNull().default(0)`, `confidence` numeric/real,
      `createdAt`/`updatedAt timestamp().notNull().defaultNow()`; unique index on `userId`
      (one current fingerprint per user); index `style_fingerprints_user_id_idx`.
    - **No raw-text column** exists on the table (privacy invariant, spec §1/§3).
    - Exported from `packages/db/src/schema/index.ts`.
    - `pnpm db:push` applies cleanly against the dev database.
  - **Estimate:** 0.5 day

## Phase 2 — Extraction & capture (no raw text retained)

- [ ] T03 — Implement deterministic + LLM descriptor extractor
  - **Files:** `packages/ai/src/writing-style/extract.ts`, `packages/ai/src/writing-style/extract.test.ts`
  - **Acceptance:**
    - `extractStyleDescriptors(text: string)` returns a `WritingStyleSummary` only — never the input text.
    - Deterministic features (avg sentence length → enum bucket, bullet ratio → `structurePref`, hedging-marker count → `hedging`, metric/number presence → `usesMetrics`) computed in plain TS.
    - Tone fields (`formality`, `warmth`, `jargonLevel`) via a bounded `generateObject({ schema })` pass with a deterministic fallback.
    - Privacy invariant test: for a sample input, **no contiguous ≥8-char substring of the input appears anywhere in `JSON.stringify(output)`**.
    - Output round-trips through `writingStyleSummarySchema.parse()`.
  - **Estimate:** 1 day

- [ ] T04 — Implement fingerprint merge (EMA fold)
  - **Files:** `packages/ai/src/writing-style/merge.ts`, `packages/ai/src/writing-style/merge.test.ts`
  - **Acceptance:**
    - `mergeFingerprint(existing | null, incoming, sampleCount)` returns the new descriptors + incremented `sampleCount`.
    - Numeric descriptors fold via EMA; enum/boolean descriptors take the most-recent-weighted value.
    - First call (no existing) returns `incoming` with `sampleCount = 1`.
    - Unit test: repeated folds of a stable input converge toward that input; a single outlier does not flip a stabilised fingerprint.
  - **Estimate:** 0.5 day

- [ ] T05 — Add `updateWritingStyle` tool (capture on approve/edit, #13 hook)
  - **Files:** `packages/ai/src/tools/update-writing-style.ts`, `packages/ai/src/tools/update-writing-style.test.ts`
  - **Acceptance:**
    - `tool({ description, inputSchema, execute })`; `inputSchema` accepts the approved artifact text (`.max()`-bounded) and an `artifactKind`; `userId` is `.optional()` and injected server-side, never LLM-supplied.
    - `execute` runs `extractStyleDescriptors` → `mergeFingerprint` (reads existing row) → validates via `assertArtifact` (#5) → upserts the `style_fingerprints` row via `db` from `@ever-hust/db`.
    - Returns descriptors-only structured result (kind `"updateWritingStyle"`); never returns raw text.
    - Unit test: missing `userId` returns a not-authenticated result; a valid call upserts a row and the stored row contains no raw input text.
  - **Estimate:** 1 day

- [ ] T06 — Export + register the tool in the orchestrator
  - **Files:** `packages/ai/src/tools/index.ts`, `packages/ai/src/agents/orchestrator.ts`, `packages/ai/src/agents/orchestrator.test.ts`
  - **Acceptance:**
    - `updateWritingStyleTool` exported from `packages/ai/src/tools/index.ts`.
    - Registered in the `tools: { ... }` object inside `createOrchestratorStream`'s `streamText` with the userId-injection wrapper (matching `savePreferences`/`favoriteJob`).
    - `stopWhen: stepCountIs(5)` unchanged.
    - Orchestrator test asserts `updateWritingStyle` is present in the tool set and that `userId` is injected, not accepted from the model.
  - **Estimate:** 0.5 day

## Phase 3 — Application to generation (#10 / #17)

- [ ] T07 — Build the style-guidance + load helpers
  - **Files:** `packages/ai/src/writing-style/guidance.ts`, `packages/ai/src/writing-style/load.ts`, `packages/ai/src/writing-style/guidance.test.ts`
  - **Acceptance:**
    - `loadWritingStyle(userId)` reads the user's `style_fingerprints` row (or `null`).
    - `buildStyleGuidance(summary)` returns a compact **tone-only** instruction string (e.g. "short sentences; moderate formality; quantify with metrics where supported") — contains no content claims and no raw text.
    - Low-confidence fingerprints (small `sampleCount`) produce a softer guidance string.
    - Unit test: `null` summary yields empty guidance (no behaviour change); a populated summary yields a deterministic, descriptor-derived string.
  - **Estimate:** 0.5 day

- [ ] T08 — Apply style guidance to cover-letter generation (#10), additively
  - **Files:** `packages/ai/src/tools/generate-cover-letter.ts`, `packages/ai/src/tools/generate-cover-letter.test.ts`
  - **Acceptance:**
    - When a fingerprint exists, `loadWritingStyle` + `buildStyleGuidance` adds a `styleGuidance` field to the returned `context`/`instruction`.
    - When no fingerprint exists, the returned object is **byte-identical to today** (additive only, non-negotiable #9).
    - No-invent discipline (#6 `assertNoInvented`) unaffected; style is tone-only.
    - Unit test covers both branches (fingerprint present vs absent).
  - **Estimate:** 0.5 day

- [ ] T09 — Apply style guidance to outreach drafts (#17)
  - **Files:** `packages/ai/src/tools/` outreach draft tool (per #17) + its `*.test.ts`
  - **Acceptance:**
    - The #17 outreach tool's context optionally carries the `styleGuidance` block via `buildStyleGuidance` when a fingerprint exists; absent fingerprint = unchanged output.
    - Draft-only / HITL posture from #17 + #6 preserved; nothing is sent.
    - Unit test asserts the block is present only when a fingerprint exists.
    - If #17's tool is not yet merged, mark this task blocked-on-#17 and ship the shared helper (T07) so wiring is trivial later.
  - **Estimate:** 0.5 day

- [ ] T10 — Document the tool + style-aware behaviour in the system prompt
  - **Files:** `packages/ai/src/prompts.ts`, `packages/ai/src/prompts.test.ts` (Langfuse prompt `orchestrator-system` updated separately in Langfuse Cloud)
  - **Acceptance:**
    - `DEFAULT_ORCHESTRATOR_PROMPT` lists `updateWritingStyle` under capabilities and adds a short "Writing Style" section: call it after the user approves/edits a generated artifact; style is applied to future letters/outreach; never store or quote raw text.
    - Prompt test asserts the new tool name and a "writing style" cue are present.
    - Note in the file points to updating the Langfuse `orchestrator-system` production prompt to match.
  - **Estimate:** 0.5 day

## Phase 4 — View & tune UI + canvas sync

- [ ] T11 — Canvas card to surface the fingerprint
  - **Files:** `apps/web/components/canvas/writing-style-card.tsx`
  - **Acceptance:**
    - Built from the `apps/web/components/canvas/salary-insights-card.tsx` overlay template; uses `@ever-hust/ui/{card,badge}` + `cn()` from `@ever-hust/ui/lib/utils`.
    - Renders descriptors as readable chips/bars (formality, sentence length, metrics usage, structure); shows a "still learning" state for low `sampleCount`.
    - Displays no raw text (there is none to display).
  - **Estimate:** 0.5 day

- [ ] T12 — Canvas-sync case for the new tool result
  - **Files:** `apps/web/hooks/use-canvas-sync.ts`, `apps/web/hooks/use-canvas-sync.test.ts`
  - **Acceptance:**
    - New `case "updateWritingStyle"` in `handleToolResult` stores the descriptors in canvas state and surfaces the writing-style card.
    - Adds `writingStyle` to `CanvasState` + a `clearWritingStyle` callback, mirroring the `salaryInsights` pattern.
    - Unit test: dispatching an `updateWritingStyle` result updates state; unknown tools still hit the default branch.
  - **Estimate:** 0.5 day

- [ ] T13 — Settings card to view + tune descriptors
  - **Files:** `apps/web/components/settings/writing-style-card.tsx`, `apps/web/components/settings/types.ts` (if a shared type is needed), settings page registration
  - **Acceptance:**
    - Card shows current descriptors and plain-language nudges ("more concise", "less formal") per spec §3, persisted as user overrides that win over auto-derived values (#13 two-layer, user-wins).
    - No raw-text editor — descriptor tuning only.
    - Registered alongside the other cards on the settings page.
  - **Estimate:** 0.5 day

- [ ] T14 — API route: GET descriptors + PATCH override nudges
  - **Files:** `apps/web/app/api/user/writing-style/route.ts`, `apps/web/lib/api-schemas.ts`, `apps/web/app/api/user/writing-style/route.test.ts` (web-lib project)
  - **Acceptance:**
    - GET returns the user's descriptors (or empty); PATCH applies a bounded override nudge.
    - Uses `requireSessionUser()`, `applyRateLimit(userId, "authenticated")`, Zod request schema from `apps/web/lib/api-schemas.ts`, errors via `apiBadRequest()`/`apiError()` from `apps/web/lib/api-response.ts`.
    - PATCH validates descriptor bounds (0–1 / enum) and persists override; never accepts raw text.
    - Unit test: unauthenticated → 401-style response; valid PATCH persists; invalid descriptor rejects.
  - **Estimate:** 1 day

- [ ] T15 — E2E: view fingerprint and tune it
  - **Files:** `tests/e2e/writing-style.spec.ts`
  - **Acceptance:**
    - Playwright (baseURL `http://localhost:8443`): authenticated user opens settings, sees the writing-style card, applies a "more concise" nudge, and the persisted descriptor reflects it on reload.
    - Asserts no raw writing sample is shown anywhere in the UI.
    - `pnpm test:e2e` passes.
  - **Estimate:** 1 day

## Notes

- Write tests alongside each implementation task; do not batch testing into a final task.
- Run package tests with `pnpm test -- --selectProjects ai` (and `db`, `web-lib`) and E2E with `pnpm test:e2e`.
- Privacy invariant is load-bearing: every task that touches text must keep raw samples out of storage and out of LLM context (spec §1, Article 8).
- Verify **zero competitor references** before every commit (constitution Article 11).
- CI (lint, type-check, unit, E2E) must be green before merge; work lands on `develop` (Article 10.4).
- Update `docs/specs/ROADMAP.md` progress when this epic's tasks complete.
