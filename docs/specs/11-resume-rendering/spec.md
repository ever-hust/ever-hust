# Spec #11 — Résumé / CV Document Rendering (ATS-safe PDF)

> Status: Draft · Owner: Hust · Effort: L · Phase 2 · Depends on: [#5](../05-structured-output/spec.md), render service (shared with [#10](../10-cover-letter-pipeline/spec.md))

## 1. Problem & user value

Hust parses CVs today but doesn't *produce* them. The vision: turn the user's structured profile
into a **real, ATS-hardened résumé** (HTML→PDF), tailored per role, exportable. "A file, not
advice." (LaTeX output is a fast-follow.)

## 2. Scope

**In:** render the user's `cvParsedData` (+ per-role tailoring from [#3](../03-evaluation-engine/spec.md))
into an ATS-safe PDF via the shared render service; an **ATS sanitizer** + **section-order
validator**; versioned artifacts.

**Out:** LaTeX (fast-follow); the cover letter (#10, shares the render service); writing-style
voice (#14).

## 3. Design

- **Templates:** a small set of ATS-safe HTML templates (single-column, standard headings, no
  tables/columns that break parsers).
- **Two pure guards (ported as our own utilities):**
  - `normalizeTextForATS` — Unicode/character sanitizer for ATS compatibility (with telemetry of
    replacements).
  - `validateCvSectionOrder` — asserts the section order; **throws** on divergence (deterministic,
    unit-tested).
- **Tailoring:** optional per-role emphasis from the #3 customization block; never invents
  experience (`assertNoInvented`).
- **Output:** PDF via the shared render service (#10); stored in the `documents` table + Supabase
  Storage; versioned.

## 4. Data / API

- Reuse `documents` table (kind = `resume`) + Storage. Guards in `packages/cv-parser` or a new
  `packages/documents`. `resumeBuilder` tool upgraded to render real files.

## 5. Plan & tasks

1. ATS-safe HTML template(s).
2. `normalizeTextForATS` + `validateCvSectionOrder` (pure, unit-tested with telemetry counters).
3. Render path (shared service) → PDF → `documents`/Storage; versioning.
4. Optional per-role tailoring from #3; `assertNoInvented`.
5. UI: build/preview/download; version history. (LaTeX export = follow-up task.)
6. Tests: sanitizer cases, section-order throw, E2E build→download PDF.

## 6. Acceptance

- A user generates an ATS-safe résumé PDF from their profile; the sanitizer + section-order
  validator are unit-tested; per-role tailoring never invents experience; CI green; **zero
  competitor references**.
