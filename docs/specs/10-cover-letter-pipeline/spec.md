# Spec #10 — Cover-Letter Pipeline (HITL + PDF)

> Status: Draft · Owner: Hust · Effort: L · Phase 2 · Depends on: render service, [#6](../06-guardrails/spec.md), [#3](../03-evaluation-engine/spec.md) (context)

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
