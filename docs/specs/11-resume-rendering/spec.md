# Spec #11 — Résumé / CV Document Rendering (ATS-safe PDF)

> Status: Done (shipped 2026-06-15) · Owner: Hust · Effort: L · Phase 2 · Depends on: [#5](../05-structured-output/spec.md), render service (shared with [#10](../10-cover-letter-pipeline/spec.md))

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

## Implementation (shipped)

Built on the #5 structured-output contract. Delivers grounded per-role résumé tailoring with a
server-rendered, ATS-friendly PDF download.

- **AI tool — `tailorResume`** (`packages/ai/src/tools/tailor-resume.ts`, `tailorResumeTool`):
  pulls the user's `cvParsedData`/skills + the target job, calls `generateValidatedObject` to
  produce a grounded tailored résumé (rewritten summary, 3–6 achievement bullets, JD keywords,
  ATS tips), runs the #6 no-invent audit, and returns a validated artifact. Registered as
  `tailorResume` in the orchestrator (`packages/ai/src/agents/orchestrator.ts`, exported from
  `packages/ai/src/tools/index.ts`).
- **Structured schema** (`packages/ai/src/structured/schemas/resume.ts`): `resumeDraftSchema`
  (LLM output) + `resumeSummarySchema` + `resumeArtifact` (`defineArtifact("resume", …)`,
  `RESUME_SCHEMA_VERSION = 1`) — the whitelisted machine surface.
- **No-invent guard** (`packages/ai/src/policy/assert-no-invented.ts`, `assertNoInvented`):
  advisory grounding check that flags ungrounded proper nouns / years / numbers against the real
  CV facts. This is the shipped form of the spec's `assertNoInvented` (it flags rather than
  throws).
- **Resume guidance helpers** (`packages/ai/src/tools/resume-builder.ts` `resumeBuilderTool` +
  pure `packages/ai/src/tools/resume-helpers.ts`): `extractAtsKeywords`, `findSkillOverlap`,
  `getFormatTips` — the latter encodes the ATS-safe formatting rules (single-column, standard
  headings, no tables/graphics, standard fonts) as guidance.
- **Server PDF route** — `POST /api/documents/pdf`
  (`apps/web/app/api/documents/pdf/route.ts`): auth + `export` rate-limit gated, Node.js runtime,
  renders any advisory artifact to a PDF download via `@react-pdf/renderer`.
- **PDF template** (`apps/web/lib/pdf/artifact-document.tsx`, `ArtifactDocument`): pure-JS,
  serverless-safe (no headless Chromium), A4 **single-column** ATS-friendly layout, shape-agnostic
  across artifact types.
- **UI — `ArtifactCard`** (`apps/web/components/canvas/artifact-card.tsx`): renders the tailored
  résumé on the jobs canvas with a grounded/flagged badge, Copy-as-text, and a Download-PDF button
  (calls `/api/documents/pdf`).
- **Tests:** `packages/ai/src/tools/tailor-resume.test.ts`,
  `packages/ai/src/structured/schemas/resume.test.ts`,
  `packages/ai/src/tools/resume-helpers.test.ts`, and the no-invent cases in
  `packages/ai/src/policy/policy.test.ts`.

### Intentionally deferred / divergent from the original design

- **Persistence + versioning:** the PDF is generated on demand and streamed as a download — there
  is **no `documents` table, no Supabase Storage upload, and no version history** yet. (No
  `documents` schema exists in `packages/db/src/schema/`.)
- **Named pure guards `normalizeTextForATS` / `validateCvSectionOrder`:** not built as discrete
  utilities. ATS safety is instead delivered by the single-column `@react-pdf` template plus the
  `getFormatTips` guidance; a Unicode sanitizer and a throwing section-order validator remain
  future enhancements.
- **LaTeX export:** still a fast-follow (was out of scope here).
