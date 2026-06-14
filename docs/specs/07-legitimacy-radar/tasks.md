# Tasks: 07 — Posting-Legitimacy / Ghost-Job Radar

> Status legend: `[ ]` pending • `[~]` in-progress • `[x]` done • `[-]` dropped

## Phase 1 — Upstream contract (Ever Jobs) + forward-compatible client type

- [ ] T01 — Scaffold the `legitimacy-corpus` plugin and add additive `legitimacy` to the Ever Jobs public `JobPostDto` (upstream repo)
  - **Files:** (separate `ever-jobs` repo) new `legitimacy-corpus` feature plugin alongside
    dedup/liveness/merge; the `JobPostDto` returned by `/api/jobs/search` and job-by-id gains optional
    `legitimacy: { tier: 'active'|'caution'|'suspicious', score: number, reasons: string[] }`. Reuses
    the dedup/recheck ledger + liveness inputs (apply-control, posting age, reposting pattern,
    salary-vagueness, employer red flags) per spec §3.1.
  - **Acceptance:**
    - Field is **optional / additive** — no required field added to the DTO; existing consumers verified unaffected.
    - `tier` is only ever `active | caution | suspicious`; `reasons[]` is a string array of contributing signals.
    - A fixture posting with off-platform redirect + perpetual age yields `tier: suspicious` with reasons (spec §6).
    - Change tracked in the `ever-jobs` repo per its own `AGENTS.md` (not in this tree).
  - **Estimate:** 1 day

- [ ] T02 — Extend Hust client `JobPostDto` with optional `legitimacy` (forward-compatible)
  - **Files:** `packages/jobs-api/src/types.ts` (add `legitimacy?: { tier: "active" | "caution" | "suspicious"; score?: number; reasons?: string[] }` to the `JobPostDto` interface);
    `packages/jobs-api/src/types.test.ts`.
  - **Acceptance:**
    - A `JobPostDto` **without** `legitimacy` still type-checks and is accepted (forward-compatible).
    - A `JobPostDto` **with** `legitimacy` exposes the typed `tier | score | reasons`.
    - Unit test covers both present and absent `legitimacy`.
    - `pnpm test -- --selectProjects jobs-api` green.
  - **Estimate:** 0.5 day

## Phase 2 — Persist legitimacy on the synced `jobs` row

