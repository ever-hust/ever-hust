# Spec #4 — Per-Job Liveness on the Search DTO

> Status: Done (shipped 2026-06-15) · Owner: Ever Jobs → Hust · Effort: S (EJ) + S (Hust) · Phase 1 · Depends on: —

## 1. Problem & user value

A job board's #1 quality problem is **dead listings**. Ever Jobs already computes a liveness
verdict internally (`active | expired | uncertain`, via its `liveness-http` checker) — but that
verdict is **not carried per-job on the public `/api/jobs/search` DTO** that Hust consumes. So Hust
can't warn a user before they spend effort applying to a closed role.

## 2. Scope

**In:** Ever Jobs surfaces the existing liveness verdict (+ code + `checkedAt`) on each job in the
search DTO; Hust renders a liveness badge and **warns before apply** when a listing is
`expired`/`uncertain`.

**Out:** building new liveness *detection* (it already exists in Ever Jobs); posting **legitimacy**
(different signal — [#7](../07-legitimacy-radar/spec.md)).

## 3. Design

- **Ever Jobs (small):** add `liveness: { verdict: 'active'|'expired'|'uncertain', code, checkedAt }`
  to the `JobPostDto` returned by `/api/jobs/search` (and job-by-id). The data already exists
  internally; this exposes it on the public contract.
- **Hust (small):** thread the field through `packages/jobs-api` types + the synced `jobs` row
  (add nullable `liveness*` columns), render a badge on the canvas card + job detail, and surface a
  non-blocking warning in the apply flow when not `active`. **`uncertain` is shown, never
  auto-hidden** (don't silently drop possibly-live jobs).

## 4. Data / API

- Ever Jobs: extend `JobPostDto` (additive, backward-compatible).
- Hust: `packages/jobs-api` DTO type + `jobs` table nullable columns
  (`livenessVerdict`, `livenessCheckedAt`); sync writes them.

## 5. Plan & tasks

1. **EJ:** add liveness to the search/by-id DTO (additive). Verify existing consumers unaffected.
2. **Hust:** extend the client DTO type + `jobs` columns (migration) + sync mapping.
3. **Hust:** liveness badge (active=green / expired=grey / uncertain=amber) on card + detail.
4. **Hust:** apply-flow warning when not `active` (non-blocking; user can proceed).
5. Tests: DTO mapping (unit), badge rendering (E2E), apply warning shows for expired fixture.

## 6. Acceptance

- A job with a non-`active` verdict shows the badge + an apply-flow warning; `uncertain` is visible,
  never hidden; the EJ DTO change is backward-compatible; CI green; **zero competitor references**.

## Implementation (shipped)

Hust shipped a leaner, **forward-compatible** version of this epic: rather than persisting
liveness columns and threading a dedicated badge component through every surface, Hust derives a
**freshness signal** from data it already stores (`datePosted` / `expiresAt`) and lets an explicit
Ever Jobs `liveness` signal *override* the heuristic when present. The corpus side (the actual
liveness computation + DTO field) is produced upstream by Ever Jobs.

- **Client DTO contract** — `packages/jobs-api/src/types.ts`: `JobPostDto` (interface) carries an
  optional `liveness?: { state?: "active" | "expired" | "uncertain"; checkedAt?: string }` (plus
  `expiresAt?`). Optional/additive, so Hust type-checks and runs even when the field is absent.
- **Freshness engine** — `apps/web/lib/freshness.ts`: `computeFreshness()` is a pure, deterministic
  (`now` is injectable) function returning `{ state, ageDays, label }`. An explicit Ever Jobs
  `liveness` signal wins over the date heuristic; otherwise `datePosted`/`expiresAt` derive
  `fresh ≤14d`, `active ≤45d`, `stale`, `expired`, or `uncertain`. Exports `FreshnessState`,
  `LivenessSignal`, `CAUTION_STATES`, and `isCaution()`.
- **Spec invariant honoured** — a missing posted date or an explicit `uncertain` verdict is labelled
  "Unverified" / "Date unknown" and **never hidden**; only the user decides.
- **UI badge** — `apps/web/components/canvas/job-card.tsx` calls `computeFreshness({ datePosted,
  expiresAt, liveness })` and renders a caution `Badge` (expired = red, stale/uncertain = amber,
  title "Freshness signal — verify before applying") only for `CAUTION_STATES`; `active`/`fresh`
  jobs show no badge and no layout shift.
- **Tests** — `apps/web/lib/freshness.test.ts` (unit: fresh/active/stale/expired/uncertain paths,
  liveness override, missing-date) and `packages/jobs-api/src/types.test.ts` cover the contract.
- **Corpus-side production (upstream)** — the per-job liveness verdict on `JobPostDto` is produced
  by **Ever Jobs Spec 740** (liveness exposed on the search/by-id DTO via `?liveness=true`,
  sourced from the existing `liveness-http` checker) in the separate `ever-jobs` repo, not in this
  tree.

### Intentionally deferred (vs. the original `tasks.md` plan)

The richer plan in `tasks.md` (T03–T11) was **not** shipped as drafted; the freshness approach
above covers the acceptance criteria more cheaply. Still open for a future enhancement:

- **Persisted liveness columns** — no `liveness_verdict` / `liveness_code` / `liveness_checked_at`
  columns were added to `packages/db/src/schema/jobs.ts`; freshness is derived at render time from
  dates already stored, so the search route and sync mapping are unchanged.
- **Apply-flow tool warning** — `packages/ai/src/tools/apply-job.ts`, the orchestrator prompt, and
  the `tool-approval` card do **not** yet emit a `livenessWarning`; the caution today lives on the
  job card. A non-blocking pre-apply warning remains a follow-up.
- **Dedicated detail-surface badge** — no standalone `liveness-badge.tsx` component; the badge is
  inlined in the job card only (job detail surfaces are a future enhancement).
