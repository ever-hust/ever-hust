# Tasks: 11 — Résumé / CV Document Rendering (ATS-safe PDF)

> Status legend: `[ ]` pending • `[~]` in-progress • `[x]` done • `[-]` dropped

## Phase 1 — Pure ATS guards + structured `resume` artifact

- [ ] T01 — Scaffold the `packages/documents` package
  - **Files:** `packages/documents/package.json`, `packages/documents/tsconfig.json`,
    `packages/documents/src/index.ts`; add a `documents` Jest project to the root Jest
    config alongside the existing `ai`/`db`/`cv-parser` projects.
  - **Acceptance:**
    - `pnpm install` resolves the new `@ever-hust/documents` workspace package.
    - `pnpm test -- --selectProjects documents` runs (zero tests is fine) without config error.
    - `pnpm check-types` passes for the new package.
  - **Estimate:** 0.5 day

- [ ] T02 — `normalizeTextForATS` sanitizer with telemetry counters
  - **Files:** `packages/documents/src/ats/normalize-text.ts`,
    `packages/documents/src/ats/normalize-text.test.ts`; export from
    `packages/documents/src/index.ts`.
  - **Acceptance:**
    - Returns `{ text, replacements }`; smart quotes, ligatures, non-breaking spaces, and
      control chars are normalised to ATS-safe equivalents.
    - `replacements` is a per-category counter map reflecting exactly what was replaced (telemetry).
    - Unit tests cover: a clean string (zero replacements), a string with each hazard
      category (non-zero counts), and idempotency (running twice yields no new replacements).
  - **Estimate:** 0.5 day

- [ ] T03 — `validateCvSectionOrder` that throws on divergence
  - **Files:** `packages/documents/src/ats/section-order.ts`,
    `packages/documents/src/ats/section-order.test.ts`; export from
    `packages/documents/src/index.ts`.
  - **Acceptance:**
    - Asserts the canonical section order; **throws** a typed error on any divergence.
    - Pure / deterministic (no I/O).
    - Unit tests cover: a correctly-ordered set (no throw), a swapped pair (throws), and a
      missing-required-section case (throws with an actionable message).
  - **Estimate:** 0.5 day

- [ ] T04 — `resume` structured-output artifact schema
  - **Files:** `packages/ai/src/structured/schemas/resume.ts`,
    `packages/ai/src/structured/schemas/resume.test.ts`; export additions in
    `packages/ai/src/structured/index.ts`.
  - **Acceptance:**
    - `resumeSummarySchema` (Zod, `.max()`-bounded strings/arrays) captures whitelisted
      queryable fields (e.g. `documentId`, optional `jobId`, `version`, `atsKeywords`,
      `sectionsRendered`, `tailoredForJobId?`, `replacementsCount`).
    - `resumeArtifact = defineArtifact("resume", 1, resumeSummarySchema)`.
    - Test: a valid summary round-trips through `resumeArtifact.build` + `assertArtifact`;
      an invalid summary is rejected.
  - **Estimate:** 0.5 day

## Phase 2 — Shared render service + ATS templates

- [ ] T05 — ATS-safe HTML template + composer
  - **Files:** `packages/documents/src/templates/resume-ats.ts`,
    `packages/documents/src/templates/resume-ats.test.ts`; export from
    `packages/documents/src/index.ts`.
  - **Acceptance:**
    - `composeResumeHtml(profile, tailoring?)` emits single-column HTML with standard
      headings; **no** tables, multi-column layout, headers/footers, or text boxes.
    - Composer output passes both `validateCvSectionOrder` and `normalizeTextForATS`
      (asserted in the test).
    - Test uses a fixture `cvParsedData`-shaped profile and asserts every present section
      renders and absent sections are omitted (no placeholder leakage).
  - **Estimate:** 1 day

- [ ] T06 — Shared HTML→PDF render client (circuit-breaker + retry)
  - **Files:** `packages/documents/src/render/client.ts`,
    `packages/documents/src/render/client.test.ts`; export from
    `packages/documents/src/index.ts`.
  - **Acceptance:**
    - `renderHtmlToPdf(html, opts)` returns a non-empty `Buffer` against a mocked render
      endpoint; reads the render-service URL from an env var.
    - Circuit-breaker + retry semantics mirror `packages/jobs-api` (bounded retries, opens
      on repeated failure).
    - When the env var is unset, throws a typed, catchable error (no crash); test covers
      the unset path and the retry/failure path.
    - **If spec #10 already shipped this client, this task reduces to importing/reusing it**
      and adding any résumé-specific render option — no duplicate implementation.
  - **Estimate:** 1 day

