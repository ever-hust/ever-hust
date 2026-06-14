# Plan: 04 — Liveness DTO + Ghost-Job Freshness

| Field        | Value                              |
| ------------ | ---------------------------------- |
| Spec         | spec.md                            |
| Created      | 2026-06-14                         |
| Last updated | 2026-06-14                         |

## 1. Approach

The detection work already exists in **Ever Jobs** — its `liveness-http` checker computes a
per-job verdict (`active | expired | uncertain`) plus a machine code and a `checkedAt` timestamp.
What is missing is **carrying that verdict per-job on the public `POST /api/jobs/search` (and
job-by-id) DTO** that Hust consumes. So Hust can render nothing today and cannot warn a seeker
before they spend effort on a closed role. This epic is therefore mostly a **threading exercise**:
expose the field upstream (Ever Jobs, a separate repo) and consume it end-to-end in Hust — client
DTO type → synced `jobs` row → canvas card + detail badge → a non-blocking apply-flow warning.

The Ever Jobs DTO extension is **additive and backward-compatible**: a new optional `liveness`
object on `JobPostDto`. Because that change ships in the `ever-jobs` repo (Hust's only hard
external dependency, per constitution Article 2), this plan treats it as an **upstream
dependency** and makes the Hust side **forward-compatible first** — every Hust change tolerates a
missing/null `liveness` so Hust merges and ships green even before Ever Jobs deploys the field.
This honours standalone-first: Hust never breaks waiting on Ever Jobs.

On the Hust side the field flows through the existing, well-worn path. `packages/jobs-api`
(`JobPostDto` in `src/types.ts`) gains an optional `liveness` shape. The synced `jobs` table
(`packages/db/src/schema/jobs.ts`) gains **nullable** columns `livenessVerdict`,
`livenessCode`, `livenessCheckedAt`; `mapJobToDb` in `packages/triggers/src/map-job.ts` writes
them, and the two sync entry points (`packages/triggers/src/sync-jobs.ts` and
`apps/web/app/api/jobs/sync/route.ts`) carry them through the existing upsert untouched. A schema
push (`pnpm db:push`) lands the columns. Nullability is the whole migration story — old rows stay
valid, new rows fill in as Ever Jobs starts returning the field.

The read path is equally surgical. The search route
(`apps/web/app/api/jobs/search/route.ts`) already hand-selects columns into the `JobCardData`
shape; we add the three liveness columns to that `select` and to the `JobCardData` interface in
`apps/web/components/canvas/job-card.tsx`. A small, presentational `LivenessBadge` component (new,
under `apps/web/components/canvas/`) renders **active=green / expired=grey / uncertain=amber** and
is dropped into both the canvas `JobCard` and the canvas overlay `job-detail-panel.tsx`, plus the
server-rendered job detail page (`apps/web/app/(dashboard)/jobs/[id]/page.tsx`). Per the spec,
**`uncertain` is shown, never auto-hidden** — we never silently drop a possibly-live job.

The apply-flow warning is the one behaviour-bearing change, and it must respect Article 4
(human-in-the-loop). Hust already gates `applyJob` behind an explicit approval card
(`apps/web/components/chat/tool-approval.tsx`). We **enrich** that gate (not replace it): when the
target job's verdict is not `active`, the `applyJob` tool result
(`packages/ai/src/tools/apply-job.ts`) carries a `livenessWarning` field, the orchestrator narrates
it, and the approval card surfaces an amber caution line — **non-blocking**: the user can still
approve and proceed. We never auto-submit and never block; we inform.

