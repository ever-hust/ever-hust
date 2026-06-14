# Plan: 15 — Negotiation Brief

| Field        | Value                              |
| ------------ | ---------------------------------- |
| Spec         | spec.md                            |
| Created      | 2026-06-14                         |
| Last updated | 2026-06-14                         |

## 1. Approach

The offer stage is the highest-leverage, most-stressful moment of the search, and Hust
already owns every input it needs to coach it well: market compensation data (synced from
the **Ever Jobs** corpus into the local `jobs` table and exposed by the `analyzeJobs`
endpoint), the user's level/skills (`users` row), and — where present — the per-(user, job)
fit verdict written by the evaluation engine (epic #3), whose `blocks.compDemand` summary
and `budgetFit` flag are the natural anchor for "is this offer fair?". We add a single new
agentic tool, `negotiationCoach`, that fuses those inputs into a **cited** target range,
a small library of grounded negotiation scripts (counter, competing-offer, non-comp asks),
and an offer-stage checklist — emitting a Zod-validated `negotiationBrief` artifact
alongside the prose (constitution Article 5).

The market range is **computed, not invented**. We reuse the proven aggregation approach
already shipped in `salary-insights.ts` + `salary-helpers.ts` (annualise → midpoint →
median/percentiles over the local `jobs` table), refactored into a shared, db-free
`compRange()` helper so the same math powers both tools and is unit-testable against
fixtures. Every figure the brief surfaces carries a `basis` field (sample size, the title
and filters it was computed from) so the number traces back to real corpus rows. When the
sample is thin or absent, the tool says so honestly and degrades to the user's own target
rather than fabricating a figure (Article 7, grounded / no-invent).

The scripts are **drafts the model fills in from grounded context** — the same pattern as
`interviewPrep` and `generateCoverLetter`: the tool returns structured context + an
`instruction` block, and the orchestrator writes the prose under the system prompt's
no-invent rules. Hust sends nothing on the user's behalf: there is no submit path, no
email, no auto-send. The user copies a script and uses it themselves — human-in-the-loop is
structural here because the tool literally has no outbound channel (Article 4).

Persistence mirrors the evaluation engine's pattern: a new `negotiationBriefs` table stores
the validated machine summary so a brief survives the chat session, can be re-opened from
the application's `offer` stage, and becomes queryable for the learning loop (#13) and
funnel analytics (#8) later. The table denormalises the headline range fields and stores
the full artifact payload as `jsonb`, exactly as `evaluations` does for its blocks.

On the canvas, the brief surfaces through the existing `useCanvasSync` switch: we add a
`case "negotiationCoach"` that drops a `NegotiationBriefCard` overlay (built from the
`salary-insights-card.tsx` template — range bar, stat boxes, collapsible sections). On the
applications surface, the offer-stage detail gets a panel that fetches the stored brief by
`applicationId`/`jobId` and renders the same card, plus copy-to-clipboard script blocks.

Standalone-first holds throughout (Article 2): the only external dependency is the Ever Jobs
API, already wrapped by `packages/jobs-api` with its circuit breaker; no Gauzy seam is
touched. Subscription gating follows `interviewPrep` — Pro-only (`users.subscriptionStatus`
in `active`/`past_due`), with a graceful `requiresUpgrade` response for free-tier users.

Dependencies on upstream epics are explicit: **#5 structured-output** supplies the
`defineArtifact`/`assertArtifact`/`runValidatedGeneration` contract this brief plugs into;
**#3 evaluation engine** supplies the optional `evaluations.blocks.compDemand` anchor (the
tool reads it when present and works without it); **#1 harvest** keeps the `jobs` table's
compensation columns populated; **#6 guardrails** supplies the grounding/no-invent helpers
the script generation leans on. The build is sequenced so the tool + math + artifact land
and are tested before any UI is wired, keeping each phase independently shippable.

## 2. Phases

### Phase 1 — Comp-range math + artifact contract

- Goal: Establish the grounded, cited market-range computation and the Zod artifact shape,
  with no DB write and no UI yet.
- Deliverables:
  - `compRange()` helper extracted alongside the existing salary math (annualise/median/
    percentiles) so it is db-free and fixture-testable, returning a range plus a `basis`
    (sample size, title, filters) for citation.
  - `negotiationBrief` artifact defined via `defineArtifact` in
    `packages/ai/src/structured/schemas/negotiation.ts`, exported from the structured
    barrel, with `NEGOTIATION_SCHEMA_VERSION = 1`.
  - Unit tests for the math (fixture market data → expected range/percentiles, empty-sample
    path) and for artifact validation (valid passes, invalid throws `ArtifactValidationError`).
- Exit criteria: `pnpm test -- --selectProjects ai` green for the new helper + schema; no
  invented figures possible (empty sample yields a `null` range + honest `basis`, never a
  number).

### Phase 2 — `negotiationCoach` tool + persistence

- Goal: Ship the agentic tool, register it, persist the validated brief, document it in the
  system prompt.
- Deliverables:
  - `packages/ai/src/tools/negotiation-coach.ts` — `tool({ description, inputSchema, execute })`
    with `.max()`-bounded inputs, server-injected `userId`, Pro-gating, `compRange()`-backed
    cited range, the #3 `compDemand` anchor when present, structured script context +
    `instruction`, and the validated `negotiationBrief` artifact in its result.
  - Export from `packages/ai/src/tools/index.ts`; register as `negotiationCoach` in
    `packages/ai/src/agents/orchestrator.ts` (inject `userId`, inside the `tools` object).
  - New `negotiationBriefs` table (`packages/db/src/schema/negotiation-briefs.ts`) exported
    from `packages/db/src/schema/index.ts`; pushed with `pnpm db:push`.
  - System-prompt section documenting the tool + its no-invent / human-in-the-loop rules in
    `packages/ai/src/prompts.ts` (and the mirrored Langfuse `orchestrator-system` prompt).
  - Unit tests for the tool (Pro-gate, cited-range happy path, thin-sample honesty,
    artifact-emitted) and a prompts test asserting the tool is documented.
- Exit criteria: `pnpm test -- --selectProjects ai` and `--selectProjects db` green; tool
  callable from a chat turn; a brief row persists; prompt mentions `negotiationCoach`.

### Phase 3 — Canvas + offer-stage UI

- Goal: Surface the brief in the live canvas and on the offer-stage application detail, with
  copy-able scripts and a read API.
- Deliverables:
  - `apps/web/components/canvas/negotiation-brief-card.tsx` (range bar + stat boxes +
    collapsible script/checklist sections, modelled on `salary-insights-card.tsx`).
  - `case "negotiationCoach"` in `apps/web/hooks/use-canvas-sync.ts` (+ `negotiationBrief`
    canvas state and `clearNegotiationBrief`).
  - Offer-stage panel rendering the stored brief on the application detail, fetched via a new
    `apps/web/app/api/user/negotiation-brief/route.ts` (GET by jobId; `requireSessionUser`,
    `applyRateLimit`, Zod query schema).
  - Playwright E2E covering the offer-stage flow (brief renders, figures shown, scripts
    copyable, zero auto-send affordance).
- Exit criteria: `pnpm test:e2e` green for the new spec; manual check shows a cited range +
  scripts at the offer stage; lint + type-check clean.

## 3. Packages Touched

| Package                                                              | Change                                                                                                                                                                  |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/ai`                                                        | New tool `src/tools/negotiation-coach.ts` (+ export in `src/tools/index.ts`); register in `src/agents/orchestrator.ts`; comp-range helper near `src/tools/salary-helpers.ts`; new artifact `src/structured/schemas/negotiation.ts` (+ barrel export in `src/structured/index.ts`); doc the tool in `src/prompts.ts`. |
| `packages/db`                                                        | New table `src/schema/negotiation-briefs.ts` + export in `src/schema/index.ts`; `pnpm db:push`.                                                                        |
| `apps/web`                                                           | `components/canvas/negotiation-brief-card.tsx`; `case "negotiationCoach"` + state in `hooks/use-canvas-sync.ts`; offer-stage panel on `app/(dashboard)/applications/page.tsx`; read API `app/api/user/negotiation-brief/route.ts`; Zod in `lib/api-schemas.ts`. |
| `packages/jobs-api`                                                  | (no change) — `everJobsClient.analyzeJobs` / `searchJobs` consumed as-is via the synced `jobs` table; circuit breaker + retry already present.                          |
| `packages/ui`                                                        | (no change) — reuse `@ever-hust/ui/{card,badge,button,dialog}` + `cn()`; add a new component only if a primitive is missing.                                            |

## 4. Dependencies

| Library                | Version  | Rationale                                                                                  |
| ---------------------- | -------- | ----------------------------------------------------------------------------------------- |
| `ai` (Vercel AI SDK)   | existing | `tool()` definition + orchestrator `streamText`; already the house AI runtime.             |
| `zod`                  | existing | Bounded tool input schema + the `negotiationBrief` artifact schema (Article 5/8).          |
| `drizzle-orm`          | existing | `negotiationBriefs` table + queries; same patterns as `evaluations`/`applications`.        |
| `@ever-hust/ai/structured` | in-repo (#5) | `defineArtifact` / `assertArtifact` / `runValidatedGeneration` contract for the brief. |
| `lucide-react`         | existing | Card iconography, matching `salary-insights-card.tsx`.                                     |

No new third-party direct dependencies (Article 10.5).

## 5. Risks & Mitigations

| Risk                                                              | Likelihood | Impact | Mitigation                                                                                                   |
| ---------------------------------------------------------------- | ---------- | ------ | ----------------------------------------------------------------------------------------------------------- |
| Thin/absent comp data for a niche role → temptation to invent    | M          | H      | `compRange()` returns `null` + honest `basis` on small/empty samples; tool surfaces uncertainty, never a fabricated number; unit test asserts the empty-sample path. |
| Model invents salary figures or quotes in scripts                | M          | H      | Scripts are draft-from-grounded-context only; #6 guardrails grounding helpers + a system-prompt no-invent clause; range figures come only from `compRange().basis`. |
| User reads the brief as legal/financial advice                   | L          | M      | Brief copy carries a plain "not legal advice" caveat (spec §2 Out); checklist framed as prompts, not directives. |
| Ever Jobs corpus stale → off-market range                        | L          | M      | `basis` cites sample size + recency-bounded query; circuit breaker in `packages/jobs-api`; degrade to user's own target when sample < threshold. |
| `negotiationBriefs` jsonb shape drifts from the Zod artifact     | L          | M      | `schemaVersion` column mirrors `EVALUATION` pattern; row written only after `assertArtifact` passes; DX interface kept in sync with a comment, same as `evaluations.ts`. |
| Brief perceived as an auto-send/auto-negotiate feature           | L          | H      | No outbound channel exists in the tool or API; E2E asserts the offer-stage UI has zero send affordance (Article 4). |

## 6. Rollback Plan

- The tool is additive: remove `negotiationCoach` from the `tools` object in
  `orchestrator.ts` (and the prompt section) to disable it instantly — no other tool depends
  on it, and the orchestrator keeps streaming.
- The canvas `case` and offer-stage panel are guarded by the brief being present; with the
  tool removed no `negotiationCoach` results arrive and the UI never renders. The read API
  returns an empty/404 result gracefully.
- The `negotiationBriefs` table is write-only-on-success and isolated; leaving it in place
  after a tool rollback is harmless (no FK from other tables points at it). It can be dropped
  later with an explicit migration if desired — no data loss elsewhere.

## 7. Migration Plan (if applicable)

- One new table via `pnpm db:push` (push-based Drizzle, per repo convention). No backfill:
  briefs are generated on demand at the offer stage, so existing applications simply have no
  brief until the user asks for one. No change to `jobs`, `evaluations`, or `applications`
  columns; no consumer of those tables is affected.

## 8. Open Questions for Plan

- **Currency/locale normalisation:** `salary-insights` picks a dominant currency from the
  sample; should the brief convert to the user's locale, or surface the dominant currency
  with a note? (Defer to #19b localized-comp; for now surface dominant currency + note.)
- **Offer input source:** does the brief read the offer figure from a user-typed input in
  chat, or from a future structured field on `applications`? (For now: LLM-supplied offer
  amount in the tool input, bounded; revisit if an offer column is added.)
- **Re-generation policy:** one brief per (user, job) updated in place (like `evaluations`'
  unique constraint), or a history of briefs? (Proposed: unique on (userId, jobId), update
  in place; confirm before Phase 2.)
