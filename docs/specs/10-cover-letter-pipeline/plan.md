# Plan: 10 — Cover-Letter Pipeline (HITL + PDF)

| Field        | Value                              |
| ------------ | ---------------------------------- |
| Spec         | spec.md                            |
| Created      | 2026-06-14                         |
| Last updated | 2026-06-14                         |

## 1. Approach

Today `generateCoverLetterTool` (`packages/ai/src/tools/generate-cover-letter.ts`) returns prose
context plus an `instruction` string for the orchestrator to narrate — a paragraph, not an
artifact. This epic upgrades that single step into a **four-state pipeline** —
`draft → user_review → approved → rendered` — that produces a finished, ATS-friendly, downloadable
**PDF file**, behind an **un-overridable human-approval gate**. The guiding line from the spec is
"a file, not guidance."

The pipeline is a **server-side state machine** persisted in a new `documents` table. Each AI/UI
action transitions the machine one step. The `approved` transition is the structural HITL gate from
[#6](../06-guardrails/spec.md) — `requireApproval(actionId)` — so no prompt instruction or
prompt-injection can skip it (this generalises the existing `applyJob` `needsApproval` pattern in
`packages/ai/src/tools/apply-job.ts`). **Rendering only runs after the user has explicitly approved;
nothing is ever sent or submitted.** This is the Article 4 (human-in-the-loop) invariant made
structural, not prompted.

Generation stays **grounded** (Article 7): the draft is built from the user's real CV
(`users.cvParsedData`, `users.skills`), the job row (`jobs.description`, `jobs.skills`), and — when
available — the [#3](../03-evaluation-engine/spec.md) evaluation's customization block. We add a
**deterministic keyword-mirroring** step (computed from the JD + the user's CV, never hallucinated)
and run the draft through `assertNoInvented` from [#6](../06-guardrails/spec.md) so no fabricated
employer, number, or quote survives into the letter.

Every artifact emits a **Zod-validated machine summary** alongside its prose, per
[#5](../05-structured-output/spec.md). We add a `cover_letter` artifact kind
(`packages/ai/src/structured/schemas/cover-letter.ts`) registered via the existing
`defineArtifact` / `assertArtifact` harness in `packages/ai/src/structured/contract.ts`, exported
from `packages/ai/src/structured/index.ts` next to the existing `evaluation` kind. The summary
(mirrored keywords, keyword-coverage score, tone, word count, grounding gaps, pipeline state,
version) is what funnel analytics and the learning loop will later query — prose alone is not
queryable.

The **render service is built once here and shared with [#11](../11-resume-rendering/spec.md)**
(résumé rendering is out of scope but reuses this client). It is a new `packages/render-service`
package: an HTML→PDF client (Browserless-first via env-configured endpoint, self-hosted Chromium
later) plus an **ATS-safe HTML template** (single column, real text, no images-as-text, system
fonts). The package exposes one async `renderHtmlToPdf(html, options)` returning a PDF `Buffer`;
the render endpoint is read from an env var with graceful failure (the pipeline stays in `approved`
and surfaces a retryable error rather than 500-ing). This keeps Hust **standalone-first**
(Article 2) — the only hard external dependency remains the Ever Jobs API; the render endpoint is a
generic, swappable HTTP service, not a Gauzy dependency.

Storage: the rendered PDF lands in **Supabase Storage** via the existing
`packages/supabase/src/storage.ts` (`uploadFile` / `getPublicUrl`), under a per-user/per-document
path. Metadata + versions live in the new `documents` table; the latest letter text is also
mirrored onto the existing `user_jobs.coverLetter` / `applications.coverLetter` columns for
backward compatibility, so the current "show cover letter in a modal" behaviour keeps working while
the new pipeline is dark-launched.

The orchestrator (`packages/ai/src/agents/orchestrator.ts`) keeps the existing `generateCoverLetter`
tool registration (backward-compatible **draft** step) and gains the new pipeline tools. The system
prompt (`packages/ai/src/prompts.ts` and the Langfuse `orchestrator-system` prompt) is updated to
describe the draft → review → approve → render flow and to state plainly that the assistant must
never claim a letter is "approved" or "sent" — only the explicit gate can advance it. Free-tier
cover-letter quota continues to be enforced in the orchestrator wrapper via
`checkCoverLetterLimit` (`packages/ai/src/rate-limit.ts`); PDF rendering is additionally gated by
the [#6](../06-guardrails/spec.md) cost gate so the expensive render step only runs on approved
letters.

UI is delivered as a canvas overlay card modelled on
`apps/web/components/canvas/salary-insights-card.tsx`: draft → edit → **Approve** (explicit) →
**Download PDF**, with a version-history list. The new tools' structured results are surfaced by
adding `case` branches to `apps/web/hooks/use-canvas-sync.ts`. A small set of API routes under
`apps/web/app/api/documents/` handle approve / render / download with `requireSessionUser()`,
`applyRateLimit`, and Zod validation from `apps/web/lib/api-schemas.ts`.

## 2. Phases

### Phase 1 — Render service + ATS-safe template (shared with #11)

- Goal: a reusable HTML→PDF client and an ATS-safe HTML template, with no product wiring yet.
- Deliverables: new `packages/render-service` exposing `renderHtmlToPdf(html, options)` (Browserless
  endpoint via env, retry + graceful failure); `coverLetterHtml(letter, meta)` ATS-safe template;
  unit tests for the template (deterministic HTML) and the client (mocked HTTP). New
  `RENDER_SERVICE_URL` documented in `.env.example`.
- Exit criteria: `pnpm test -- --selectProjects render-service` (new Jest project) green; the
  template renders to valid single-column ATS-safe HTML; the client returns a `Buffer` on success
  and a typed retryable error on endpoint failure (no throw past the boundary).

### Phase 2 — `documents` table + Supabase Storage wiring

- Goal: durable storage for letter text, rendered PDFs, and versions.
- Deliverables: new `packages/db/src/schema/documents.ts` (kind, userId, jobId?, version,
  storageKey, machineSummary jsonb, pipelineState, createdAt) exported from
  `packages/db/src/schema/index.ts`; `pnpm db:push` applied; a thin storage helper for PDF paths
  reusing `packages/supabase/src/storage.ts`; backfill is N/A (new table). Schema unit test.
- Exit criteria: `documents` table exists in the database after `pnpm db:push`; row insert/select
  works in a `db` Jest test; versions increment per (userId, jobId, kind).

### Phase 3 — State machine + un-overridable `requireApproval` gate (#6)

- Goal: the `draft → user_review → approved → rendered` machine with a structural approval gate.
- Deliverables: `packages/ai/src/cover-letter/pipeline.ts` (pure transition function + guards);
  approval routed through `requireApproval(actionId)` from [#6](../06-guardrails/spec.md) (consumed,
  not re-implemented — if #6 has not landed, a local `requireApproval` shim lives here and is
  swapped for the shared primitive when #6 merges); `apps/web/app/api/documents/[id]/approve/route.ts`
  performs the only legal `user_review → approved` transition. **Invariant test**: no path reaches
  `rendered` without passing through an explicit `approved` transition.
- Exit criteria: invariant unit test proves the gate cannot be skipped (including a simulated
  "prompt says it's approved" input); illegal transitions throw; approve route requires an
  authenticated session.

### Phase 4 — Keyword mirroring + no-invent + structured artifact (#5)

- Goal: grounded generation that mirrors JD keywords and emits a validated `cover_letter` artifact.
- Deliverables: `packages/ai/src/cover-letter/keywords.ts` (deterministic JD+CV keyword mirroring,
  reusing the existing `extractAtsKeywords` / skill-overlap logic from
  `packages/ai/src/tools/resume-helpers.ts`); `packages/ai/src/structured/schemas/cover-letter.ts`
  (the `cover_letter` artifact via `defineArtifact`, exported from
  `packages/ai/src/structured/index.ts`); `assertNoInvented` applied to the draft; the new
  `coverLetterPipelineTool` (`packages/ai/src/tools/cover-letter-pipeline.ts`) wired through the
  pipeline, exported from `packages/ai/src/tools/index.ts`, registered in
  `packages/ai/src/agents/orchestrator.ts` (with `userId` injected server-side), and documented in
  `packages/ai/src/prompts.ts`. Unit tests for keyword mirroring and artifact validation.
- Exit criteria: mirrored keywords are a subset of (JD ∪ CV) tokens (unit-tested, zero invention);
  the tool returns an `assertArtifact`-validated `cover_letter` artifact; `assertNoInvented` rejects
  a fabricated-claim draft in a test.

### Phase 5 — UI: draft → edit → approve → download PDF + version history

- Goal: the user-facing canvas flow.
- Deliverables: `apps/web/components/canvas/cover-letter-card.tsx` (overlay card modelled on
  `salary-insights-card.tsx`) with edit, an explicit Approve button, Download PDF, and a version
  list; `case "coverLetterPipeline"` added to `apps/web/hooks/use-canvas-sync.ts`; render + download
  API routes `apps/web/app/api/documents/[id]/render/route.ts` and
  `apps/web/app/api/documents/[id]/download/route.ts`; request schemas in
  `apps/web/lib/api-schemas.ts`. The card never shows "Download" until state is `rendered`, never
  shows "approved" until the gate fired.
- Exit criteria: in a real browser, a user can draft → edit → explicitly approve → download an
  ATS-safe PDF; versions persist and are listed; nothing is "sent".

### Phase 6 — Tests + CI green

- Goal: lock the invariants and the happy path.
- Deliverables: unit tests for pipeline transitions, keyword mirroring, artifact validation, the
  no-skip gate invariant (Phases 3–4, written alongside); Playwright spec
  `tests/e2e/cover-letter.spec.ts` covering generate → edit → approve → PDF download; prompt-snapshot
  test update in `packages/ai/src/prompts.test.ts`. Competitor-clean self-check before commit.
- Exit criteria: `pnpm test` and `pnpm test:e2e` green; CI (lint, type-check, unit, E2E) green on
  `develop`; zero competitor references.

## 3. Packages Touched

| Package                                                         | Change                                                                                                                                                                                 |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/render-service` (new)                                | New shared HTML→PDF client `renderHtmlToPdf()` + ATS-safe `coverLetterHtml()` template (reused by [#11](../11-resume-rendering/spec.md)). New Jest project.                            |
| `packages/db`                                                  | New `src/schema/documents.ts` (kind, userId, jobId?, version, storageKey, machineSummary jsonb, pipelineState); export from `src/schema/index.ts`; `pnpm db:push`. Schema test.        |
| `packages/supabase`                                            | (no new file) reuse `src/storage.ts` `uploadFile` / `getPublicUrl` for PDF paths under a `documents/` prefix.                                                                          |
| `packages/ai`                                                  | New `src/cover-letter/pipeline.ts`, `src/cover-letter/keywords.ts`; new `src/tools/cover-letter-pipeline.ts` (export in `src/tools/index.ts`, register in `src/agents/orchestrator.ts`); new `src/structured/schemas/cover-letter.ts` (export in `src/structured/index.ts`); prompt update in `src/prompts.ts`; consumes `requireApproval` / `assertNoInvented` / cost gate from [#6](../06-guardrails/spec.md). |
| `packages/jobs-api`                                            | (no change) — JD data is read from the synced `jobs` table, not re-fetched live.                                                                                                       |
| `apps/web`                                                     | New `components/canvas/cover-letter-card.tsx`; `case "coverLetterPipeline"` in `hooks/use-canvas-sync.ts`; new routes under `app/api/documents/[id]/{approve,render,download}/route.ts`; schemas in `lib/api-schemas.ts`; reuse `lib/api-response.ts` helpers. |
| `packages/ui`                                                  | (no new component expected) reuse `@ever-hust/ui/{card,button,badge,dialog}` + `cn()`; add only if a primitive is missing.                                                             |
| `tests/e2e`                                                    | New `cover-letter.spec.ts` (generate → edit → approve → download).                                                                                                                     |

## 4. Dependencies

| Library / upstream                                  | Version | Rationale                                                                                                                       |
| --------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Epic [#5](../05-structured-output/spec.md)          | landed  | `defineArtifact` / `assertArtifact` harness in `packages/ai/src/structured/` — the `cover_letter` artifact contract builds on it. |
| Epic [#6](../06-guardrails/spec.md)                 | pending | `requireApproval(actionId)`, `assertNoInvented`, `withCostGate` — the structural gate, no-invent, and PDF cost cap. Local shim until merged. |
| Epic [#3](../03-evaluation-engine/spec.md)          | context | Optional customization block grounds the draft; pipeline degrades gracefully if absent.                                          |
| Render service (Browserless-first, HTTP)            | latest  | HTML→PDF without bundling Chromium into Vercel; swappable to self-hosted Chromium later; generic HTTP, not a Gauzy dep.          |
| `@ever-hust/supabase` (`uploadFile`/`getPublicUrl`) | workspace | Existing Storage helper — no new dep for PDF persistence.                                                                       |

> No new third-party runtime dependency is added beyond the render endpoint (configured by env). If
> a self-hosted Chromium path is chosen later, that dep gets its own justification line per
> Article 10.5.

## 5. Risks & Mitigations

| Risk                                                                              | Likelihood | Impact | Mitigation                                                                                                                  |
| --------------------------------------------------------------------------------- | ---------- | ------ | -------------------------------------------------------------------------------------------------------------------------- |
| Epic [#6](../06-guardrails/spec.md) (`requireApproval`/`assertNoInvented`) not yet landed | M          | H      | Build a local `requireApproval`/`assertNoInvented` shim in `packages/ai/src/cover-letter/`; swap to the shared primitive when #6 merges; keep the invariant test stable across both. |
| Approval gate bypassable via prompt-injection (HITL violation, Article 4)         | L          | H      | Gate is a server-side **state transition**, not a prompt; invariant test simulates "model says approved" and must still fail to render. |
| Render endpoint down / slow → user blocked from PDF                               | M          | M      | Pipeline stays in `approved` with a retryable error; `renderHtmlToPdf` retries + fails gracefully (no throw past boundary); `maxDuration = 60` on the render route. |
| PDF not actually ATS-safe (multi-column, glyph-as-image)                          | L          | M      | Single-column, real-text, system-font template; snapshot test on generated HTML; manual ATS spot-check in Phase 5.          |
| Generated letter invents an employer/number (Article 7)                           | M          | H      | Deterministic keyword mirroring (subset of JD∪CV) + `assertNoInvented` on the draft; unit test with a fabricated claim must reject. |
| Expensive PDF render abused for free-tier spam                                    | M          | M      | Free-tier quota via `checkCoverLetterLimit`; render additionally behind the #6 cost gate (only on approved, above-threshold letters). |
| Storage path collision / overwrite of a prior version                             | L          | M      | Version-keyed storage path (`documents/{userId}/{jobId}/{version}.pdf`); `documents` row per version; never upsert over an approved version. |

## 6. Rollback Plan

The pipeline is dark-launchable behind the new `coverLetterPipeline` tool registration. To disable
without data loss: remove the `coverLetterPipeline` entry from the `tools` object in
`packages/ai/src/agents/orchestrator.ts` and its line from `packages/ai/src/tools/index.ts`, and
revert the `packages/ai/src/prompts.ts` paragraph — the legacy `generateCoverLetter` draft tool
keeps working unchanged, and the existing "cover letter in a modal" UX is untouched. The
`documents` table and any rendered PDFs are additive and can remain in place (read-only) or be left
dormant; no existing column is dropped (`user_jobs.coverLetter` / `applications.coverLetter` are
only written to, never removed). The render endpoint can be turned off via its env var; routes then
return a graceful retryable error. No destructive migration is involved.

## 7. Migration Plan

New table only — no data migration. Existing cover letters stored on `user_jobs.coverLetter` /
`applications.coverLetter` remain valid and are treated as un-versioned legacy drafts; the first
time a user runs a letter through the new pipeline, a `documents` row (version 1) is created and the
legacy column is mirrored forward for backward compatibility. Consumers reading
`user_jobs.coverLetter` continue to work. `pnpm db:push` is the only schema step; no `pnpm db:migrate`
data step is needed.

## 8. Open Questions for Plan

1. Does [#6](../06-guardrails/spec.md) land before this epic? If not, the local `requireApproval` /
   `assertNoInvented` shim ships here and is reconciled when #6 merges (tracked, not forked).
2. Browserless-hosted vs. self-hosted Chromium for the first cut — default to the env-configured
   Browserless endpoint; self-hosted is a later swap behind the same `renderHtmlToPdf` interface.
3. Render-cost gating threshold: reuse the [#6](../06-guardrails/spec.md) `withCostGate` score-floor,
   or gate purely on the approved-state transition? Default: approved-state + existing free-tier
   quota; add score-floor only if abuse appears.
4. Should the `cover_letter` machine summary live in its own column on `documents.machineSummary`
   (chosen) or be denormalised onto `applications`? Default: `documents.machineSummary` jsonb, with
   the latest text mirrored to the legacy column.