Because the spec is small and the field is a corpus-level signal, this aligns cleanly with the
Partition Rule (Article 6): **detection stays in Ever Jobs**, Hust only renders + warns. It also
sets up, but does not implement, the legitimacy signal (epic #7) and the structured-output
contract (epic #5) — the liveness shape is deliberately a small whitelisted object that can later
be folded into a `#5` `Artifact` machine-summary without rework.

Testing follows Article 10: unit tests alongside `map-job.ts` and `jobs-api` types assert the
field maps and survives a missing-`liveness` DTO; a Playwright spec extends `tests/e2e/jobs.spec.ts`
to assert the badge renders and the apply warning shows for an `expired` fixture. CI must be green
on `develop` before the PR merges.

## 2. Phases

### Phase 1 — Upstream contract (Ever Jobs) + forward-compatible client type

- Goal: Ever Jobs surfaces `liveness` on the search/by-id DTO (additive); Hust's
  `packages/jobs-api` client type knows about it and tolerates its absence.
- Deliverables:
  - (Ever Jobs repo, tracked separately) `liveness: { verdict, code, checkedAt }` added to the
    public `JobPostDto`; existing consumers verified unaffected.
  - Hust: optional `liveness` shape on `JobPostDto` in `packages/jobs-api/src/types.ts` + a unit
    test in `packages/jobs-api/src/types.test.ts` proving a DTO **without** `liveness` still
    type-checks and parses.
- Exit criteria: Ever Jobs change is backward-compatible (no required field added); Hust client
  type compiles; `pnpm test -- --selectProjects jobs-api` green.

### Phase 2 — Persist liveness on the synced `jobs` row

- Goal: nullable liveness columns exist and the sync path writes them.
- Deliverables: three nullable columns on `packages/db/src/schema/jobs.ts`
  (`livenessVerdict`, `livenessCode`, `livenessCheckedAt`); `mapJobToDb`
  (`packages/triggers/src/map-job.ts`) maps them with null-coalescing; `pnpm db:push` applied;
  both sync entry points carry them through the existing upsert; unit test in
  `packages/triggers/src/map-job.test.ts` covers present + absent `liveness`.
- Exit criteria: schema pushed; `pnpm test -- --selectProjects triggers` green; an upsert of a DTO
  with and without `liveness` both succeed.

### Phase 3 — Render the liveness badge (canvas card + both detail views)

- Goal: a seeker sees a colour-coded freshness badge wherever a job is shown.
- Deliverables: new `apps/web/components/canvas/liveness-badge.tsx`; `JobCardData` extended in
  `apps/web/components/canvas/job-card.tsx`; the three columns added to the `select` in
  `apps/web/app/api/jobs/search/route.ts`; badge placed in `JobCard`,
  `apps/web/components/canvas/job-detail-panel.tsx`, and
  `apps/web/app/(dashboard)/jobs/[id]/page.tsx`.
- Exit criteria: badge renders active=green / expired=grey / uncertain=amber; `uncertain` jobs
  remain visible (never filtered); `pnpm lint` + `pnpm check-types` green.

### Phase 4 — Non-blocking apply-flow warning

- Goal: before an application is approved, a non-`active` job shows a clear, dismissible caution —
  the human-in-the-loop gate is enriched, never bypassed.
- Deliverables: `applyJob` tool (`packages/ai/src/tools/apply-job.ts`) returns a `livenessWarning`
  when the job verdict is not `active`; orchestrator system prompt
  (`packages/ai/src/prompts.ts`, Langfuse prompt `orchestrator-system`) documents the new field;
  `apps/web/components/chat/tool-approval.tsx` renders the caution line for `applyJob`.
- Exit criteria: approval card shows the amber warning for an expired/uncertain job and the user
  can still approve; no auto-submit; `pnpm test -- --selectProjects ai` green.

### Phase 5 — E2E + roadmap

- Goal: critical path is covered end-to-end and the roadmap reflects completion.
- Deliverables: Playwright assertions in `tests/e2e/jobs.spec.ts` (badge renders; apply warning
  shows for an `expired` fixture; `uncertain` job still listed); `docs/specs/ROADMAP.md` progress
  bumped.
- Exit criteria: `pnpm test:e2e` green locally and in CI; full CI green on `develop`.

## 3. Packages Touched

| Package                                                    | Change                                                                                              |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `packages/jobs-api`                                       | `src/types.ts`: add optional `liveness` to `JobPostDto`; `src/types.test.ts`: absence + presence.  |
| `packages/db`                                             | `src/schema/jobs.ts`: nullable `livenessVerdict` / `livenessCode` / `livenessCheckedAt` columns.   |
| `packages/triggers`                                       | `src/map-job.ts`: map liveness in `mapJobToDb`; `src/sync-jobs.ts` carries it; `map-job.test.ts`.  |
| `apps/web` (API)                                          | `app/api/jobs/search/route.ts`: select new columns; `app/api/jobs/sync/route.ts`: upsert carries.  |
| `apps/web` (canvas)                                       | new `components/canvas/liveness-badge.tsx`; extend `JobCardData` + render in `job-card.tsx`, `job-detail-panel.tsx`. |
| `apps/web` (jobs page)                                    | `app/(dashboard)/jobs/[id]/page.tsx`: render badge in header/sidebar.                              |
| `packages/ai`                                             | `src/tools/apply-job.ts`: emit `livenessWarning`; `src/prompts.ts`: document the field.            |
| `apps/web` (chat)                                         | `components/chat/tool-approval.tsx`: surface the non-blocking caution line for `applyJob`.         |
| `tests/e2e`                                               | `jobs.spec.ts`: badge + apply-warning assertions.                                                  |
| `ever-jobs` (separate repo)                               | Public `JobPostDto` gains additive `liveness`; **out of this repo's tree**, tracked upstream.      |

## 4. Dependencies

| Library                | Version  | Rationale                                                                 |
| ---------------------- | -------- | ------------------------------------------------------------------------ |
| (none new)             | —        | Pure threading + a presentational component; reuses `zod`, `drizzle-orm`, `@ever-hust/ui` already in-tree. No new direct dependency is added (Article 10.5). |

**Upstream epic dependencies (not libraries):**

- **Ever Jobs API** (Article 2 hard dep): must add `liveness` to its public DTO. Hust ships
  forward-compatible so this is not a hard *blocker* — the field renders once Ever Jobs returns it.
- **#5 structured-output** (shared contract): the `liveness` shape is kept small + whitelisted so
  it can later be expressed as a `#5` `Artifact<"liveness", …>` machine-summary without rework.
  No code dependency taken now (avoids blocking on #5).
- **#3 evaluation engine / #6 guardrails**: not required by this epic. Liveness is a corpus
  signal, independent of per-user evaluation (#3) and grounding guardrails (#6). The apply-flow
  warning reuses the existing approval gate, not #6 machinery.
- **#7 legitimacy radar**: explicitly **out of scope** (different signal). Liveness columns are
  named distinctly so #7 can add `legitimacy*` columns later without collision.

## 5. Risks & Mitigations

| Risk                                                                  | Likelihood | Impact | Mitigation                                                                                 |
| -------------------------------------------------------------------- | ---------- | ------ | ------------------------------------------------------------------------------------------ |
| Ever Jobs DTO change lags / never lands                              | M          | M      | Hust ships forward-compatible: every change tolerates null `liveness`; badge simply hides. |
| Ever Jobs DTO breaks existing consumers (non-additive)              | L          | H      | Field is **optional** and additive; verify existing consumers in the EJ repo before merge. |
| Auto-hiding `uncertain` jobs silently drops live roles               | M          | H      | Spec hard rule: `uncertain` is **shown, never hidden**; E2E asserts an uncertain job lists.|
| Apply warning misread as a hard block (hurts conversion)            | L          | M      | Warning is non-blocking + dismissible; copy says "may be closed — you can still apply".     |
| Stale `livenessCheckedAt` shown as authoritative                    | M          | L      | Badge tooltip shows "checked <relative time> ago"; treat old checks as informational.      |
| Mass re-sync needed to backfill verdicts                            | M          | L      | Columns nullable; the existing 15-min sync upserts naturally backfill over time, no batch. |

## 6. Rollback Plan

Feature is additive and disable-able without data loss:

- **UI**: remove the `<LivenessBadge>` placements and the `livenessWarning` line in
  `tool-approval.tsx` — the columns and DTO field remain, just unrendered. A one-line guard
  (render only when `verdict != null`) already makes the badge invisible if data is absent.
- **Apply warning**: drop the `livenessWarning` branch in `apply-job.ts`; the approval gate
  reverts to its prior copy. No state change to revert.
- **DB**: the three columns are nullable and unreferenced by writes once mapping is removed;
  they can be left in place (zero-cost) or dropped in a later migration. **Do not** drop columns
  as part of rollback (avoids data loss / Article 9 reversibility).
- **Upstream**: the Ever Jobs DTO field is optional; reverting Hust does not require an Ever Jobs
  rollback.

## 7. Migration Plan

- **Schema**: `pnpm db:push` adds three **nullable** columns to `jobs`. No backfill required —
  existing rows keep `NULL` and the badge hides for them; the running 15-minute sync
  (`packages/triggers/src/sync-jobs.ts`) populates verdicts on the next upsert once Ever Jobs
  returns the field.
- **Consumers**: `JobCardData` gains optional fields; all readers default to "no badge" when
  null, so no consumer is forced to change in lockstep.
- **Versioning**: liveness shape kept minimal so a future #5 `schemaVersion` envelope can wrap it
  without altering stored columns.

## 8. Open Questions for Plan

- **Q1 — Code field granularity:** Ever Jobs' `liveness.code` is a machine code. Do we store the
  raw code as `text` and map to friendly tooltip copy in Hust, or have Ever Jobs return a
  human-readable reason too? (Leaning: store raw `code` as text, format in Hust.)
- **Q2 — Badge for unknown/`NULL`:** when a job predates the field, show **nothing** (current
  plan) or a neutral "freshness unknown" chip? (Leaning: show nothing to avoid noise.)
- **Q3 — Detail-page apply button:** the server-rendered `jobs/[id]/page.tsx` has a direct
  external Apply link (no approval gate). Do we add an inline non-blocking caution there too, or
  is the badge sufficient on that surface? (Leaning: badge + a small inline note next to the
  Apply button; no gate since that path is a plain external link.)
