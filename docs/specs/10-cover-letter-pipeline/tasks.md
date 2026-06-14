# Tasks: 10 — Cover-Letter Pipeline (HITL + PDF)

> Status legend: `[ ]` pending • `[~]` in-progress • `[x]` done • `[-]` dropped

## Phase 1 — Render service + ATS-safe template (shared with #11)

- [ ] T01 — Scaffold `packages/render-service` with `renderHtmlToPdf()` client
  - **Files:** `packages/render-service/package.json`, `packages/render-service/tsconfig.json`,
    `packages/render-service/src/index.ts`, `packages/render-service/src/client.ts`,
    `.env.example` (add `RENDER_SERVICE_URL`), root `jest.config` (add `render-service` project)
  - **Acceptance:**
    - `renderHtmlToPdf(html, options)` POSTs HTML to the `RENDER_SERVICE_URL` endpoint and returns a
      PDF `Buffer` on success.
    - On endpoint failure it retries (bounded) and returns a typed `{ ok: false, retryable: true }`
      result — it never throws past the boundary.
    - Package builds and type-checks; `pnpm install` wires it into the workspace.
  - **Estimate:** 1 day

- [ ] T02 — ATS-safe cover-letter HTML template + client unit tests (alongside)
  - **Files:** `packages/render-service/src/templates/cover-letter.ts`,
    `packages/render-service/src/client.test.ts`,
    `packages/render-service/src/templates/cover-letter.test.ts`
  - **Acceptance:**
    - `coverLetterHtml(letter, meta)` emits single-column, real-text, system-font HTML (no
      image-as-text, no multi-column) — asserted by snapshot.
    - Client test (mocked fetch) covers success → `Buffer` and endpoint-down → retryable error.
    - `pnpm test -- --selectProjects render-service` green.
  - **Estimate:** 0.5 day

## Phase 2 — `documents` table + Supabase Storage wiring

- [ ] T03 — Add `documents` Drizzle schema + export
  - **Files:** `packages/db/src/schema/documents.ts`, `packages/db/src/schema/index.ts`
  - **Acceptance:**
    - Table follows house style: `integer("id").primaryKey().generatedAlwaysAsIdentity()`,
      `text("user_id").notNull().references(() => users.id, { onDelete: "cascade" })`,
      nullable `integer("job_id").references(() => jobs.id, { onDelete: "cascade" })`,
      `text("kind", { enum: ["cover_letter", "resume"] }).notNull()`,
      `integer("version").notNull().default(1)`, `text("storage_key")`,
      `text("pipeline_state", { enum: ["draft","user_review","approved","rendered"] }).notNull().default("draft")`,
      `jsonb("machine_summary").$type<CoverLetterSummary>()`, `timestamp("created_at").notNull().defaultNow()`.
    - Indexes on `(user_id)` and `(user_id, job_id, kind)`; exported from `schema/index.ts`.
  - **Estimate:** 0.5 day

- [ ] T04 — Apply schema with `pnpm db:push` + schema unit test
  - **Files:** `packages/db/src/schema/documents.test.ts` (DB Jest project)
  - **Acceptance:**
    - `pnpm db:push` applies the table to the database with no diff left.
    - Test inserts a `documents` row and selects it back; version defaults to 1; a second row for the
      same `(userId, jobId, kind)` is stored as version 2 by the insert helper.
    - `pnpm test -- --selectProjects db` green.
  - **Estimate:** 0.5 day

- [ ] T05 — PDF storage helper (reuse Supabase storage)
  - **Files:** `packages/render-service/src/storage.ts` (thin wrapper over
    `@ever-hust/supabase` `uploadFile`/`getPublicUrl`), `packages/render-service/src/storage.test.ts`
  - **Acceptance:**
    - Writes the PDF to `documents/{userId}/{jobId}/{version}.pdf` and returns the public URL.
    - Never upserts over an existing approved version (path is version-keyed).
    - Unit test mocks `uploadFile`/`getPublicUrl` and asserts the path shape.
  - **Estimate:** 0.5 day

## Phase 3 — State machine + un-overridable `requireApproval` gate (#6)

