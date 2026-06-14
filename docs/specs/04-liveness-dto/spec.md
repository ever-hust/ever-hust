# Spec #4 — Per-Job Liveness on the Search DTO

> Status: Draft · Owner: Ever Jobs → Hust · Effort: S (EJ) + S (Hust) · Phase 1 · Depends on: —

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
