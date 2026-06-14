# Tasks: 04 — Liveness DTO + Ghost-Job Freshness

> Status legend: `[ ]` pending • `[~]` in-progress • `[x]` done • `[-]` dropped

## Phase 1 — Upstream contract (Ever Jobs) + forward-compatible client type

- [ ] T01 — Add additive `liveness` to the Ever Jobs public `JobPostDto` (upstream repo)
  - **Files:** (separate `ever-jobs` repo) the `JobPostDto` returned by `/api/jobs/search` and
    job-by-id — add optional `liveness: { verdict: 'active'|'expired'|'uncertain', code, checkedAt }`
    sourced from the existing `liveness-http` checker.
  - **Acceptance:**
    - Field is **optional / additive** — no required field added to the DTO.
    - Existing Ever Jobs consumers verified unaffected (response shape unchanged when liveness is absent).
    - Verdict only ever one of `active | expired | uncertain`; `checkedAt` is an ISO string.
    - Change tracked in the `ever-jobs` repo per its own `AGENTS.md` (not in this tree).
  - **Estimate:** 1 day

- [ ] T02 — Extend Hust client `JobPostDto` with optional `liveness` (forward-compatible)
  - **Files:** `packages/jobs-api/src/types.ts` (add `liveness?: { verdict: "active" | "expired" | "uncertain"; code?: string; checkedAt?: string }` to the `JobPostDto` interface);
    `packages/jobs-api/src/types.test.ts`.
  - **Acceptance:**
    - A `JobPostDto` **without** `liveness` still type-checks and is accepted (forward-compatible).
    - A `JobPostDto` **with** `liveness` exposes the typed `verdict | code | checkedAt`.
    - Unit test covers both present and absent `liveness`.
    - `pnpm test -- --selectProjects jobs-api` green.
  - **Estimate:** 0.5 day

## Phase 2 — Persist liveness on the synced `jobs` row

- [ ] T03 — Add nullable liveness columns to the `jobs` schema
  - **Files:** `packages/db/src/schema/jobs.ts` (add `livenessVerdict: text("liveness_verdict", { enum: ["active","expired","uncertain"] })`, `livenessCode: text("liveness_code")`, `livenessCheckedAt: timestamp("liveness_checked_at")` — all nullable; optional `index("jobs_liveness_verdict_idx").on(table.livenessVerdict)`). No change needed in `packages/db/src/schema/index.ts` (`jobs` already exported).
  - **Acceptance:**
    - All three columns are **nullable** (no `.notNull()`, no default that breaks existing rows).
    - Column names follow house style (snake_case `liveness_*`); verdict uses the `text(..., { enum })` pattern.
    - `pnpm check-types` green for `packages/db`.
  - **Estimate:** 0.5 day

- [ ] T04 — Push the schema change to the database
  - **Files:** apply via `pnpm db:push` (drizzle.config.ts → schema `./src/schema/index.ts`). No file edit beyond T03.
  - **Acceptance:**
    - `pnpm db:push` completes; `jobs` table shows the three nullable `liveness_*` columns.
    - Existing rows are unaffected (verdict `NULL` for pre-existing jobs).
    - No destructive/altering of existing columns reported in the push diff.
  - **Estimate:** 0.5 day

- [ ] T05 — Map liveness in `mapJobToDb` and carry it through both sync paths
  - **Files:** `packages/triggers/src/map-job.ts` (`mapJobToDb`: add `livenessVerdict: dto.liveness?.verdict ?? null`, `livenessCode: dto.liveness?.code ?? null`, `livenessCheckedAt: safeDate(dto.liveness?.checkedAt)`); verify pass-through in `packages/triggers/src/sync-jobs.ts` and `apps/web/app/api/jobs/sync/route.ts` (both spread `...mapped` into the upsert — no change expected); `packages/triggers/src/map-job.test.ts`.
  - **Acceptance:**
    - A DTO with `liveness` maps all three columns; a DTO **without** `liveness` yields `null` for all three (no throw).
    - Invalid / unparseable `checkedAt` coalesces to `null` via `safeDate`.
    - Existing `mapJobToDb` fields unchanged (additive only).
    - Unit tests cover present, absent, and bad-`checkedAt` cases; `pnpm test -- --selectProjects triggers` green.
  - **Estimate:** 0.5 day

## Phase 3 — Render the liveness badge (canvas card + both detail views)

- [ ] T06 — Create the presentational `LivenessBadge` component
  - **Files:** new `apps/web/components/canvas/liveness-badge.tsx` (uses `Badge` from `@ever-hust/ui/badge` + `cn` from `@ever-hust/ui/lib/utils`; props `{ verdict: "active"|"expired"|"uncertain"|null; checkedAt?: string | Date | null }`).
  - **Acceptance:**
    - Renders **active=green / expired=grey / uncertain=amber**; renders **nothing** when `verdict` is null/undefined.
    - Shows a tooltip/title "checked <relative time> ago" when `checkedAt` present (reuse `timeAgo` from `@/lib/format-date`).
    - Pure/presentational (`memo`), no data fetching; accessible label (e.g. `aria-label="Listing is expired"`).
    - `pnpm lint` + `pnpm check-types` green.
  - **Estimate:** 0.5 day

