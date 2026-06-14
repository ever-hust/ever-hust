# Tasks: 08 — Funnel & Rejection-Pattern Analytics

> Status legend: `[ ]` pending • `[~]` in-progress • `[x]` done • `[-]` dropped

## Phase 1 — Pure aggregation engine

- [ ] T01 — Define the funnel-insights Zod contract & row types
  - **Files:** `packages/ai/src/insights/types.ts`, `packages/ai/src/insights/types.test.ts`
  - **Acceptance:**
    - Exports `FunnelInsightsSchema` (Zod) covering: ordered stages (`applied → responded → interview → offer`), per-stage counts + conversion rates, `timeInStageDays`, `bySegment` keyed by dimension, and `scoreFloor: { value: number | null; sampleSize: number; sufficient: boolean }`.
    - Exports inferred `FunnelInsights` type and a `SegmentDimension` enum (`scoreBand | jobFamily | source | compRange | remote`).
    - Defines an internal `FunnelRow` type (one application joined to its evaluation: stage, `stageChangedAt`, `score`, `band`, `family`, `source`, `compRange`, `isRemote`) as the typed seam from #2/#3.
    - Test asserts a sample object parses; a malformed object fails.
  - **Estimate:** 0.5 day

- [ ] T02 — Implement stage conversion + time-in-stage
  - **Files:** `packages/ai/src/insights/funnel.ts`, `packages/ai/src/insights/funnel.test.ts`
  - **Acceptance:**
    - `computeFunnel(rows: FunnelRow[])` returns per-stage counts and conversion rates (each stage / the prior reachable stage), validating against `FunnelInsightsSchema`.
    - `timeInStage(rows)` derives median days per transition from `stageChangedAt`; null when a stage is never reached.
    - Pure (no DB import); deterministic on fixtures.
    - Tests cover: empty input, all-stalled-at-applied, a full applied→offer path, and a row missing `stageChangedAt`.
  - **Estimate:** 1 day

- [ ] T03 — Implement conversion-by-segment
  - **Files:** `packages/ai/src/insights/funnel.ts`, `packages/ai/src/insights/funnel.test.ts`
  - **Acceptance:**
    - `conversionBySegment(rows, dim: SegmentDimension)` buckets rows by the dimension and returns applied→responded+ conversion per bucket, sorted, with a per-bucket `sampleSize`.
    - Comp range and score band use fixed buckets (not raw values) to bound cardinality.
    - Tests cover each dimension and a buckets-below-min-sample case.
  - **Estimate:** 1 day

- [ ] T04 — Implement the empirical score floor
  - **Files:** `packages/ai/src/insights/funnel.ts`, `packages/ai/src/insights/funnel.test.ts`
  - **Acceptance:**
    - `computeScoreFloor(rows, minSample)` = min `score` among rows that reached `responded`+; returns `{ value, sampleSize, sufficient }` where `sufficient` is false (and `value` null) below `minSample` — never fabricates a floor (Article 7).
    - Tests cover: no `responded`+ rows, ties at the floor, single qualifying row, and the `sufficient` boundary.
  - **Estimate:** 0.5 day

## Phase 2 — Read API, tool & optional cache

- [ ] T05 — Add the `insights_cache` table and push it
  - **Files:** `packages/db/src/schema/insights-cache.ts`, `packages/db/src/schema/index.ts`, `packages/db/src/schema/insights-cache.test.ts`
  - **Acceptance:**
    - Table `insights_cache`: `id integer generatedAlwaysAsIdentity()`, `userId text notNull references users.id onDelete cascade`, `kind text` enum (`funnel`), `payload jsonb $type<FunnelInsights>()`, `computedAt timestamp notNull defaultNow()`, index on `(userId, kind)`.
    - Exported from `schema/index.ts`; house style matches `applications.ts`.
    - `pnpm db:push` applies cleanly against a dev DB.
    - Unit test asserts the column/enum shape compiles and the row type matches `FunnelInsights`.
  - **Estimate:** 0.5 day

