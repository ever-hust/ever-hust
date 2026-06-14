# Plan: 11 — Résumé / CV Document Rendering (ATS-safe PDF)

| Field        | Value      |
| ------------ | ---------- |
| Spec         | spec.md    |
| Created      | 2026-06-14 |
| Last updated | 2026-06-14 |

## 1. Approach

Hust already parses CVs (`packages/cv-parser`) and produces resume *guidance* — the
`resumeBuilder` tool (`packages/ai/src/tools/resume-builder.ts`) returns ATS keywords,
skill overlap, and formatting tips as text. This epic closes the loop: it turns the
user's structured profile (`users.cvParsedData` + `users.skills`) into a **real,
ATS-hardened résumé PDF** — "a file, not advice" — stored, versioned, and downloadable.

The work is organised around four seams. (1) A new **`packages/documents`** package
holds the deterministic, pure ATS guards (`normalizeTextForATS`,
`validateCvSectionOrder`), the ATS-safe HTML templates, and the **shared HTML→PDF render
client**. This package is shared with the cover-letter pipeline (spec #10) — whichever
epic lands first builds the shared render client and the `documents` table; this plan is
written to build them if absent and to consume them if already present. (2) A new
**`documents`** table in `packages/db` (kind = `resume`) plus Supabase Storage wiring via
the existing `packages/supabase` `uploadFile`/`getPublicUrl` helpers gives us versioned
artifact persistence. (3) The **`resumeBuilder` tool** is upgraded from "return guidance"
to "render a file": it composes the user's profile (and optional per-role tailoring) into
a template, runs the guards, renders a PDF, persists a versioned `documents` row, and
emits a Zod-validated `resume` artifact alongside its prose. (4) The **canvas + UI**
surface build/preview/download and version history through `useCanvasSync` and a new
overlay card modelled on `salary-insights-card.tsx`.

Per the constitution, every artifact this epic produces conforms to the **structured-output
contract** (spec #5, already shipped in `packages/ai/src/structured/`): we add a
`resume` artifact kind (`schemas/resume.ts`) and `defineArtifact("resume", 1, …)`, so the
résumé summary is queryable for analytics and the learning loop, not just prose.

**Grounded, no-invent** is enforced two ways: the renderer only consumes real
`cvParsedData` fields, and optional per-role tailoring (the customization block from the
evaluation engine, spec #3) is passed through `assertNoInvented` (spec #6 guardrail) so
emphasis can re-order and re-phrase real experience but can **never** fabricate an
employer, date, or metric. Where #3 has not produced a customization block for the target
job, the renderer falls back to the untailored profile — tailoring is strictly additive
and optional, so this epic ships standalone without #3.

**Human-in-the-loop**: rendering a résumé is a user-initiated build, not an outward
action — nothing is sent or submitted. The PDF is generated, stored, and offered for
**download**; the user remains in control of where it goes. Expensive renders are gated
through the shared `withCostGate` cost-cap helper (spec #6) so PDF generation respects
per-tier quotas, consistent with the existing free-tier gating pattern in the
orchestrator.

The two pure guards are the testability core: `validateCvSectionOrder` **throws** on a
divergent section order (deterministic, unit-tested), and `normalizeTextForATS` sanitises
Unicode/character hazards while emitting telemetry counters of what it replaced. Both are
plain functions with no I/O, fully covered by Jest before any rendering wiring exists.

LaTeX export is explicitly a fast-follow (spec §2) and is **out of scope** here — the
template registry is built to admit a LaTeX renderer later without re-architecture, but no
LaTeX task ships in this epic.

## 2. Phases

### Phase 1 — Pure ATS guards + structured `resume` artifact

- Goal: Land the deterministic, I/O-free core — the two guards and the `resume` machine
  summary schema — with full unit coverage, before any rendering or persistence wiring.
- Deliverables:
  - New `packages/documents` package scaffold (package.json, tsconfig, jest project entry)
    with `src/ats/normalize-text.ts` and `src/ats/section-order.ts`.
  - `normalizeTextForATS(text)` → `{ text, replacements }` with telemetry counters.
  - `validateCvSectionOrder(sections)` → throws on divergence from the canonical order.
  - `packages/ai/src/structured/schemas/resume.ts` — `resumeSummarySchema` +
    `defineArtifact("resume", 1, …)`, exported from `structured/index.ts`.
- Exit criteria: `pnpm test -- --selectProjects documents` and `--selectProjects ai`
  green; guards have ≥1 throw-case and ≥1 telemetry-count case each; `resume` artifact
  round-trips through `assertArtifact`.

### Phase 2 — Shared render service + ATS templates

- Goal: Build (or consume, if #10 already shipped it) the shared HTML→PDF render client
  and the ATS-safe single-column HTML template(s).
- Deliverables:
  - `packages/documents/src/render/client.ts` — `renderHtmlToPdf(html, opts)` returning a
    `Buffer`, with circuit-breaker + retry semantics mirroring `packages/jobs-api`.
  - `packages/documents/src/templates/resume-ats.ts` — single-column, standard-heading,
    no-table/no-column HTML template; `composeResumeHtml(profile, tailoring?)`.
  - Render config behind an env var (render-service URL); graceful failure surface when
    unset (no crash, actionable error to the orchestrator).
- Exit criteria: a fixture profile composes to valid ATS HTML; `composeResumeHtml` output
  passes both guards; `renderHtmlToPdf` returns a non-empty PDF buffer against a mocked
  render endpoint in unit tests.

### Phase 3 — `documents` table + Storage persistence + versioning

- Goal: Persist rendered résumés as versioned artifacts in Postgres + Supabase Storage.
- Deliverables:
  - `packages/db/src/schema/documents.ts` (kind enum incl. `resume`, userId, optional
    jobId, version, storageKey, machineSummary jsonb, createdAt) + export in
    `schema/index.ts`; `pnpm db:push`.
  - Versioning helper: next-version computation per (userId, kind, jobId?) and Storage key
    layout `resumes/{userId}/{documentId}-v{n}.pdf` via `packages/supabase` `uploadFile`.
- Exit criteria: schema pushed; inserting two résumés for the same user/job yields v1, v2;
  Storage upload returns a retrievable URL; unit test covers next-version logic.

### Phase 4 — Tool upgrade + tailoring + cost gate + registration

- Goal: Upgrade `resumeBuilder` to render a real file, wire optional #3 tailoring through
  `assertNoInvented`, gate cost, and register the upgraded path.
- Deliverables:
  - `resume-builder.ts` upgraded: build HTML → guards → `renderHtmlToPdf` → persist
    versioned `documents` row → return the `resume` `Artifact` (+ prose). Keeps the
    existing guidance fields as the un-rendered fallback when the render service is
    unavailable.
  - Optional per-role tailoring: read the evaluation customization block (spec #3) when a
    `targetJobId` is given; run `assertNoInvented` (spec #6) before composing.
  - `withCostGate` wrapper (spec #6) applied in `orchestrator.ts` for the render path,
    mirroring the existing `checkCoverLetterLimit` gate.
  - System-prompt update in `prompts.ts` documenting the upgraded tool behaviour.
- Exit criteria: tool unit tests cover render-success, render-unavailable fallback,
  tailoring-present, and tailoring-absent paths; `assertNoInvented` rejection is tested;
  orchestrator wiring type-checks.

### Phase 5 — Canvas sync + UI (build / preview / download / version history)

- Goal: Surface résumé build → preview → download and version history in the chat canvas.
- Deliverables:
  - `case "resumeBuilder"` in `apps/web/hooks/use-canvas-sync.ts` adding a
    `resumeDocument` slice to `CanvasState`.
  - `apps/web/components/canvas/resume-card.tsx` (modelled on `salary-insights-card.tsx`):
    preview, download button, version-history list.
  - API route `apps/web/app/api/documents/route.ts` (list versions) and
    `apps/web/app/api/documents/[id]/download/route.ts` (signed/redirect download) —
    `requireSessionUser()`, `applyRateLimit(userId, "export")`, Zod from
    `apps/web/lib/api-schemas.ts`, errors via `apps/web/lib/api-response.ts`.
- Exit criteria: building a résumé in chat renders the card; download returns the stored
  PDF; version history lists prior versions; type-check + lint clean.

### Phase 6 — Tests, docs, CI green

- Goal: Complete unit coverage for new code paths and add the E2E build→download flow;
  update the spec's Decisions and ROADMAP.
- Deliverables:
  - Unit tests already written alongside each task; this phase adds the **E2E**
    `tests/e2e/resume-rendering.spec.ts` (build a résumé → preview → download a PDF).
  - `docs/specs/ROADMAP.md` progress bump; spec `## Decisions` section recorded.
- Exit criteria: full CI (lint, check-types, Jest, Playwright) **green**; zero competitor
  references verified.

## 3. Packages Touched

| Package                                                                 | Change                                                                                                  |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `packages/documents` (new)                                              | New package: ATS guards (`src/ats/`), templates (`src/templates/`), shared HTML→PDF render client (`src/render/`). |
| `packages/ai/src/structured/schemas/resume.ts` (new)                    | `resumeSummarySchema` + `defineArtifact("resume", 1, …)`; exported from `structured/index.ts`.          |
| `packages/ai/src/tools/resume-builder.ts`                               | Upgrade from guidance-only to render-real-file; emit `resume` Artifact; optional #3 tailoring + `assertNoInvented`. |
| `packages/ai/src/agents/orchestrator.ts`                                | Wrap the upgraded `resumeBuilder` with `withCostGate` (spec #6), mirroring `checkCoverLetterLimit`.     |
| `packages/ai/src/prompts.ts`                                            | Document the upgraded `resumeBuilder` behaviour in `DEFAULT_ORCHESTRATOR_PROMPT` (+ Langfuse `orchestrator-system`). |
| `packages/db/src/schema/documents.ts` (new) + `schema/index.ts`         | New `documents` table (kind/userId/jobId?/version/storageKey/machineSummary/createdAt); export; `pnpm db:push`. |
| `packages/supabase/src/storage.ts`                                      | (reuse) `uploadFile`/`getPublicUrl` for the rendered PDF under `resumes/{userId}/…`.                    |
| `packages/cv-parser`                                                    | (reuse, no change) source of `users.cvParsedData` shape consumed by the template composer.              |
| `apps/web/hooks/use-canvas-sync.ts`                                     | Add `case "resumeBuilder"` + `resumeDocument` slice on `CanvasState`.                                   |
| `apps/web/components/canvas/resume-card.tsx` (new)                      | Overlay card (preview/download/version history) modelled on `salary-insights-card.tsx`.                 |
| `apps/web/app/api/documents/route.ts` + `app/api/documents/[id]/download/route.ts` (new) | List versions + download; `requireSessionUser`, `applyRateLimit(…, "export")`, Zod, `apiError`.        |
| `apps/web/lib/api-schemas.ts`                                           | Add Zod request schema(s) for the documents routes.                                                     |
| `tests/e2e/resume-rendering.spec.ts` (new)                              | Playwright E2E: build → preview → download PDF.                                                          |

## 4. Dependencies

| Library / Epic                                  | Version | Rationale                                                                                                   |
| ----------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------- |
| Spec #5 — structured-output contract            | shipped | `packages/ai/src/structured/` (`defineArtifact`, `assertArtifact`) is the envelope the `resume` artifact uses. Already in-tree. |
| Spec #6 — guardrails                             | upstream | `assertNoInvented` (no-invent) + `withCostGate` (cost cap). If not yet landed, this epic implements minimal local shims behind the same names and migrates when #6 lands. |
| Spec #3 — evaluation engine                      | optional | Source of the per-role customization block for tailoring. Strictly additive; epic ships standalone without it. |
| Spec #10 — cover-letter pipeline                 | shared  | Shares `packages/documents` render client + the `documents` table. Whoever lands first builds them; this plan builds-if-absent. |
| Shared HTML→PDF render service (env-configured)  | latest  | Stateless HTML→PDF endpoint (managed Chromium first, self-hosted Chromium later). One direct integration justified: it is the only way to produce a real PDF artifact; consumed via a circuit-breaker client like `packages/jobs-api`. |
| `zod`                                            | in-repo | Already the schema tool across `packages/ai`; used for the `resume` summary + API schemas. |

No new client-side UI deps — the résumé card reuses `@ever-hust/ui/{card,badge,button,dialog}`
and `cn()` from `@ever-hust/ui/lib/utils`.

## 5. Risks & Mitigations

| Risk                                                                       | Likelihood | Impact | Mitigation                                                                                                   |
| -------------------------------------------------------------------------- | ---------- | ------ | ----------------------------------------------------------------------------------------------------------- |
| Render service is down / env var unset                                     | M          | M      | Circuit-breaker + retry on the render client; tool falls back to existing guidance output (never 500s the user); env-gated graceful error. |
| Tailoring fabricates experience (no-invent breach)                         | L          | H      | `assertNoInvented` runs **before** composing; tailoring may only re-order/re-phrase real CV fields; unit test asserts rejection of an invented claim. |
| ATS template silently breaks parsers (tables/columns creep in)             | L          | H      | Single-column template + `validateCvSectionOrder` throws on order divergence + `normalizeTextForATS`; template output asserted through both guards in tests. |
| Shared package ownership race with spec #10                                | M          | M      | `packages/documents` built additively; render client + `documents` table are build-if-absent / consume-if-present; no removal of either epic's code. |
| Expensive PDF renders blow per-tier quota                                  | M          | M      | `withCostGate` (spec #6) wraps the render path in the orchestrator, mirroring `checkCoverLetterLimit`.       |
| Storage cost / orphaned versions accumulate                                | L          | L      | Versioned keys `resumes/{userId}/{documentId}-v{n}.pdf`; `documents` rows cascade-delete on user delete; cleanup is a later trigger, not blocking. |
| `cvParsedData` shape drift breaks the composer                             | M          | M      | Composer reads through a typed adapter over `users.cvParsedData`; missing fields render as omitted sections, not crashes; covered by a fixture test. |

## 6. Rollback Plan

The feature is additive and flag/env-gated. To disable without data loss:

1. Unset the render-service env var → the upgraded `resumeBuilder` falls back to its
   existing guidance behaviour (no PDF, no `documents` write); chat continues to work.
2. Remove the `resumeBuilder` cost-gate wrapper change in `orchestrator.ts` and the
   `case "resumeBuilder"` in `use-canvas-sync.ts` to hide the card — the tool reverts to
   guidance-only with zero schema changes required.
3. The `documents` table and Storage objects are **left in place** (additive, no data
   loss); they are inert if unused. Per the constitution, nothing is deleted on rollback.

No destructive migration is involved — `documents` is a new table; existing tables are
untouched.

## 7. Migration Plan

- **Schema:** `documents` is a brand-new table applied via `pnpm db:push`; no existing
  data migrates. `applications.coverLetter` / `userJobs.coverLetter` remain as-is (the
  cover-letter epic owns them).
- **Tool consumers:** the `resumeBuilder` tool keeps its existing input schema and its
  guidance fields, so any caller (orchestrator, tests) continues to work; the new
  rendered-file path is **additive** to the return shape (adds the `resume` artifact +
  document metadata).
- **Render service / `documents` table shared with #10:** if #10 lands first, this epic
  imports the existing `packages/documents` render client and reuses the `documents`
  table (adding only the `resume` kind path). If #11 lands first, #10 consumes what this
  epic builds. Either ordering is non-breaking.

## 8. Open Questions for Plan

- Render backend choice for first ship: managed Chromium HTML→PDF endpoint vs. self-hosted
  Chromium. Default to a managed endpoint behind the env var; revisit self-hosting once
  volume is known. (Move to spec `## Decisions` once chosen.)
- Storage access model for download: public URL via `getPublicUrl` vs. a short-lived
  signed URL through the API route. Lean signed-URL for PII hygiene (Article 8); confirm
  the Supabase bucket policy.
- Canonical résumé section order for `validateCvSectionOrder` (e.g. Summary → Experience →
  Skills → Education → Certifications) — confirm the default and whether it is
  configurable per template.
- Whether `documents.machineSummary` should store the full `resume` `Artifact` envelope or
  just its `summary` (lean toward the full envelope for version-aware reads, matching the
  spec #5 convention).