- [ ] T03 — Add nullable legitimacy columns to the `jobs` schema
  - **Files:** `packages/db/src/schema/jobs.ts` (add `legitimacyTier: text("legitimacy_tier", { enum: ["active","caution","suspicious"] })`, `legitimacyScore: numeric("legitimacy_score")`, `legitimacyReasons: jsonb("legitimacy_reasons").$type<string[]>()` — all nullable; optional `index("jobs_legitimacy_tier_idx").on(table.legitimacyTier)`). No change needed in `packages/db/src/schema/index.ts` (`jobs` already exported).
  - **Acceptance:**
    - All three columns are **nullable** (no `.notNull()`, no default that breaks existing rows).
    - Column names follow house style (snake_case `legitimacy_*`); tier uses the `text(..., { enum })` pattern; reasons uses `jsonb(...).$type<string[]>()`.
    - Named distinctly from any `liveness*` columns (no collision with epic #4).
    - `pnpm check-types` green for `packages/db`.
  - **Estimate:** 0.5 day

- [ ] T04 — Push the schema change to the database
  - **Files:** apply via `pnpm db:push` (drizzle.config.ts → schema `./src/schema/index.ts`). No file edit beyond T03.
  - **Acceptance:**
    - `pnpm db:push` completes; `jobs` table shows the three nullable `legitimacy_*` columns.
    - Existing rows are unaffected (tier `NULL` for pre-existing jobs).
    - No destructive/altering of existing columns reported in the push diff.
  - **Estimate:** 0.5 day

- [ ] T05 — Map legitimacy in `mapJobToDb` and carry it through both sync paths
  - **Files:** `packages/triggers/src/map-job.ts` (`mapJobToDb`: add `legitimacyTier: dto.legitimacy?.tier ?? null`, `legitimacyScore: safeNumericString(dto.legitimacy?.score)`, `legitimacyReasons: dto.legitimacy?.reasons ?? null`); verify pass-through in `packages/triggers/src/sync-jobs.ts` and `apps/web/app/api/jobs/sync/route.ts` (both spread `...mapped` into the upsert — no change expected); `packages/triggers/src/map-job.test.ts`.
  - **Acceptance:**
    - A DTO with `legitimacy` maps all three columns; a DTO **without** `legitimacy` yields `null` for all three (no throw).
    - Invalid / non-finite `score` coalesces to `null` via the existing `safeNumericString` helper.
    - Existing `mapJobToDb` fields unchanged (additive only).
    - Unit tests cover present, absent, and bad-`score` cases; `pnpm test -- --selectProjects triggers` green.
  - **Estimate:** 0.5 day

## Phase 3 — Render the benign trust badge (canvas card + both detail views)

- [ ] T06 — Create the presentational benign `TrustBadge` component
  - **Files:** new `apps/web/components/canvas/trust-badge.tsx` (uses `Badge` from `@ever-hust/ui/badge` + `cn` from `@ever-hust/ui/lib/utils`; props `{ tier: "active"|"caution"|"suspicious"|null; reasons?: string[] | null }`).
  - **Acceptance:**
    - Renders benign, explained copy: `active` → "Verified-active", `caution` → "Worth a quick check", `suspicious` → "Some signals to review", each with a one-line "why" from `reasons[0]`.
    - **Never renders red, never the word "scam"** (use neutral/amber tones — e.g. green/secondary for active, amber for caution/suspicious). A unit test asserts the rendered strings contain no "scam" and the suspicious variant is not a destructive/red variant.
    - Renders **nothing** when `tier` is null/undefined (no layout shift).
    - The "why" line surfaces only reasons actually present in `reasons[]` — never an invented reason (Article 7); pure/presentational (`memo`), accessible label.
    - `pnpm lint` + `pnpm check-types` green; render unit test alongside (`trust-badge.test.tsx` or via the web-lib jest project).
  - **Estimate:** 1 day

- [ ] T07 — Surface legitimacy columns through the search API and `JobCardData`
  - **Files:** `apps/web/app/api/jobs/search/route.ts` (add `legitimacyTier`, `legitimacyScore`, `legitimacyReasons` to the `db.select({...})` block); `apps/web/components/canvas/job-card.tsx` (add the three fields to the `JobCardData` interface; render `<TrustBadge>` in the card's badge/meta row).
  - **Acceptance:**
    - Search response includes the three legitimacy fields for each job.
    - `JobCardData` carries the fields (nullable); `JobCard` shows the badge; jobs with `NULL` tier render with no badge and no layout shift.
    - `suspicious` jobs are **still rendered** in the list (never filtered out) — the badge informs, it does not hide.
    - `pnpm check-types` green.
  - **Estimate:** 0.5 day

- [ ] T08 — Render the badge on both detail surfaces (canvas overlay + jobs page)
  - **Files:** `apps/web/components/canvas/job-detail-panel.tsx` (render `<TrustBadge>` in the detail header with the full "why"); `apps/web/app/(dashboard)/jobs/[id]/page.tsx` (render badge in the header badges row and/or sidebar "Job Details" card; extend the page's `getJob` select on `jobs` to include the three legitimacy columns).
  - **Acceptance:**
    - Badge + "why" appear on the canvas detail overlay and the server-rendered job detail page.
    - Detail page keeps existing `JobPosting` JSON-LD unchanged; legitimacy is presentational only.
    - `suspicious`/`caution` jobs remain fully viewable; copy stays benign (no red, no "scam"); `pnpm lint` + `pnpm check-types` green.
  - **Estimate:** 0.5 day

## Phase 4 — Chat narration + Block-G orthogonality (fit score untouched)

- [ ] T09 — Return legitimacy from `getJobDetailsTool` and surface it via canvas-sync
  - **Files:** `packages/ai/src/tools/get-job-details.ts` (add `legitimacyTier`, `legitimacyScore`, `legitimacyReasons` to the `db.select({...})` and return them); `apps/web/hooks/use-canvas-sync.ts` (in the result-handling switch, carry the legitimacy fields through so an opened single job surfaces the badge — extend the relevant `case` rather than adding a tool).
  - **Acceptance:**
    - `getJobDetails` returns the three legitimacy fields (null when absent); `userId` stays server-injected (n/a here — this tool takes only `jobId`); long-text capping behaviour unchanged.
    - The canvas reflects the legitimacy badge when a job is opened from chat.
    - Unit test in `packages/ai/src/tools/get-job-details.test.ts` (new alongside) covers legitimacy-present and legitimacy-absent paths; `pnpm test -- --selectProjects ai` green.
  - **Estimate:** 1 day

- [ ] T10 — Document benign legitimacy phrasing + orthogonality in the orchestrator system prompt
  - **Files:** `packages/ai/src/prompts.ts` (`getOrchestratorPrompt`; mirror in Langfuse prompt `orchestrator-system`) — add a short "Posting legitimacy / trust" note instructing the model to describe the tier **benignly** ("worth a quick check" / "some signals to review", never "scam"), to cite only returned reasons, and that legitimacy is **separate from the fit score** — it is never folded into an evaluation's number.
  - **Acceptance:**
    - Prompt explains the three tiers in benign language and forbids alarmist/"scam" wording.
    - Prompt states legitimacy is orthogonal to the fit score (#3) and must not change it.
    - `pnpm test -- --selectProjects ai` (prompts.test.ts) green; Langfuse `orchestrator-system` updated to match the local fallback.
  - **Estimate:** 0.5 day

- [ ] T11 — Render legitimacy as evaluation Block G — beside the fit score, never inside it
  - **Files:** `packages/ai/src/tools/evaluate-job.ts` (from #3) + the evaluation drawer renderer — render Block G from the job's `legitimacyTier`/`legitimacyReasons` columns when present; **do not** read legitimacy into any weighted dimension or the 0–100 score.
  - **Acceptance:**
    - Block G shows the benign tier + "why" beside the fit score; absent when legitimacy is `NULL`.
    - The evaluation's `score`/`score5`/dimensions are byte-identical whether or not legitimacy is present (a unit/snapshot test asserts the score is unchanged by legitimacy).
    - If #3's drawer is not yet merged, this task is deferred to a follow-up and tracked in `docs/specs/ROADMAP.md` (Phases 1–3 + T09/T10 still ship).
    - `pnpm test -- --selectProjects ai` green.
  - **Estimate:** 1 day

## Phase 5 — E2E + roadmap

- [ ] T12 — Playwright coverage for the benign badge + score orthogonality
  - **Files:** `tests/e2e/jobs.spec.ts` (extend; baseURL `http://localhost:8443`).
  - **Acceptance:**
    - A `suspicious` fixture shows the benign "Some signals to review" badge with a one-line "why"; a `caution` fixture shows "Worth a quick check"; an `active` fixture shows "Verified-active".
    - The rendered badge text contains **no "scam"** and uses no red/destructive styling.
    - A `suspicious` job is **still present** in the list (asserts it is not hidden).
    - With an evaluation present (#3), the visible fit score is the same whether legitimacy is present or null (orthogonality assertion).
    - `pnpm test:e2e` green locally.
  - **Estimate:** 1 day

- [ ] T13 — Update roadmap progress
  - **Files:** `docs/specs/ROADMAP.md`.
  - **Acceptance:**
    - Epic 07 progress reflects completion of the shipped phases (and notes any Block-G follow-up if #3 lagged).
    - **Zero competitor references** confirmed across all changed files (Article 11) before commit.
    - Full CI (lint, type-check, unit, E2E) green on `develop` before the PR merges (Article 10.4).
  - **Estimate:** 0.5 day

## Notes

- Write tests alongside each implementation task; do not batch testing into a final task
  (T02/T05/T06/T09 carry their own unit tests; T12 is the dedicated E2E).
- Verify **zero competitor references** before every commit (see constitution Article 11).
- Ship **forward-compatible**: every Hust change tolerates a missing/null `legitimacy` so Hust merges
  and runs green even before the Ever Jobs DTO field is deployed (Article 2 standalone-first).
- Badge copy is **benign and explained — never red, never "scam"**; the "why" surfaces only reasons
  Ever Jobs returned (no invented reasons, Article 7).
- Legitimacy stays **orthogonal to the fit score** (#3): Block G renders beside the number and must
  never enter the weighted dimensions or the 0–100 result.
- `suspicious` is **shown, never auto-hidden** — do not add any filter that drops a tier.
- Update `docs/specs/ROADMAP.md` progress when an epic's tasks complete.