- [ ] T06 — `loadFunnelRows(userId)` join with cache read-through
  - **Files:** `packages/ai/src/insights/query.ts`, `packages/ai/src/insights/query.test.ts`
  - **Acceptance:**
    - Joins `applications` ↔ `evaluations` on `(userId, jobId)`, scoped to the passed `userId`, returning `FunnelRow[]`.
    - Cache read-through: a fresh `insights_cache` row short-circuits recompute; a miss recomputes and writes the cache.
    - `db` imported from `@ever-hust/db`; `userId` is a function param, never LLM-supplied.
    - Test mocks `db` and asserts the join filter, the cache-hit short-circuit, and the cache-miss write.
  - **Estimate:** 1 day

- [ ] T07 — `getFunnelInsights` tool + export + orchestrator registration
  - **Files:** `packages/ai/src/tools/get-funnel-insights.ts`, `packages/ai/src/tools/index.ts`, `packages/ai/src/agents/orchestrator.ts`, `packages/ai/src/tools/get-funnel-insights.test.ts`
  - **Acceptance:**
    - `tool({ description, inputSchema: z.object({ ... }).strict(), execute })`; input has only optional display hints (e.g. `segmentDimension`) with `.max()` bounds — **no `userId` in the schema**.
    - `execute` calls `loadFunnelRows` + `computeFunnel`/segment/floor and returns a `FunnelInsightsSchema`-valid plain object.
    - Exported from `tools/index.ts`; registered in the `tools: { ... }` object in `orchestrator.ts` with `userId` injected server-side (same wrapper pattern as `favoriteJob`/`savePreferences`); stays within `stepCountIs(5)`.
    - Test: tool returns a valid object on a fixture; calling it never reads a `userId` from tool input.
  - **Estimate:** 1 day

- [ ] T08 — `GET /api/insights/funnel` route
  - **Files:** `apps/web/app/api/insights/funnel/route.ts`, `apps/web/lib/__tests__` or `apps/web/app/api/insights/funnel/route.test.ts`
  - **Acceptance:**
    - `requireSessionUser()` resolves the user; `applyRateLimit(userId, "authenticated")` applied; returns `FunnelInsights` JSON.
    - Errors via `apiError()` / `apiBadRequest()` from `apps/web/lib/api-response.ts`; default `Cache-Control: private, no-cache` headers preserved.
    - `userId` comes only from the session — never the query string.
    - Test (web-lib project) asserts 401 without session, 200 + valid shape with a mocked session.
  - **Estimate:** 0.5 day

- [ ] T09 — Document `getFunnelInsights` in the system prompt
  - **Files:** `packages/ai/src/prompts.ts`, `packages/ai/src/prompts.test.ts`
  - **Acceptance:**
    - `DEFAULT_ORCHESTRATOR_PROMPT` lists `getFunnelInsights` under "Your Capabilities" with a one-line description and a usage note (use when the user asks how their search is performing / where they stall / what score floor to target).
    - Note that the Langfuse `orchestrator-system` prompt must be updated to match (comment in file).
    - `prompts.test.ts` asserts the prompt text mentions `getFunnelInsights`.
  - **Estimate:** 0.5 day

## Phase 3 — Insights page & canvas surfacing

- [ ] T10 — Funnel insights canvas card
  - **Files:** `apps/web/components/canvas/funnel-insights-card.tsx`
  - **Acceptance:**
    - Renders the funnel (stage counts + conversion), by-segment breakdown, and a score-floor callout, reusing the in-house bar/range/`Section` primitives and `@ever-hust/ui/{card,badge}` + `cn()` (modelled on `salary-insights-card.tsx`).
    - Props typed from the exported `FunnelInsights` type (single source of truth).
    - Empty-history and "floor: not enough data" states render gracefully (no crash, no fabricated number).
  - **Estimate:** 1 day

