# Plan: 07 — Posting-Legitimacy / Ghost-Job Radar

| Field        | Value                              |
| ------------ | ---------------------------------- |
| Spec         | spec.md                            |
| Created      | 2026-06-14                         |
| Last updated | 2026-06-14                         |

## 1. Approach

This epic ships the **one net-new data capability** in the roadmap: a corpus-level
**legitimacy signal** computed in **Ever Jobs**, plus a Hust **trust badge** that renders it. The
signal answers "is this posting *real / worth trusting*?" — deliberately **orthogonal** to the
per-user fit score from the evaluation engine (#3). It is never folded into the fit number; it sits
*beside* it as **Block G** of the evaluation.

Per the Partition Rule (constitution Article 6), the detection work belongs in **Ever Jobs**: it is
whole-market, corpus-level, anonymous (apply-control analysis, posting age + recheck history,
reposting patterns from the dedup ledger, salary-vagueness, employer red flags). Ever Jobs already
owns the dedup/recheck ledger and the liveness checker that feed this; the legitimacy plugin reuses
those inputs. Ever Jobs emits a small, additive object on its public DTO:
`legitimacy: { tier, score, reasons[] }`, with `tier ∈ active | caution | suspicious`. That change
ships in the separate `ever-jobs` repo and is treated here as an **upstream dependency** (the only
hard external dependency, Article 2).

On the Hust side this is mostly a **threading + presentation exercise**, mirroring the path the
liveness epic (#4) already laid down. The field flows: `packages/jobs-api` `JobPostDto`
(`src/types.ts`) gains an optional `legitimacy` shape → the synced `jobs` row
(`packages/db/src/schema/jobs.ts`) gains **nullable** columns `legitimacyTier`, `legitimacyScore`,
`legitimacyReasons` → `mapJobToDb` (`packages/triggers/src/map-job.ts`) writes them and the two sync
entry points (`packages/triggers/src/sync-jobs.ts`, `apps/web/app/api/jobs/sync/route.ts`) carry
them through the existing upsert untouched → a `pnpm db:push` lands the columns → the search route
(`apps/web/app/api/jobs/search/route.ts`) and `getJobDetailsTool`
(`packages/ai/src/tools/get-job-details.ts`) select them → a new presentational `TrustBadge`
(`apps/web/components/canvas/trust-badge.tsx`) renders them on the card and detail surfaces.

**Hust ships forward-compatible**: every change tolerates a missing/null `legitimacy`, so Hust
merges and runs green on `develop` even before Ever Jobs deploys the field (standalone-first,
Article 2). A `NULL` tier simply renders no badge — no layout shift, no placeholder noise.

Two constitutional invariants shape the UX. First, the badge copy is **benign and explained** —
**never red, never the word "scam"**: `active` → "Verified-active", `caution` → "Worth a quick
check", `suspicious` → "Some signals to review", each with a one-line "why" drawn from `reasons[]`.
Hust re-expresses the signal as **its own** benign design; the underlying weighting is Ever Jobs'.
Second, the signal stays **orthogonal to the fit score** (#3): the evaluation tool
(`packages/ai/src/tools/evaluate-job.ts`, from epic #3) renders Block G *from the job's legitimacy
columns* and must **not** read it into any dimension weight or the 0–100 number. Block G is
presentational context, not an input.

Because the legitimacy artifact is a small whitelisted object, it conforms to the structured-output
contract (#5): the `legitimacy` shape is kept minimal so it can later be wrapped in a `#5`
`Artifact<"legitimacy", …>` machine-summary without rework. No code dependency on #5 is taken now
(avoids blocking on it). Grounding/no-invent (Article 7) applies to the badge "why" line — it only
surfaces reasons Ever Jobs actually returned; Hust never invents a reason.

For the chat surface, a thin orchestrator path lets the model narrate legitimacy on demand. Rather
than a heavyweight new tool, the existing `getJobDetailsTool` already returns the job row and is the
natural carrier — it gains the three legitimacy fields, the orchestrator system prompt
(`packages/ai/src/prompts.ts`, Langfuse `orchestrator-system`) documents how to phrase the tier
benignly, and the canvas-sync hook (`apps/web/hooks/use-canvas-sync.ts`) surfaces the structured
result so the badge appears when a single job is opened from chat.

Testing follows Article 10: unit tests alongside `jobs-api` types (`types.test.ts`), `map-job.ts`
(`map-job.test.ts`), and a `trust-badge` render test; a Playwright spec (`tests/e2e/jobs.spec.ts`)
asserts a `suspicious` fixture shows the benign badge with a "why", a `caution`/`active` fixture
shows the right copy, and that the legitimacy badge never alters the visible fit score. CI (lint,
type-check, unit, E2E) must be green on `develop` before the PR merges.

## 2. Phases

### Phase 1 — Upstream contract (Ever Jobs) + forward-compatible client type

- Goal: Ever Jobs surfaces `legitimacy` on the search/by-id DTO (additive); Hust's
  `packages/jobs-api` client type knows about it and tolerates its absence.
- Deliverables:
  - (Ever Jobs repo, tracked separately) new `legitimacy-corpus` feature plugin (alongside
    dedup/liveness/merge) that emits `legitimacy: { tier: 'active'|'caution'|'suspicious', score,
    reasons[] }` on the public `JobPostDto`; existing consumers verified unaffected.
  - Hust: optional `legitimacy` shape on `JobPostDto` in `packages/jobs-api/src/types.ts` + a unit
    test in `packages/jobs-api/src/types.test.ts` proving a DTO **without** `legitimacy` still
    type-checks.
- Exit criteria: Ever Jobs change is backward-compatible (no required field added); Hust client
  type compiles; `pnpm test -- --selectProjects jobs-api` green.

### Phase 2 — Persist legitimacy on the synced `jobs` row

- Goal: nullable legitimacy columns exist and the sync path writes them.
- Deliverables: three nullable columns on `packages/db/src/schema/jobs.ts`
  (`legitimacyTier`, `legitimacyScore`, `legitimacyReasons`); `mapJobToDb`
  (`packages/triggers/src/map-job.ts`) maps them with null-coalescing; `pnpm db:push` applied; both
  sync entry points carry them through the existing upsert; unit test in
  `packages/triggers/src/map-job.test.ts` covers present + absent `legitimacy`.
- Exit criteria: schema pushed; `pnpm test -- --selectProjects triggers` green; an upsert of a DTO
  with and without `legitimacy` both succeed.

### Phase 3 — Render the benign trust badge (canvas card + both detail views)

- Goal: a seeker sees a benign, explained legitimacy badge wherever a job is shown.
- Deliverables: new `apps/web/components/canvas/trust-badge.tsx`; `JobCardData` extended in
  `apps/web/components/canvas/job-card.tsx`; the three columns added to the `select` in
  `apps/web/app/api/jobs/search/route.ts`; badge placed in `JobCard`,
  `apps/web/components/canvas/job-detail-panel.tsx`, and
  `apps/web/app/(dashboard)/jobs/[id]/page.tsx`.
- Exit criteria: badge renders benign copy per tier with a one-line "why"; **never red, never
  "scam"**; a `NULL` tier renders nothing with no layout shift; `pnpm lint` + `pnpm check-types`
  green.

### Phase 4 — Chat narration + Block-G orthogonality

- Goal: the orchestrator can narrate legitimacy benignly on demand, and the evaluation engine's
  Block G renders the signal **beside** the fit score without ever folding it in.
- Deliverables: `getJobDetailsTool` (`packages/ai/src/tools/get-job-details.ts`) selects the three
  legitimacy columns and returns them; orchestrator system prompt
  (`packages/ai/src/prompts.ts`, Langfuse `orchestrator-system`) documents benign phrasing and the
  orthogonality rule; `apps/web/hooks/use-canvas-sync.ts` surfaces the legitimacy fields when a
  single job is opened; Block-G renderer in the evaluation drawer reads the job's legitimacy columns
  (coordinated with #3) and is asserted to leave the score untouched.
- Exit criteria: `getJobDetails` returns legitimacy fields; prompt covers benign copy +
  orthogonality; Block G renders from columns and does not enter the score math;
  `pnpm test -- --selectProjects ai` green.

### Phase 5 — E2E + roadmap

- Goal: critical path is covered end-to-end and the roadmap reflects completion.
- Deliverables: Playwright assertions in `tests/e2e/jobs.spec.ts` (suspicious fixture → benign
  badge + "why"; active/caution copy; score unchanged by legitimacy); `docs/specs/ROADMAP.md`
  progress bumped.
- Exit criteria: `pnpm test:e2e` green locally and in CI; full CI green on `develop`.

## 3. Packages Touched

| Package                                                    | Change                                                                                              |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `packages/jobs-api`                                       | `src/types.ts`: add optional `legitimacy` to `JobPostDto`; `src/types.test.ts`: absence + presence. |
| `packages/db`                                             | `src/schema/jobs.ts`: nullable `legitimacyTier` / `legitimacyScore` / `legitimacyReasons` columns.  |
| `packages/triggers`                                       | `src/map-job.ts`: map legitimacy in `mapJobToDb`; `src/sync-jobs.ts` carries it; `map-job.test.ts`. |
| `apps/web` (API)                                          | `app/api/jobs/search/route.ts`: select new columns; `app/api/jobs/sync/route.ts`: upsert carries.   |
| `apps/web` (canvas)                                       | new `components/canvas/trust-badge.tsx`; extend `JobCardData` + render in `job-card.tsx`, `job-detail-panel.tsx`. |
| `apps/web` (jobs page)                                    | `app/(dashboard)/jobs/[id]/page.tsx`: render badge in header/sidebar.                                |
| `packages/ai`                                             | `src/tools/get-job-details.ts`: select + return legitimacy; `src/prompts.ts`: document benign copy + orthogonality. |
| `apps/web` (canvas sync)                                  | `hooks/use-canvas-sync.ts`: surface legitimacy in the `getJobDetails` result path.                  |
| `packages/ai` / `apps/web` (eval Block G)                | `src/tools/evaluate-job.ts` + evaluation drawer (from #3): render Block G from columns; **never** read into score. |
| `tests/e2e`                                               | `jobs.spec.ts`: benign badge + "why" + score-unchanged assertions.                                  |
| `ever-jobs` (separate repo)                               | new `legitimacy-corpus` plugin + additive `legitimacy` on the public `JobPostDto`; **out of this repo's tree**. |

## 4. Dependencies

| Library                | Version  | Rationale                                                                 |
| ---------------------- | -------- | ------------------------------------------------------------------------ |
| (none new)             | —        | Pure threading + a presentational component; reuses `zod`, `drizzle-orm`, `@ever-hust/ui` (Badge, Tooltip), `lucide-react` already in-tree. No new direct dependency is added (Article 10.5). |

**Upstream epic dependencies (not libraries):**

- **Ever Jobs API** (Article 2 hard dep): must add the `legitimacy-corpus` plugin + the additive
  `legitimacy` object on its public DTO. Hust ships forward-compatible, so this is not a hard
  *blocker* — the badge renders once Ever Jobs returns the field.
- **#5 structured-output** (shared contract): the `legitimacy` shape is kept small + whitelisted so
  it can later be expressed as a `#5` `Artifact<"legitimacy", …>` without rework. No code dependency
  taken now (avoids blocking on #5).
- **#3 evaluation engine** (renders alongside): Block G is hosted by the evaluation drawer / 
  `evaluateJob`. This epic provides the **data + badge**; #3 provides the host surface. The signal
  is rendered **orthogonal** — it must never enter #3's weighted dimensions or 0–100 score. If #3 is
  not yet merged, Phases 1–3 still ship (card/detail badge); the Block-G wiring (Phase 4) lands once
  #3's drawer exists.
- **#6 guardrails** (grounded generation): the badge "why" line surfaces only reasons Ever Jobs
  returned — no invented reasons (Article 7). No #6 machinery is imported; the discipline is applied
  in the renderer + prompt.
- **#4 liveness** (sibling signal): liveness (`active | expired | uncertain`) is a *different*
  signal (reachable) from legitimacy (trustworthy). Columns are named distinctly (`legitimacy*` vs
  `liveness*`) so they coexist without collision; the `TrustBadge` is separate from `LivenessBadge`.

## 5. Risks & Mitigations

| Risk                                                                  | Likelihood | Impact | Mitigation                                                                                 |
| -------------------------------------------------------------------- | ---------- | ------ | ------------------------------------------------------------------------------------------ |
| Ever Jobs `legitimacy-corpus` plugin lags / never lands              | M          | M      | Hust ships forward-compatible: every change tolerates null `legitimacy`; badge simply hides. |
| Legitimacy bleeds into the #3 fit score (loses orthogonality)        | M          | H      | Block G reads job columns only; an E2E asserts the visible score is identical with/without legitimacy; code review gate. |
| Badge reads as accusatory ("scam"/red) and defames an employer       | L          | H      | Hard copy rule: benign, explained, **never red, never "scam"**; copy reviewed; unit test asserts the rendered strings. |
| Ever Jobs DTO change breaks existing consumers (non-additive)        | L          | H      | Field is **optional** and additive; verify existing consumers in the EJ repo before merge. |
| Inventing a "why" reason not returned by Ever Jobs                    | L          | M      | Renderer maps only the returned `reasons[]`; no fallback text fabricated; grounded (Article 7). |
| Stale `legitimacyScore` shown as authoritative                       | M          | L      | Tier copy is qualitative ("worth a quick check"); score is internal/optional, not surfaced as a hard number. |
| Mass re-sync needed to backfill tiers                                | M          | L      | Columns nullable; the existing 15-min sync upserts naturally backfill over time, no batch. |

## 6. Rollback Plan

Feature is additive and disable-able without data loss:

- **UI**: remove the `<TrustBadge>` placements and the Block-G renderer branch — the columns and DTO
  field remain, just unrendered. The badge already self-hides when `tier == null` (one-line guard).
- **Chat**: drop the legitimacy fields from the `getJobDetailsTool` return and the prompt note; the
  tool reverts to its prior shape. No state to revert.
- **DB**: the three columns are nullable and unreferenced by writes once mapping is removed; they can
  be left in place (zero-cost) or dropped in a later migration. **Do not** drop columns as part of
  rollback (avoids data loss / Article 9 reversibility).
- **Upstream**: the Ever Jobs DTO field is optional; reverting Hust does not require an Ever Jobs
  rollback.

## 7. Migration Plan

- **Schema**: `pnpm db:push` adds three **nullable** columns to `jobs`. No backfill required —
  existing rows keep `NULL` and the badge hides for them; the running 15-minute sync
  (`packages/triggers/src/sync-jobs.ts`) populates tiers on the next upsert once Ever Jobs returns
  the field.
- **Consumers**: `JobCardData` gains optional fields; all readers default to "no badge" when null,
  so no consumer is forced to change in lockstep.
- **Versioning**: legitimacy shape kept minimal (`tier`, `score`, `reasons[]`) so a future #5
  `schemaVersion` envelope can wrap it without altering stored columns.

## 8. Open Questions for Plan

- **Q1 — `reasons[]` granularity:** does Ever Jobs return machine reason codes (e.g.
  `off_platform_redirect`, `perpetual_req`) that Hust maps to friendly "why" copy, or
  already-human-readable strings? (Leaning: store raw codes in `legitimacyReasons` jsonb, map to
  benign copy in Hust so wording stays on-brand.)
- **Q2 — Score exposure:** do we ever surface the numeric `legitimacyScore` to the user, or keep it
  internal and only show the qualitative tier + "why"? (Leaning: keep the number internal; show tier
  + one-line reason only, to avoid a false-precision "trust score".)
- **Q3 — `suspicious` visibility:** like liveness `uncertain`, is a `suspicious` job ever filtered,
  or always shown with the badge? (Leaning: always shown, never auto-hidden — the badge informs;
  hiding would silently drop possibly-real roles, contrary to human-in-the-loop.)
- **Q4 — Block-G timing:** if #3 (evaluation drawer) is not merged when this epic ships, do we land
  Phases 1–3 + chat narration first and wire Block G in a follow-up once the drawer exists? (Leaning:
  yes — the card/detail badge stands alone; Block G is additive on #3's surface.)