- [ ] T07 — Surface liveness columns through the search API and `JobCardData`
  - **Files:** `apps/web/app/api/jobs/search/route.ts` (add `livenessVerdict`, `livenessCode`, `livenessCheckedAt` to the `db.select({...})` block); `apps/web/components/canvas/job-card.tsx` (add the three fields to the `JobCardData` interface; render `<LivenessBadge>` in the card's badge/meta row).
  - **Acceptance:**
    - Search response includes the three liveness fields for each job.
    - `JobCardData` carries the fields (nullable); `JobCard` shows the badge, and **`uncertain` jobs are still rendered in the list** (never filtered out).
    - Cards for jobs with `NULL` verdict render with no badge and no layout shift.
    - `pnpm check-types` green.
  - **Estimate:** 0.5 day

- [ ] T08 — Render the badge on both detail surfaces (canvas overlay + jobs page)
  - **Files:** `apps/web/components/canvas/job-detail-panel.tsx` (render `<LivenessBadge>` in the detail header); `apps/web/app/(dashboard)/jobs/[id]/page.tsx` (render badge in the header badges row and/or sidebar "Job Details" card; data already comes from the `getJob` select on `jobs`).
  - **Acceptance:**
    - Badge appears on the canvas detail overlay and the server-rendered job detail page.
    - Detail page keeps existing `JobPosting` JSON-LD; liveness is presentational only (no schema.org change required).
    - `uncertain`/`expired` jobs still fully viewable; `pnpm lint` + `pnpm check-types` green.
  - **Estimate:** 0.5 day

## Phase 4 — Non-blocking apply-flow warning (human-in-the-loop preserved)

- [ ] T09 — Emit a non-blocking `livenessWarning` from the `applyJob` tool
  - **Files:** `packages/ai/src/tools/apply-job.ts` (extend the job `select` to read `livenessVerdict`/`livenessCheckedAt`; when verdict is not `active`, add `livenessWarning: { verdict, checkedAt, message }` to the success result — **without** blocking the apply).
  - **Acceptance:**
    - When the job verdict is `expired`/`uncertain`, the result includes `livenessWarning`; when `active` or `NULL`, no warning field.
    - The apply still proceeds (the tool already requires user approval upstream — that gate is unchanged; nothing is auto-submitted).
    - `userId` stays server-injected (never an LLM param); existing duplicate/transaction logic untouched.
    - Unit test in `packages/ai/src/tools/apply-job.test.ts` (new alongside the tool) covers warning-present and warning-absent paths; `pnpm test -- --selectProjects ai` green.
  - **Estimate:** 1 day

- [ ] T10 — Document the liveness behaviour in the orchestrator system prompt
  - **Files:** `packages/ai/src/prompts.ts` (`getOrchestratorPrompt`; mirror in Langfuse prompt `orchestrator-system`) — add a short "Listing freshness / liveness" note instructing the model to surface `livenessWarning` to the user before they approve an apply, and to never hide `uncertain` jobs.
  - **Acceptance:**
    - Prompt explains the liveness verdict and that a non-`active` job must be flagged to the user pre-approval, non-blocking.
    - Prompt states `uncertain` jobs are shown, never dropped.
    - `pnpm test -- --selectProjects ai` (prompts.test.ts) green; Langfuse `orchestrator-system` updated to match local fallback.
  - **Estimate:** 0.5 day

- [ ] T11 — Surface the caution line in the apply approval card
  - **Files:** `apps/web/components/chat/tool-approval.tsx` (in `getToolDisplay` for the `applyJob` case, render an amber caution line when `args.livenessWarning`/verdict is present — e.g. "This listing may be closed (checked X ago) — you can still apply").
  - **Acceptance:**
    - For a non-`active` job, the approval card shows an amber, dismissible caution; **Approve is still enabled** (non-blocking).
    - For an `active`/unknown job, the card looks exactly as today (no caution).
    - No change to the approval/deny mechanics; `pnpm lint` + `pnpm check-types` green.
  - **Estimate:** 0.5 day

## Phase 5 — E2E + roadmap

- [ ] T12 — Playwright coverage for badge + apply warning
  - **Files:** `tests/e2e/jobs.spec.ts` (extend; baseURL `http://localhost:8443`).
  - **Acceptance:**
    - A job with an `expired` fixture verdict shows the grey badge; an `uncertain` fixture shows the amber badge **and is still present in the list** (asserts it is not hidden).
    - Initiating apply on a non-`active` job surfaces the non-blocking warning, and the user can still proceed.
    - `pnpm test:e2e` green locally.
  - **Estimate:** 1 day

- [ ] T13 — Update roadmap progress
  - **Files:** `docs/specs/ROADMAP.md`.
  - **Acceptance:**
    - Epic 04 progress reflects completion of the shipped phases.
    - **Zero competitor references** confirmed across all changed files (Article 11) before commit.
    - Full CI (lint, type-check, unit, E2E) green on `develop` before the PR merges (Article 10.4).
  - **Estimate:** 0.5 day

## Notes

- Write tests alongside each implementation task; do not batch testing into a final task
  (T02/T05/T09 carry their own unit tests; T12 is the dedicated E2E).
- Verify **zero competitor references** before every commit (see constitution Article 11).
- Ship **forward-compatible**: every Hust change tolerates a missing/null `liveness` so Hust merges
  and runs green even before the Ever Jobs DTO field is deployed (Article 2 standalone-first).
- **`uncertain` is shown, never hidden** — do not add any filter that drops non-`active` jobs.
- Human-in-the-loop (Article 4) is preserved: the apply warning is non-blocking and the existing
  approval gate is enriched, never bypassed or auto-confirmed.
- Update `docs/specs/ROADMAP.md` progress when an epic's tasks complete.