- [ ] T11 — Wire the tool result into canvas sync
  - **Files:** `apps/web/hooks/use-canvas-sync.ts`
  - **Acceptance:**
    - Adds `case "getFunnelInsights"` to `handleToolResult` that stores the funnel object in canvas state and surfaces `FunnelInsightsCard` (alongside the existing `salaryInsights` overlay pattern, with a matching `clearFunnelInsights` callback).
    - Unknown-tool default branch unchanged.
  - **Estimate:** 0.5 day

- [ ] T12 — Insights dashboard page
  - **Files:** `apps/web/app/(dashboard)/insights/page.tsx`
  - **Acceptance:**
    - Client page fetches `/api/insights/funnel`, renders `FunnelInsightsCard` with loading/error/empty states using the shared `PageHeader` / `EmptyState` / `ErrorState` components.
    - Reachable from dashboard navigation; respects the `(dashboard)` auth proxy.
  - **Estimate:** 0.5 day

## Phase 4 — Opt-in auto-tune (human-in-the-loop)

- [ ] T13 — Apply-floor API route + schema
  - **Files:** `apps/web/app/api/insights/apply-floor/route.ts`, `apps/web/lib/api-schemas.ts`, `apps/web/app/api/insights/apply-floor/route.test.ts`
  - **Acceptance:**
    - POST, `requireSessionUser()`, body validated by a new Zod schema in `api-schemas.ts` (`{ floor: number }`, bounded range); `applyRateLimit(userId, "authenticated")`.
    - Writes `users.preferences.evaluationFloor` for the session user only (merges into existing `preferences` JSON, does not clobber other keys).
    - Rejects an out-of-range or absent floor via `apiBadRequest()`; no write on validation failure.
    - Test asserts: 401 without session, 400 on bad body, 200 + persisted preference on valid body.
  - **Estimate:** 1 day

- [ ] T14 — "Apply this threshold" explicit-confirm action
  - **Files:** `apps/web/components/canvas/funnel-insights-card.tsx`
  - **Acceptance:**
    - Score-floor callout shows an "Apply this threshold" button that opens a confirm `@ever-hust/ui/dialog` showing current → new floor; only on explicit confirm does it POST `/api/insights/apply-floor` (Article 4 — never auto-applied).
    - Button is disabled when `scoreFloor.sufficient` is false (insufficient history).
    - Success toast / state reflects the saved floor.
  - **Estimate:** 0.5 day

## Phase 5 — E2E & hardening

- [ ] T15 — Playwright E2E for the Insights flow
  - **Files:** `tests/e2e/insights.spec.ts`
  - **Acceptance:**
    - Against a seeded fixture-history user (`pnpm db:seed`), the `/insights` page renders the funnel, a by-segment breakdown, and the score-floor callout.
    - Exercises the apply-floor confirm dialog and asserts the preference persists (and that nothing is written without confirming).
    - `pnpm test:e2e` green at `http://localhost:8443`.
  - **Estimate:** 1 day

- [ ] T16 — Lint, type-check & competitor-clean gate
  - **Files:** _(repo-wide; no new source)_
  - **Acceptance:**
    - `pnpm lint`, `pnpm check-types`, `pnpm test`, `pnpm test:e2e` all green.
    - Grep the diff for competitor names → empty result (Article 11).
    - `docs/specs/ROADMAP.md` progress updated for epic 08.
  - **Estimate:** 0.5 day

## Notes

- Write tests alongside each implementation task; do not batch testing into a final task.
- Verify **zero competitor references** before every commit (see constitution Article 11).
- Update `docs/specs/ROADMAP.md` progress when an epic's tasks complete.
- Upstream contracts assumed present: application stages + `stageChangedAt` (#2), `evaluations`
  score/band/family (#3), the shared Zod-artifact contract (#5), grounded/no-invent helpers (#6).
- `userId` is always server-injected (orchestrator wrapper or `requireSessionUser()`) — never a
  tool-input or query-string field.
