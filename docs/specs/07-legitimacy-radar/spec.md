# Spec #7 — Posting-Legitimacy / "Ghost-Job" Radar

> Status: Done (shipped 2026-06-15) · Owner: Ever Jobs (signal) → Hust (badge) · Effort: M (EJ) + S–M (Hust) · Phase 2 · Depends on: [#3](../03-evaluation-engine/spec.md) (renders alongside)

## 1. Problem & user value

Many postings aren't real opportunities — perpetual reqs, reposts, vague comp, off-platform
redirects, "evergreen" pipelines. Liveness ([#4](../04-liveness-dto/spec.md)) tells you a posting
is *reachable*; **legitimacy** tells you whether it's *worth trusting*. This is the **one net-new
data capability** in the roadmap, and a real trust differentiator: warn users before they invest
in a likely ghost job.

## 2. Scope

**In:** a corpus-level legitimacy **signal** computed in Ever Jobs (new feature plugin, alongside
dedup/liveness/merge) + a Hust **trust badge** that renders it. Signal is **orthogonal to the fit
score** — never folded into [#3](../03-evaluation-engine/spec.md)'s number (it's "is this real?",
not "is this good for me?").

**Out:** the fit evaluation itself (#3).

## 3. Design

### 3.1 Ever Jobs — `legitimacy-corpus` plugin (corpus, anonymous)

Computes a **reliability-weighted** legitimacy score from corpus + history signals:

| Signal | Weight | Source |
|---|---|---|
| Apply control inactive / off-platform redirect | high | page/apply analysis |
| Perpetual / very-old req still open | medium | posting age + recheck history |
| Reposting pattern (same role re-listed repeatedly) | medium | dedup/recheck ledger |
| Vague or absent compensation | low | salary extraction |
| Employer reputation / red flags | low | firmographics |

Emits a **tier** + reasons: `active` / `caution` / `suspicious` (+ contributing reasons). Exposed
on the search/by-id DTO like liveness. Lives behind the Ever Jobs API (corpus-level, same for all
users → belongs in Ever Jobs per the partition).

### 3.2 Hust — trust badge (Block G host)

Renders the tier as a **benign, explained** badge — **never red, never the word "scam"**: e.g.
"Verified-active" / "Worth a quick check" / "Some signals to review", each with a one-line "why".
Surfaces on the card + job detail, and as the **Block G** section of the [#3](../03-evaluation-engine/spec.md)
evaluation (orthogonal — shown beside the fit score, not inside it).

## 4. Data / API

- Ever Jobs: new `legitimacy-corpus` plugin + `legitimacy: { tier, score, reasons[] }` on the DTO.
- Hust: `packages/jobs-api` DTO type + nullable `jobs.legitimacy*` columns; badge components;
  evaluation Block-G renderer reads it if present.

## 5. Plan & tasks

1. **EJ:** scaffold `legitimacy-corpus` plugin (reuse dedup/recheck ledger + liveness inputs);
   emit tier + reasons; add to DTO (additive).
2. **Hust:** thread DTO field + `jobs` columns; trust badge (benign copy); wire Block G in #3.
3. Tests: EJ signal unit tests (fixtures per tier); Hust badge + Block-G render (E2E).

## 6. Acceptance

- A fixture posting with off-platform redirect + perpetual age yields `suspicious` with reasons;
  Hust shows a benign explained badge; the signal never alters the #3 fit number; CI green;
  **zero competitor references**.

## Implementation (shipped)

The tier vocabulary shipped as `verified` / `likely` / `uncertain` (not the spec's draft
`active` / `caution` / `suspicious`). The signal stays strictly orthogonal to the #3 fit number.

**Ever Jobs — corpus signal (Spec 740 `legitimacy-detector` plugin):**
- `packages/plugins/legitimacy-detector/src/legitimacy-detector.service.ts` — deterministic,
  pure/in-memory legitimacy scorer (+ `legitimacy-detector.module.ts`, `index.ts`).
- `packages/models/src/interfaces/legitimacy-checker.interface.ts` — `ILegitimacyChecker`,
  `LegitimacyInput`, and `LEGITIMACY_CHECKER_TOKEN` contract consumed by the API.
- `apps/api/src/jobs/jobs.controller.ts` — opt-in `?legitimacy=true` query param;
  `enrichLegitimacy()` attaches `legitimacy: { state, reasons[] }` to each `JobPostDto`
  (folds in the liveness off-platform-redirect signal when liveness ran first). Tested in
  `apps/api/__tests__/jobs/corpus-signals.spec.ts`.

**Hust — trust badge:**
- `packages/jobs-api/src/types.ts` — DTO carries the optional corpus signal
  `legitimacy?: { state, reasons[] }` (forward-compatible; Hust derives a heuristic when absent).
- `apps/web/lib/legitimacy.ts` — `assessLegitimacy()` + `LegitimacyLevel` / `LegitimacyAssessment`;
  an explicit corpus signal overrides the Hust-side heuristic. Tested in `apps/web/lib/legitimacy.test.ts`.
- `apps/web/components/canvas/job-card.tsx` — renders a benign "Verify posting" outline badge only
  when the assessment is `uncertain`, with the contributing reasons in the tooltip; never auto-hides.

**Deferred (intentional):**
- Spec §4's nullable `jobs.legitimacy*` persistence columns did **not** ship — Hust computes the
  assessment at render time from fields it already has and reads the corpus signal when the Ever
  Jobs DTO supplies it, so no `packages/db` schema column was added.
- The explicit #3 evaluation **Block G** renderer is not yet wired; the badge currently surfaces on
  the job card only.