- [ ] T06 — Pure pipeline transition function + guards
  - **Files:** `packages/ai/src/cover-letter/pipeline.ts`, `packages/ai/src/cover-letter/pipeline.test.ts`
  - **Acceptance:**
    - `transition(state, event)` only allows `draft → user_review → approved → rendered`; any other
      transition throws.
    - `rendered` is unreachable unless the machine passed through an explicit `approved` event
      (proven by an **invariant test**, including a simulated "model output says approved" input that
      must NOT advance state).
    - `pnpm test -- --selectProjects ai` green for this file.
  - **Estimate:** 1 day

- [ ] T07 — Route approval through `requireApproval` (#6) + approve API route
  - **Files:** `apps/web/app/api/documents/[id]/approve/route.ts`,
    `packages/ai/src/cover-letter/require-approval.ts` (local shim re-exporting #6's
    `requireApproval` when present), `apps/web/lib/api-schemas.ts` (approve body schema)
  - **Acceptance:**
    - The approve route is the ONLY code path that performs `user_review → approved`; it calls
      `requireSessionUser()`, `applyRateLimit(userId, "authenticated")`, validates with Zod, and
      uses `apiBadRequest()`/`apiError()` from `apps/web/lib/api-response.ts`.
    - Approval is gated by `requireApproval(actionId)`; the shim delegates to #6 once merged.
    - A request without an authenticated session is rejected; a document not owned by the user 404s.
  - **Estimate:** 1 day

## Phase 4 — Keyword mirroring + no-invent + structured artifact (#5)

- [ ] T08 — Deterministic JD+CV keyword mirroring
  - **Files:** `packages/ai/src/cover-letter/keywords.ts`, `packages/ai/src/cover-letter/keywords.test.ts`
  - **Acceptance:**
    - Mirrors keywords computed from the JD (`jobs.description`, `jobs.skills`) ∪ the user's CV
      (`users.cvParsedData`, `users.skills`), reusing `extractAtsKeywords`/skill-overlap from
      `packages/ai/src/tools/resume-helpers.ts`.
    - Unit test asserts every mirrored keyword is a subset of (JD ∪ CV) tokens — **zero invention**.
    - `pnpm test -- --selectProjects ai` green for this file.
  - **Estimate:** 1 day

- [ ] T09 — `cover_letter` structured artifact (#5) + export
  - **Files:** `packages/ai/src/structured/schemas/cover-letter.ts`,
    `packages/ai/src/structured/index.ts`, `packages/ai/src/structured/schemas/cover-letter.test.ts`
  - **Acceptance:**
    - Defines `coverLetterArtifact` via `defineArtifact("cover_letter", 1, coverLetterSummarySchema)`
      from `packages/ai/src/structured/contract.ts`; summary whitelists mirrored keywords,
      keyword-coverage score, tone, word count, grounding gaps, pipeline state, version.
    - Exported from `structured/index.ts` next to the existing `evaluation` exports.
    - Test: valid summary `build()`s; an out-of-whitelist / malformed summary fails `assertArtifact`.
  - **Estimate:** 0.5 day

- [ ] T10 — Apply `assertNoInvented` to the draft (#6)
  - **Files:** `packages/ai/src/cover-letter/no-invent.ts` (local shim re-exporting #6's
    `assertNoInvented`), `packages/ai/src/cover-letter/no-invent.test.ts`
  - **Acceptance:**
    - The draft text is validated so CV-evidence claims must reference real `users.cvParsedData`
      fields; a fabricated employer/number/quote is rejected.
    - Unit test: a draft with an invented employer fails; a grounded draft passes.
  - **Estimate:** 0.5 day

- [ ] T11 — `coverLetterPipeline` tool + orchestrator registration + prompt update
  - **Files:** `packages/ai/src/tools/cover-letter-pipeline.ts`,
    `packages/ai/src/tools/index.ts`, `packages/ai/src/agents/orchestrator.ts`,
    `packages/ai/src/prompts.ts`, `packages/ai/src/tools/cover-letter-pipeline.test.ts`,
    `packages/ai/src/prompts.test.ts`
  - **Acceptance:**
    - Tool defined with `tool({ description, inputSchema: z.object(...).max()-bounded, execute })`;
      `userId` is injected server-side in `orchestrator.ts` (NEVER an LLM param), matching the
      existing `generateCoverLetter` wrapper.
    - Exported from `tools/index.ts`; registered in the `tools: { ... }` object in `orchestrator.ts`;
      free-tier quota still enforced via `checkCoverLetterLimit` (`packages/ai/src/rate-limit.ts`).
    - Tool returns an `assertArtifact`-validated `cover_letter` artifact (prose + summary) and the
      current pipeline state; it advances `draft → user_review` only (never auto-approves/renders).
    - `prompts.ts` documents the new tool and states the assistant must never claim a letter is
      approved/sent; `prompts.test.ts` snapshot updated.
  - **Estimate:** 1 day

## Phase 5 — UI: draft → edit → approve → download PDF + version history

- [ ] T12 — Render + download API routes
  - **Files:** `apps/web/app/api/documents/[id]/render/route.ts`,
    `apps/web/app/api/documents/[id]/download/route.ts`, `apps/web/lib/api-schemas.ts`
  - **Acceptance:**
    - `render` route runs ONLY when the document is `approved`; it calls `renderHtmlToPdf` +
      `coverLetterHtml`, stores the PDF (T05), advances state to `rendered`, sets
      `export const maxDuration = 60`, and on render-service failure returns a graceful retryable
      error (stays `approved`).
    - `download` route streams the stored PDF for the owning user only; `requireSessionUser()` +
      `applyRateLimit(userId, "export")`; non-owner → 404.
    - Render is behind the cost gate / free-tier quota; never renders an unapproved document.
  - **Estimate:** 1 day

- [ ] T13 — Cover-letter canvas card (draft → edit → approve → download + versions)
  - **Files:** `apps/web/components/canvas/cover-letter-card.tsx`
  - **Acceptance:**
    - Overlay card modelled on `apps/web/components/canvas/salary-insights-card.tsx`, using
      `@ever-hust/ui/{card,button,badge,dialog}` + `cn()`.
    - Shows editable draft; an explicit **Approve** button that calls the approve route; a
      **Download PDF** action that appears ONLY when state is `rendered`; a version-history list.
    - No "Download" before `rendered`; no "approved" badge before the gate fires; nothing labelled
      "sent".
  - **Estimate:** 1 day

- [ ] T14 — Wire tool result into canvas sync
  - **Files:** `apps/web/hooks/use-canvas-sync.ts`
  - **Acceptance:**
    - New `case "coverLetterPipeline"` in `handleToolResult` surfaces the structured result (state,
      version, summary, job context) into canvas state and opens the cover-letter card.
    - Existing `case "generateCoverLetter"` is left intact (backward compatible); state shape
      extended without breaking existing consumers.
  - **Estimate:** 0.5 day

## Phase 6 — Tests + CI green

- [ ] T15 — E2E: generate → edit → approve → download PDF
  - **Files:** `tests/e2e/cover-letter.spec.ts`
  - **Acceptance:**
    - Playwright spec drives the chat to draft a letter, edits it, clicks the explicit Approve, then
      downloads a PDF; asserts the download is a non-empty `application/pdf`.
    - Asserts the Download control is absent before approval (gate cannot be skipped from the UI).
    - `pnpm test:e2e` green against `http://localhost:8443`.
  - **Estimate:** 1 day

- [ ] T16 — Full suite green + competitor-clean self-check
  - **Files:** (CI only) — run `pnpm lint`, `pnpm check-types`, `pnpm test`, `pnpm test:e2e`
  - **Acceptance:**
    - All Jest projects and Playwright specs green; lint `--max-warnings 0` and type-check clean.
    - Grep the diff for competitor names (Article 11) — empty result before commit/push.
    - CI green on `develop`; `docs/specs/ROADMAP.md` progress updated for epic 10.
  - **Estimate:** 0.5 day

## Notes

- Write tests alongside each implementation task; do not batch testing into a final task (T15/T16
  are the E2E + suite-wide gate, not the first time tests appear).
- Verify **zero competitor references** before every commit (see constitution Article 11). Our own
  Ever brands — Ever Jobs, Ever Gauzy, Hust, Ever Co. — are fine.
- Human-in-the-loop is structural: the `approved` transition (T06/T07) is the only path to render;
  never auto-submit or auto-send.
- Update `docs/specs/ROADMAP.md` progress when an epic's tasks complete.