## Phase 3 — `documents` table + Storage persistence + versioning

- [ ] T07 — `documents` table schema + db push
  - **Files:** `packages/db/src/schema/documents.ts`; export in
    `packages/db/src/schema/index.ts`; run `pnpm db:push`.
  - **Acceptance:**
    - Table follows house style: `integer("id").primaryKey().generatedAlwaysAsIdentity()`;
      `text("user_id").notNull().references(() => users.id, { onDelete: "cascade" })`;
      optional `integer("job_id").references(() => jobs.id, { onDelete: "cascade" })`;
      `kind` via `text("kind", { enum: ["resume", "cover_letter"] }).notNull()`;
      `integer("version").notNull()`; `text("storage_key").notNull()`;
      `jsonb("machine_summary").$type<…>()`; `timestamp("created_at").notNull().defaultNow()`;
      indexes on `(user_id)` and `(user_id, kind, job_id)`.
    - **If #10 already created `documents`, extend it additively** (ensure the `resume`
      kind path) rather than redefining.
    - `pnpm db:push` applies cleanly; `pnpm check-types` passes with the new export.
  - **Estimate:** 0.5 day

- [ ] T08 — Versioning + Storage persistence helper
  - **Files:** `packages/documents/src/persist/save-resume.ts`,
    `packages/documents/src/persist/save-resume.test.ts`; reuses `uploadFile`/`getPublicUrl`
    from `packages/supabase/src/storage.ts`.
  - **Acceptance:**
    - Computes the next `version` per `(userId, kind, jobId?)`; first render = v1, second = v2.
    - Uploads the PDF under `resumes/{userId}/{documentId}-v{n}.pdf` and inserts a
      `documents` row with `machineSummary` set to the `resume` artifact.
    - Test mocks Storage + db and asserts the next-version computation and the key layout.
  - **Estimate:** 1 day

## Phase 4 — Tool upgrade + tailoring + cost gate + registration

- [ ] T09 — Upgrade `resumeBuilder` to render a real PDF
  - **Files:** `packages/ai/src/tools/resume-builder.ts`,
    `packages/ai/src/tools/resume-builder.test.ts`.
  - **Acceptance:**
    - On success: composes HTML → runs both guards → `renderHtmlToPdf` → persists a
      versioned `documents` row → returns a `resume` `Artifact` (built via `resumeArtifact`)
      plus prose, and document metadata (`documentId`, `version`, download key).
    - On render-service unavailable: catches and returns the existing guidance shape
      (keywords/skill overlap/format tips) as a graceful fallback — never throws to the user.
    - `userId` stays a server-injected param (never LLM-supplied); input schema keeps
      `.max()` bounds.
    - Tests cover render-success and render-unavailable-fallback paths (Storage + render
      client mocked).
  - **Estimate:** 1 day

