# Spec #3 — Job-Fit Evaluation & Scoring Engine (`evaluateJob`)

> Status: Done (shipped 2026-06-15) · Owner: Hust · Effort: L · Phase 1 (keystone) · Depends on: [#5 Structured-output](../05-structured-output/spec.md)

## 1. Problem & user value

Hust's `searchJobs` returns jobs ranked "newest first" — not "best for *you* first". A user
scrolling 50 results has no per-job verdict, no "why", and no guard against wasting effort on
roles that don't fit. The product implicitly rewards volume (search → favorite → apply-deeplink),
when the brand-defensible posture is the opposite: **quality over quantity**.

The Evaluation engine turns Hust from a search box into an **advisor**. Every job gets:

- a **fit score** (0–100, with a 1–5 mirror),
- a **structured, interrogable breakdown** (why it scored that way),
- a **band-driven recommendation** — including an honest **"don't bother"** when the math says so,
- a persisted record that downstream features consume (pipeline, funnel analytics, interview prep,
  document tailoring, the legitimacy radar's host surface, the learning loop).

This is the **keystone**: nothing in Phase 2/3 is possible until per-user scores exist.

## 2. Scope

**In (MVP):**
- A 15th orchestrator tool, `evaluateJob`, same pattern as the existing 14 (Zod input, `userId`
  injected server-side, structured output).
- A configurable **weighted-dimension** scoring matrix with published score **bands**.
- A two-level **job-family → archetype** taxonomy that *parameterizes* the rubric (data, not code).
- A persisted **`evaluations`** record per (user, job) carrying the machine summary.
- Deterministic pre-fill of the dimensions Hust can compute without the LLM; LLM reasons the rest.
- Surfacing in the UI: a score badge on the job card + an expandable breakdown + an honest
  recommendation pill.

**Out (later epics):**
- Block-G posting-legitimacy *data* (that's [#7](../07-legitimacy-radar/spec.md), Ever Jobs-side;
  this engine only renders the badge if present).
- Funnel analytics / score-floor learning ([#8](../08-funnel-analytics/spec.md)).
- The interview story bank ([#12]) — this engine emits an *interview plan* block, opt-in, that #12
  later harvests.
- Batch/background evaluation ([#19]); MVP is on-demand per job.

## 3. The scoring model

### 3.1 Job-family → archetype taxonomy (data, not code)

A two-level taxonomy *parameterizes* the rubric so the same engine scores a Staff SRE and a Field
Marketing Manager correctly. Detection is JD-keyword signals + the user's CV/preferences. Stored
in a config table (seeded; org-overridable via `organization_ai_configs`), so families/archetypes
are added without a deploy.

| Job family | Example archetypes | Illustrative signal keywords |
|---|---|---|
| Software Eng | Backend / Frontend / Platform / SRE / Mobile | services, latency, infra, CI/CD, on-call |
| Data / ML | Analytics / ML Eng / Data Eng | pipelines, evals, feature store, observability |
| Design | Product / Brand / UX Research / Systems | Figma, design system, user research, prototyping |
| Product | PM / TPM / Growth PM | PRD, roadmap, discovery, experimentation |
| Sales | AE / SDR / Sales Eng / CS | quota, pipeline, ARR, demo, renewals |
| Marketing | Growth / Content / Demand-gen / Brand | SEO, CAC, lifecycle, attribution, campaigns |
| Ops / Other | RevOps / BizOps / People / Finance | forecasting, process, vendor, close, comp |

The detected archetype drives which **proof points** the rubric prioritizes and how each block is
framed. The keyword packs are config, so an org (white-label) can override them.

### 3.2 Configurable weighted dimensions

Default 10-dimension matrix; weights overridable per user (`users.preferences`) and per org
(`organization_ai_configs`), validated to **sum to 100**.

| Dimension | Default weight | 1–5 anchor |
|---|---|---|
| North Star alignment | 25% | fit to the user's stated target role/archetype |
| CV match | 15% | skills/experience overlap (5 = 90%+, 1 = <40%) |
| Level | 15% | seniority vs the user's natural level |
| Comp | 10% | salary vs market (5 = top quartile) |
| Growth | 10% | trajectory / path to next level |
| Remote | 5% | remote-quality vs the user's remote preference |
| Reputation | 5% | employer reputation / red-flag absence |
| Tech | 5% | stack modernity / relevance to the user |
| Speed | 5% | likely time-to-offer |
| Culture | 5% | builder vs bureaucratic signals |

Weighted result → **0–100**, plus a **1–5 mirror**.

### 3.3 Score bands (the "quality over quantity" guardrail)

| Band | 1–5 | Recommendation |
|---|---|---|
| `apply_now` | ≥ 4.5 | Strong fit — apply |
| `worth_it` | 4.0–4.4 | Worth applying |
| `specific_reason` | 3.5–3.9 | Only for a specific reason (name it) |
| `not_recommended` | < 3.5 | Recommend **against** applying — say why |

The engine must be willing to return `not_recommended` and explain it. This is a feature, not a
bug: saying *no* on the user's behalf is the core trust mechanic.

### 3.4 The A–F evaluation blocks

| Block | Contents |
|---|---|
| **A — Role summary** | What the role actually is, normalized from the JD |
| **B — CV match** | Each JD requirement mapped to specific CV evidence + a gaps list |
| **C — Level & strategy** | Seniority read + how to position |
| **D — Comp & demand** | Salary vs market (from Ever Jobs salary data) + budget fit |
| **E — Customization plan** | What to emphasize/tailor for this role |
| **F — Interview plan** *(opt-in)* | Likely themes + STAR story seeds (heavier; `includeInterviewPlan`) |

> Block **G (posting legitimacy)** is rendered here **only if** the Ever Jobs legitimacy signal
> ([#7](../07-legitimacy-radar/spec.md)) is present on the job. It is kept **orthogonal** to the
> fit score — never folded into it.

## 4. The `evaluateJob` tool

```ts
// packages/ai/src/tools/evaluate-job.ts
export const evaluateJobInput = z.object({
  jobId: z.string().uuid(),
  // one-off "what if comp mattered more?" weight override (validated to sum to 100 after merge)
  weightOverride: z.record(z.string(), z.number().min(0).max(1)).optional(),
  includeInterviewPlan: z.boolean().default(false), // Block F is heavier — opt-in
});
```

- `userId` injected server-side (never LLM-provided), per the existing tool pattern.
- Reads the synced `jobs` row (JD text, firmographics, normalized/annualized salary — all sourced
  from Ever Jobs) + the user's `cvParsedData` + `preferences`.
- **Returns the finished evaluation as structured data** (not "context + instruction" — here the
  value *is* the structure). The orchestrator narrates it; the structured object is persisted and
  rendered.
- Idempotent-ish: re-evaluating upserts the `evaluations` row (latest wins; history optional later).
- Rate-limited like other authenticated AI tools; gated by subscription tier (free tier: capped
  evaluations/day; pro: higher/unlimited).

### 4.1 Structured output (the machine summary — see [#5](../05-structured-output/spec.md))

```ts
const evaluationResult = z.object({
  jobId: z.string().uuid(),
  score: z.number().min(0).max(100),
  score5: z.number().min(1).max(5),
  band: z.enum(["apply_now", "worth_it", "specific_reason", "not_recommended"]),
  jobFamily: z.string(),
  archetype: z.string(),
  dimensions: z.array(z.object({
    key: z.string(), weight: z.number(), score5: z.number().min(1).max(5),
    rationale: z.string(), source: z.enum(["deterministic", "llm"]),
  })),
  blocks: z.object({
    roleSummary: z.string(),
    cvMatch: z.object({ evidence: z.array(z.object({ requirement: z.string(), cvEvidence: z.string(), met: z.boolean() })), gaps: z.array(z.string()) }),
    levelStrategy: z.string(),
    compDemand: z.object({ summary: z.string(), budgetFit: z.enum(["good_fit","under_budget","over_budget","unknown"]) }),
    customization: z.string(),
    interviewPlan: z.array(z.object({ theme: z.string(), starSeed: z.string() })).optional(),
  }),
  recommendation: z.string(), // human-readable, honest (incl. "don't bother" when band = not_recommended)
});
```

## 5. Data model (Drizzle)

New table `evaluations` (per user × job), mirroring the machine summary so prose output becomes
queryable history — the precondition for [#8 funnel analytics](../08-funnel-analytics/spec.md):

| Column | Type | Notes |
|---|---|---|
| `id` | integer PK | |
| `userId` | text FK → `users.id` (cascade) | |
| `jobId` | integer FK → `jobs.id` (cascade) | |
| `score` | integer (0–100) | |
| `band` | text enum | apply_now / worth_it / specific_reason / not_recommended |
| `jobFamily`, `archetype` | text | detected taxonomy |
| `dimensions` | jsonb | scored dims (key, weight, score5, rationale, source) |
| `blocks` | jsonb | A–F block payloads |
| `modelUsed` | text | which model produced it |
| `weightsUsed` | jsonb | effective weights (after user/org/override merge) |
| `createdAt` / `updatedAt` | timestamp | |

Unique `(userId, jobId)`; indexes on `(userId, band)` and `(userId, score)` for the pipeline +
analytics. New table `job_family_config` (or seed in code + override in `organization_ai_configs`)
for the taxonomy packs.

**No changes to existing tables are removed** — `users.cvParsedData` / `users.preferences` and the
`jobs` row are read as-is; weights live under `users.preferences.evaluationWeights` (new key) and
`organization_ai_configs` (new optional column or JSON key).

## 6. Determinism boundary

Dimensions Hust can compute **without** the LLM are pre-filled (cheaper, consistent, testable);
the LLM only reasons the rest:

| Pre-filled (deterministic) | LLM-reasoned |
|---|---|
| Comp (from Ever Jobs normalized/annualized salary vs user's target) | North Star alignment |
| Remote (from the job DTO vs user's remote preference) | CV match (evidence mapping) |
| Level (DTO `jobLevel` vs user's level) | Growth, Reputation, Tech, Speed, Culture |
| CV-match *baseline* (skills overlap from `cvParsedData`) | the A–F prose blocks |

Pre-filled dims pass into the prompt as facts the LLM must not re-derive — the same discipline the
existing tools use (deterministic server work, LLM for narration).

## 7. UX surfaces

- **Jobs canvas card:** a colored score badge (green ≥80 / amber 60–79 / grey <60) + a band pill
  ("Apply now" / "Worth it" / "For a reason" / "Skip — here's why"). Clicking expands the breakdown.
- **Job detail drawer:** full A–F view — dimension table, CV-match evidence, comp fit, gaps,
  recommendation. Honest `not_recommended` is shown plainly, never hidden.
- **Chat:** the orchestrator can call `evaluateJob` from natural language ("is this one worth it?")
  and narrate the structured result.
- **Sorting:** allow "Best for me" sort once evaluations exist (does not replace "newest").

## 8. Guardrails (inherits [#6](../06-guardrails/spec.md))

- The engine **must** be able to return `not_recommended` and explain it; prompts are written to
  reward honesty, not enthusiasm.
- No invented facts: every CV-match claim cites specific CV evidence; gaps are stated, not papered.
- Cost control: deterministic pre-fill + opt-in Block F + tier caps + (later) score-floor gating
  for batch ([#19]).

## 9. Dependencies, risks, effort

- **Depends on [#5 Structured-output](../05-structured-output/spec.md)** (the machine-summary
  contract + Zod validation harness). Build #5 first or alongside.
- **Consumes Ever Jobs** salary/firmographics — better once [#1 Harvest](../01-harvest-ever-jobs/spec.md)
  widens coverage, but works on today's synced `jobs` data.
- **Risks:** (a) LLM cost/latency per evaluation → mitigate with deterministic pre-fill, caching,
  tier caps; (b) rubric over-fitting to one job family → the taxonomy is data + org-overridable;
  (c) score gaming/inconsistency → pin model + temperature, validate structured output, snapshot
  tests on fixture jobs.
- **Effort:** L (3–6 wk for a focused build): tool + schema + table + taxonomy seed + UI + tests.

## 10. Acceptance criteria

- `evaluateJob({ jobId })` returns a validated `evaluationResult` and upserts an `evaluations` row.
- Weights merge order **override → user → org → default**, always validated to sum 100; an invalid
  set falls back to default (never throws to the user).
- A deliberately bad-fit fixture job returns `band: not_recommended` with a concrete reason.
- Deterministic dimensions (Comp/Remote/Level/CV-baseline) are computed server-side and marked
  `source: "deterministic"`; unit-tested without the LLM.
- The score badge + band pill render on the canvas card; the breakdown renders in the drawer.
- Unit tests (scoring math, weight merge/validation, taxonomy detection, deterministic dims) +
  E2E (evaluate a synced job end-to-end, assert badge + drawer) green in CI.
- **Zero competitor references** in any file or commit (verified per workspace `RULES.md`).

## Implementation (shipped)

Landed in `ever-hust`. Verified file paths:

- **AI tool** — `packages/ai/src/tools/evaluate-job.ts`. Exposes the `evaluateJob` tool
  (`evaluateJobTool`) plus the core `runEvaluateJob()` server function and `evaluateJobInput`
  Zod schema (`jobId`, `weightOverride`, `includeInterviewPlan`); `userId` is injected
  server-side, never LLM-provided.
- **Orchestrator wiring** — registered as the `evaluateJob` tool in
  `packages/ai/src/agents/orchestrator.ts`, so the agent can call it from natural language and
  narrate the structured result.
- **Deterministic scoring core** — `packages/ai/src/evaluation/scoring.ts`: the default
  10-dimension matrix (`DEFAULT_DIMENSIONS`, weights sum to 100), weight resolution, the
  server-computed Comp/Remote/Level dimensions + CV-overlap baseline, and the score→band map.
- **Taxonomy (data, not code)** — `packages/ai/src/evaluation/taxonomy.ts`: the two-level
  job-family → archetype keyword packs (`JOB_FAMILIES`) and JD-keyword detection.
- **Assembly** — `packages/ai/src/evaluation/assemble.ts`: pure `assembleEvaluation()` that
  merges deterministic + LLM dimensions, applies weights, computes the aggregate score/band,
  and attaches the A–F blocks (missing LLM dims degrade to a neutral 3 rather than failing).
- **Structured-output contract** — `packages/ai/src/structured/schemas/evaluation.ts`
  (the `EvaluationSummary` / `EvaluationLlmPart` Zod schemas, per spec #5).
- **Unit tests** — `scoring.test.ts`, `taxonomy.test.ts`, `assemble.test.ts` (and
  `batch.test.ts`) alongside the evaluation modules; cover scoring math, weight merge, taxonomy
  detection, deterministic dims, and assembly without the LLM.
- **Database** — `evaluations` table in `packages/db/src/schema/evaluations.ts` (per (user, job),
  unique `(userId, jobId)`, indexes on `(userId, band)` and `(userId, score)`), exported from the
  `@ever-hust/db` schema barrel; migration in `packages/db/drizzle/0001_magical_meggan.sql`.
- **API route** — `GET /api/evaluations/[jobId]`
  (`apps/web/app/api/evaluations/[jobId]/route.ts`): read-only, session-authenticated, rate-limited
  fetch of the persisted evaluation (the tool itself produces + upserts the row).
- **UI** — `apps/web/components/canvas/evaluation-card.tsx` (`EvaluationCard`): score badge,
  band pill, and the expandable A–F breakdown; rendered via the dashboard page and wired through
  `apps/web/hooks/use-canvas-sync.ts`.

**"Best for me" sort (shipped):** `apps/web/app/api/user/recommended-jobs/route.ts` (authenticated)
LEFT JOINs the signed-in user's `evaluations` and ranks the corpus by fit score (evaluated jobs
first, highest first; the rest by recency). The jobs canvas exposes a "Best for me" toggle
(`JobsCanvas` `sortMode`/`onSortModeChange`) wired in `apps/web/app/(dashboard)/jobs/page.tsx`.
Covered by `tests/e2e/authed/recommended.authed.spec.ts` (seeded high-fit eval ranks first).

**Deferred (per the spec's "Out (later epics)" scope):**

- Batch/background evaluation (#19) — only the pure planner
  (`packages/ai/src/evaluation/batch.ts`, `planBatchEvaluation`) shipped; the scheduled batch run
  is not wired.
- Block **G** is now rendered + the legitimacy signal attached by this engine (see #7); the upstream
  corpus production stays owned by Ever Jobs (Spec 740).
