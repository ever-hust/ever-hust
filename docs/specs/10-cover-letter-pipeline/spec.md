# Spec #10 — Cover-Letter Pipeline (HITL + PDF)

> Status: Done (shipped 2026-06-15) · Owner: Hust · Effort: L · Phase 2 · Depends on: render service, [#6](../06-guardrails/spec.md), [#3](../03-evaluation-engine/spec.md) (context)

## 1. Problem & user value

Today cover-letter generation returns text. The vision is a **finished artifact** — a tailored,
ATS-friendly letter produced through **un-overridable human-approval gates**, with keyword
mirroring to the JD, exportable as **PDF**. "A file, not guidance."

## 2. Scope

**In:** a multi-step pipeline (draft → review/edit → approve → render PDF) with HITL gates that no
prompt can skip; keyword mirroring from the JD + the user's CV; PDF output via a shared render
service; versioning.

**Out:** résumé rendering ([#11](../11-resume-rendering/spec.md)) — but it **shares the render
service** built here; writing-style matching ([#14](../14-writing-style/spec.md)).

## 3. Design

- **Pipeline (state machine):** `draft → user_review → approved → rendered`. The `approved`
  transition is a [#6](../06-guardrails/spec.md) `requireApproval` gate — structural, un-overridable.
- **Generation:** grounded in the user's CV + the #3 evaluation's customization block; **mirrors
  JD keywords** (computed, not hallucinated); `assertNoInvented` validation.
- **Render service (build once):** an HTML→PDF service (Browserless-first, self-hosted Chromium
  later) shared with [#11](../11-resume-rendering/spec.md). ATS-safe output.
- **Storage:** letter text + rendered PDF in Supabase Storage; metadata on `applications` /
  `user_jobs.coverLetter` (already exists) + a `documents` table for artifacts/versions.

## 4. Data / API

- New `documents` table (kind, userId, jobId?, version, storageKey, machineSummary jsonb,
  createdAt). Render service client in `packages/` (shared). `generateCoverLetter` upgraded to the
  pipeline (keeps backward behavior as the draft step).

## 5. Plan & tasks

1. Build the shared **render service** client (HTML→PDF) + ATS-safe HTML template.
2. `documents` table + Supabase Storage wiring.
3. Cover-letter state machine with the `requireApproval` gate (#6).
4. Keyword-mirroring + `assertNoInvented`; emit a structured artifact (#5).
5. UI: draft → edit → approve → download PDF; version history.
6. Tests: gate cannot be skipped (invariant), keyword mirroring (unit), E2E generate→approve→PDF.

## 6. Acceptance

- A letter can be drafted, edited, **explicitly approved** (un-skippable), and downloaded as an
  ATS-safe PDF; nothing is "sent"; versions persist; CI green; **zero competitor references**.

## Implementation (shipped)

What actually landed (verified against the code on 2026-06-15):

- **AI tool — `draftCoverLetter`**: `packages/ai/src/tools/draft-cover-letter.ts` (exported via
  `packages/ai/src/tools/index.ts` + `packages/ai/src/index.ts`; registered in the orchestrator at
  `packages/ai/src/agents/orchestrator.ts`). Grounds the letter in the user's real CV/profile +
  the job row, returns a structured artifact. The lighter `generateCoverLetter`
  (`packages/ai/src/tools/generate-cover-letter.ts`) stays as the talking-points/draft step.
- **Structured schema / artifact (#5 contract)**: `packages/ai/src/structured/schemas/cover-letter.ts`
  — `coverLetterDraftSchema` (LLM output) + `coverLetterSummarySchema` (machine summary with
  `grounded` / `flaggedClaims`) + `coverLetterArtifact` built on `packages/ai/src/structured/contract.ts`.
- **No-invent audit (#6)**: `packages/ai/src/policy/assert-no-invented.ts` (`assertNoInvented`)
  flags ungrounded proper nouns / years / numbers; the tool surfaces them as `grounded` +
  `flaggedClaims` rather than hard-blocking generation.
- **Server-side PDF render**: API route **`POST /api/documents/pdf`** at
  `apps/web/app/api/documents/pdf/route.ts` (auth + `export`-tier rate-limit gated, Node runtime),
  rendering `apps/web/lib/pdf/artifact-document.tsx` — a shape-agnostic, single-column ATS-friendly
  `@react-pdf/renderer` document shared with résumé rendering (#11).
- **UI surface**: `apps/web/components/canvas/artifact-card.tsx` — generic artifact card on the
  jobs canvas with a **Download PDF** button (calls `/api/documents/pdf`), a Copy-as-text fallback,
  and grounded / "needs approval — not sent" / flagged-claims badges. A
  `apps/web/components/shared/cover-letter-modal.tsx` also exists.
- **Approval-gate infrastructure (#6)**: `packages/ai/src/policy/require-approval.ts` +
  `approval_gates` table (`packages/db/src/schema/approval-gates.ts`) provide the structural,
  server-side, un-skippable gate enforced via `OUTWARD_ACTION_TOOLS` (apply / submit / outreach).
- **Tests**: `packages/ai/src/tools/draft-cover-letter.test.ts` (auth/model guards) and
  `packages/ai/src/structured/schemas/cover-letter.test.ts`.

### Intentionally deferred (not yet shipped)

- **Render service**: shipped as pure-JS `@react-pdf/renderer` (serverless-safe, no headless
  Chromium), not the originally-planned Browserless/HTML→PDF render-service client.
- **`documents` table + Supabase Storage versioning**: not implemented — there is no `documents`
  table in `packages/db/src/schema/` and no stored artifact persistence. PDFs are rendered
  on-demand and downloaded; letter text/version history is not persisted as standalone documents.
- **Persisted `draft → user_review → approved → rendered` state machine**: the cover letter is an
  advisory artifact (UX framing "needs approval — not sent"); it is **not** wired into
  `OUTWARD_ACTION_TOOLS`, since drafting/exporting a letter performs no outward action. The
  un-skippable structural gate covers the actual outward steps (apply / submit answers / outreach).