- [ ] T10 — Optional per-role tailoring + `assertNoInvented`
  - **Files:** `packages/ai/src/tools/resume-builder.ts` (tailoring branch);
    `packages/ai/src/tools/resume-builder.test.ts` (tailoring cases).
  - **Acceptance:**
    - When `targetJobId` is given and an evaluation customization block (spec #3) exists,
      tailoring re-orders/emphasises **real** CV fields only; runs `assertNoInvented`
      (spec #6) before composing.
    - When no customization block exists, falls back to the untailored profile (additive,
      optional — epic still works without #3).
    - Tests cover: tailoring-present (emphasis applied), tailoring-absent (clean fallback),
      and an invented-claim input rejected by `assertNoInvented`.
  - **Estimate:** 1 day

- [ ] T11 — Cost-gate wrapper + orchestrator registration
  - **Files:** `packages/ai/src/agents/orchestrator.ts`;
    `packages/ai/src/agents/orchestrator.test.ts`.
  - **Acceptance:**
    - The upgraded `resumeBuilder` is wrapped with `withCostGate` (spec #6) in the
      `tools: { … }` object, mirroring the existing `checkCoverLetterLimit` gate; `userId`
      injected server-side as today.
    - Over-quota free-tier renders return an upgrade-prompt result (no PDF), like the
      cover-letter limit path.
    - Test asserts the gate blocks an over-quota render and allows a subscribed user.
  - **Estimate:** 0.5 day

- [ ] T12 — Document the upgraded tool in the system prompt
  - **Files:** `packages/ai/src/prompts.ts`; `packages/ai/src/prompts.test.ts`.
  - **Acceptance:**
    - `DEFAULT_ORCHESTRATOR_PROMPT` describes that `resumeBuilder` now produces a
      downloadable ATS-safe PDF (not just guidance), is download-only (nothing sent), and
      respects the cost gate.
    - A "## Résumé Documents" section explains the build → preview → download flow.
    - Mirror the copy to the Langfuse `orchestrator-system` prompt (noted in the task).
    - `prompts.test.ts` asserts the prompt mentions the résumé-document capability.
  - **Estimate:** 0.5 day

## Phase 5 — Canvas sync + UI (build / preview / download / version history)

- [ ] T13 — Canvas-sync case for `resumeBuilder`
  - **Files:** `apps/web/hooks/use-canvas-sync.ts`;
    `apps/web/hooks/use-canvas-sync.test.ts` (web-lib Jest project).
  - **Acceptance:**
    - New `case "resumeBuilder"` adds a `resumeDocument` slice to `CanvasState` from the
      tool's `resume` artifact + document metadata; a `clearResumeDocument` setter is
      exported.
    - Result without a rendered document (guidance fallback) does **not** open the card.
    - Test drives `handleToolResult("resumeBuilder", …)` and asserts state transitions for
      both the rendered and fallback shapes.
  - **Estimate:** 0.5 day

- [ ] T14 — Résumé overlay card (preview / download / versions)
  - **Files:** `apps/web/components/canvas/resume-card.tsx`;
    `apps/web/components/canvas/resume-card.test.tsx`; wire into the canvas in
    `apps/web/components/canvas/jobs-canvas.tsx` (or the dashboard canvas) like
    `salary-insights-card.tsx`.
  - **Acceptance:**
    - Modelled on `salary-insights-card.tsx`; uses `@ever-hust/ui/{card,badge,button}` and
      `cn()`; shows preview, a download button, and a version-history list.
    - Download triggers the documents download route; version selector re-targets the card.
    - Component test renders with a fixture `resumeDocument` and asserts the download
      affordance + version list appear.
  - **Estimate:** 1 day

- [ ] T15 — Documents API routes (list versions + download)
  - **Files:** `apps/web/app/api/documents/route.ts`,
    `apps/web/app/api/documents/[id]/download/route.ts`;
    `apps/web/lib/api-schemas.ts` (new Zod schema);
    `apps/web/app/api/documents/route.test.ts` (web-lib project).
  - **Acceptance:**
    - Both routes call `requireSessionUser()` and `applyRateLimit(userId, "export")`;
      validate input with Zod from `api-schemas.ts`; return errors via
      `apiBadRequest()`/`apiError()`.
    - List route returns the caller's `documents` (kind=`resume`) ordered by
      `version desc`, scoped to `userId` (no cross-user access).
    - Download route returns the stored PDF (signed/redirect) only for documents owned by
      the caller; a foreign `id` yields 404/403.
    - Tests cover the owner-success path and the foreign-id denial.
  - **Estimate:** 1 day

## Phase 6 — Tests, docs, CI green

- [ ] T16 — E2E build → preview → download
  - **Files:** `tests/e2e/resume-rendering.spec.ts`.
  - **Acceptance:**
    - Playwright (baseURL `http://localhost:8443`): user asks the assistant to build a
      résumé → the résumé card appears → preview shows → download yields a PDF response.
    - Asserts nothing is "sent/submitted" — the flow ends at download (HITL: download-only).
    - `pnpm test:e2e` passes locally.
  - **Estimate:** 1 day

- [ ] T17 — Docs, decisions, and CI-green close-out
  - **Files:** `docs/specs/11-resume-rendering/spec.md` (`## Decisions` section);
    `docs/specs/ROADMAP.md` (progress bump);
    `packages/documents/README.md` (package usage + shared-with-#10 note).
  - **Acceptance:**
    - Resolved Open Questions from `plan.md §8` recorded in the spec's `## Decisions`.
    - ROADMAP reflects epic #11 progress.
    - Full CI (lint, check-types, Jest, Playwright) **green**; competitor-name grep over the
      diff is empty (Article 11).
  - **Estimate:** 0.5 day

## Notes

- Write tests alongside each implementation task; do not batch testing into a final task.
- Verify **zero competitor references** before every commit (see constitution Article 11).
- Update `docs/specs/ROADMAP.md` progress when an epic's tasks complete.
- Standalone-first: the Ever Jobs API stays the only hard external dep; the render service
  is env-gated with a guidance fallback; no Gauzy dependency is introduced.
- Human-in-the-loop: résumé build is download-only — nothing is sent, submitted, or
  applied on the user's behalf.
