# Tasks: 19a — Apply Copilot (HITL, never auto-submit)

> Status legend: `[ ]` pending • `[~]` in-progress • `[x]` done • `[-]` dropped

## Phase 1 — Draft persistence (`application_drafts` table)

- [ ] T01 — Add `application_drafts` table schema
  - **Files:** `packages/db/src/schema/application-drafts.ts` (new); export from `packages/db/src/schema/index.ts`
  - **Acceptance:**
    - House style: `integer("id").primaryKey().generatedAlwaysAsIdentity()`;
      `text("user_id").notNull().references(() => users.id, { onDelete: "cascade" })`;
      `integer("job_id").notNull().references(() => jobs.id, { onDelete: "cascade" })`;
      `status text("status", { enum: ["drafting","awaiting_approval","approved","recorded","discarded"] }).notNull().default("drafting")`;
      `draft jsonb("draft").$type<ApplyDraftPayload>().notNull()` (four sections: `details`, `proposal`, `qa[]`, `terms`, plus `gaps[]`);
      `schemaVersion integer("schema_version").notNull().default(1)`;
      `approvalGateId integer("approval_gate_id")` nullable (refs the #6 `approval_gates` row);
      `createdAt`/`updatedAt timestamp().notNull().defaultNow()`.
    - Constraints/indexes via `(table) => [ unique("application_drafts_user_job_unique").on(table.userId, table.jobId), index("application_drafts_user_idx").on(table.userId), index("application_drafts_user_status_idx").on(table.userId, table.status) ]`.
    - `ApplyDraftPayload` type exported for DX; `packages/db/src/schema/applications.ts` is **not** modified.
    - Exported from `schema/index.ts` and importable as `import { applicationDrafts } from "@ever-hust/db"`.
  - **Estimate:** 0.5 day

- [ ] T02 — Push `application_drafts` to the database
  - **Files:** `packages/db/src/schema/index.ts` (consumes), `drizzle.config.ts` (schema = `./src/schema/index.ts`)
  - **Acceptance:**
    - `pnpm db:push` applies the new table against a non-prod DB with no errors and no destructive
      diff on `applications`, `users`, `jobs`, or `userJobs`.
    - `pnpm db:studio` shows `application_drafts` with the columns/unique/indexes from T01.
  - **Estimate:** 0.5 day

- [ ] T03 — Unit test the schema/type round-trip (alongside T01)
  - **Files:** `packages/db/src/schema/application-drafts.test.ts` (new) — `db` Jest project
  - **Acceptance:**
    - A valid `ApplyDraftPayload` (details/proposal/qa/terms/gaps) type-checks and round-trips through
      the `draft` `$type`; an out-of-enum `status` is rejected at the type level.
    - `pnpm test -- --selectProjects db` green for this file.
  - **Estimate:** 0.5 day

## Phase 2 — `applyCopilot` assembly tool (grounded, structured, no-invent)

- [ ] T04 — Define the `applyDraft` structured-output schema (#5)
  - **Files:** `packages/ai/src/structured/schemas/apply-draft.ts` (new); export from `packages/ai/src/structured/index.ts`
  - **Acceptance:**
    - `defineArtifact("applyDraft", 1, applyDraftSchema)` where `applyDraftSchema` is a `.max()`-bounded
      Zod object: `details` (name/email/headline/location, all grounded), `proposal` (string, `.max()`),
      `qa` (array of `{ questionId, question, answer }`, `.max()`), `terms` (`{ rate?, availability?, location? }`), and `gaps` (string[]) for unknowns.
    - Exports the inferred `ApplyDraftSummary` TS type; mirrors the `ApplyDraftPayload` shape used by `application_drafts`.
    - No free-form blob fields (only whitelisted, queryable fields).
  - **Estimate:** 0.5 day

- [ ] T05 — Unit test the `applyDraft` schema (alongside T04)
  - **Files:** `packages/ai/src/structured/schemas/apply-draft.test.ts` (new)
  - **Acceptance:**
    - Tests: a valid draft parses; an over-`.max()` proposal/Q&A is rejected; missing required sections
      are rejected; `schemaVersion === 1`.
    - `pnpm test -- --selectProjects ai` green for this file.
  - **Estimate:** 0.5 day

- [ ] T06 — Build the `applyCopilot` assembly tool
  - **Files:** `packages/ai/src/tools/apply-copilot.ts` (new)
  - **Acceptance:**
    - `tool({ description, inputSchema, execute })` with a `.max()`-bounded Zod input:
      `userId: z.string().optional()` (server-injected, never LLM-supplied), `jobId: z.number()`,
      `tone?: z.enum([...])`, `focusAreas?: z.array(z.string().max(200)).max(10)`.
    - `execute` reads the user profile (existing `getUserProfile`-style fields, PII-stripped), the
      persisted `evaluations` row (#3) for the job, and the `generateCoverLetter` `context` +
      `allowedFacts` (#10/#6), then assembles the four sections (`details`, `proposal`, `qa[]`, `terms`)
      plus `gaps[]` for unknowns.
    - Builds the result via `defineArtifact("applyDraft", 1, …)` and calls `assertArtifact(...)` before
      persisting an `application_drafts` row (status `drafting`); returns `{ assembled: true, jobId, draftId, draft }`.
    - Preserves the existing Pro check (`subscriptionStatus in ("active","past_due")`) for the record
      path; drafting surfaces `requiresUpgrade` consistently with `apply-job.ts` if product gates drafting.
    - Errors are caught and returned as `{ assembled: false, error }` (mirrors existing tool error shape), never thrown to the user.
  - **Estimate:** 1 day

- [ ] T07 — Apply the #6 no-invent audit to the assembled draft (alongside T06)
  - **Files:** `packages/ai/src/tools/apply-copilot.ts`; consumes `assertNoInvented` from `packages/ai/src/policy`
  - **Acceptance:**
    - The proposal text and every Q&A answer are passed through `assertNoInvented({ text, allowedFacts })`
      using the cover-letter `allowedFacts` + profile/evaluation facts.
    - Flagged claims are moved into the draft's `gaps[]` (and not silently kept as facts); the audit is
      advisory and never throws / never 500s the user.
  - **Estimate:** 0.5 day

- [ ] T08 — Unit test `applyCopilot` (alongside T06/T07)
  - **Files:** `packages/ai/src/tools/apply-copilot.test.ts` (new)
  - **Acceptance:**
    - Tests: a grounded draft assembles all four sections + persists a row; a fabricated employer/number
      injected via the cover-letter context is flagged into `gaps[]` (no-invent); missing evaluation →
      graceful `{ assembled: false }` (no orphan row); `userId` absent → not-authenticated refusal.
    - `pnpm test -- --selectProjects ai` green for this file.
  - **Estimate:** 0.5 day

- [ ] T09 — Export + register `applyCopilot` in the orchestrator
  - **Files:** `packages/ai/src/tools/index.ts`; `packages/ai/src/agents/orchestrator.ts`
  - **Acceptance:**
    - `export { applyCopilotTool } from "./apply-copilot";` added to `tools/index.ts`.
    - Registered in the `tools: { ... }` object in `createOrchestratorStream` with the server-side
      `userId` injection wrapper (`execute: (params, opts) => applyCopilotTool.execute!({ ...params, userId }, opts)`), matching the `applyJob`/`submitAnswers` pattern; `stopWhen: stepCountIs(5)` unchanged.
    - `pnpm test -- --selectProjects ai` (`orchestrator.test.ts`) green; tool count assertion updated.
  - **Estimate:** 0.5 day

## Phase 3 — 4-tab review UI + structural approval gate (reuse #6)

- [ ] T10 — Build the 4-tab editable review card
  - **Files:** `apps/web/components/canvas/apply-draft-card.tsx` (new)
  - **Acceptance:**
    - Renders tabs **Details / Proposal / Q&A / Terms**, modelled on
      `apps/web/components/canvas/salary-insights-card.tsx`; uses `@ever-hust/ui/<component>` (card,
      button, badge, tabs/dialog) and `cn()` from `@ever-hust/ui/lib/utils`.
    - Every field is editable; `gaps[]` are shown distinctly as "needs your input" (never auto-filled).
    - A "Submit" button and a manual-submit / deep-link affordance (`applyUrl ?? jobUrl`) are present;
      Submit does **not** submit directly — it triggers the approval flow (T12).
  - **Estimate:** 1 day

- [ ] T11 — Wire `applyCopilot` into canvas sync
  - **Files:** `apps/web/hooks/use-canvas-sync.ts`
  - **Acceptance:**
    - Adds `case "applyCopilot"` to `handleToolResult` that sets a new `applyDraft` state field from the
      tool result and renders `ApplyDraftCard`; adds a `clearApplyDraft` callback (mirrors
      `clearSalaryInsights`/`clearCoverLetter`).
    - The `default` branch still logs unknown tools in dev; existing cases are untouched (additive).
  - **Estimate:** 0.5 day

- [ ] T12 — Draft load/save API route
  - **Files:** `apps/web/app/api/applications/draft/route.ts` (new); Zod schema in `apps/web/lib/api-schemas.ts`; errors via `apps/web/lib/api-response.ts`
  - **Acceptance:**
    - `GET` returns the session user's draft for a `jobId`; `PATCH` saves edited sections back to the
      `application_drafts.draft` jsonb (the single source of truth read on approval).
    - `requireSessionUser()` + `applyRateLimit(userId, "authenticated")`; body validated with Zod;
      malformed input → `apiBadRequest()`; only the owner's draft is mutated.
    - Default `Cache-Control: private, no-store` headers applied.
  - **Estimate:** 1 day

- [ ] T13 — Unit test the draft API route (alongside T12)
  - **Files:** `apps/web/app/api/applications/draft/route.test.ts` (new) — `web-lib` Jest project
  - **Acceptance:**
    - Tests: unauthenticated → 401; bad body → 400; editing another user's draft → rejected; valid
      `PATCH` updates the `draft` jsonb.
    - `pnpm test -- --selectProjects web-lib` green for this file.
  - **Estimate:** 0.5 day

- [ ] T14 — Route the Submit affordance through the #6 approval gate
  - **Files:** `apps/web/components/canvas/apply-draft-card.tsx`; `packages/ai/src/policy/require-approval.ts` (add `"applyCopilot"` to `OUTWARD_ACTION_TOOLS`); reuses `apps/web/app/api/approvals/route.ts`
  - **Acceptance:**
    - "Submit" calls `createApprovalGate({ userId, actionId: "applyCopilot", jobId, summary })` and posts
      the decision to `POST /api/approvals`; only an **approved** gate lets the record path run.
    - On approval, the approved draft's proposal/Q&A are recorded via the existing `applyJob` +
      `submitAnswers` machinery into `applications.coverLetter` / `questionsAsked` / `answersProvided`
      (no new write path; the #2 pipeline inherits the row).
    - `"applyCopilot"` appears in `OUTWARD_ACTION_TOOLS`; standalone Hust never auto-submits.
  - **Estimate:** 1 day

- [ ] T15 — Render the copilot gate in the approval card (generic #6 path)
  - **Files:** `apps/web/components/chat/tool-approval.tsx`
  - **Acceptance:**
    - The copilot gate renders via the gate's `summary` (the generic `default` path), with no
      copilot-specific `switch` branch required; Approve/Deny call `POST /api/approvals`.
    - Existing `applyJob` display branch is untouched (additive).
  - **Estimate:** 0.5 day

## Phase 4 — Prompt, invariant, tests & deferred Gauzy seam

- [ ] T16 — Document the apply-copilot flow in the system prompt
  - **Files:** `packages/ai/src/prompts.ts` (`DEFAULT_ORCHESTRATOR_PROMPT`); mirror in the Langfuse prompt `orchestrator-system` (label `production`)
  - **Acceptance:**
    - Adds an `applyCopilot` capability line + an "Apply Copilot" section: assemble a complete 4-section
      draft, present the Details/Proposal/Q&A/Terms tabs, **wait for explicit user approval**, then
      record — never auto-submit, never claim a submit that didn't happen, ground every field (no-invent).
    - The Langfuse `orchestrator-system` production prompt is updated to match (noted in the PR so the
      DB copy does not override the fallback).
    - `pnpm test -- --selectProjects ai` (`prompts.test.ts`) green.
  - **Estimate:** 0.5 day

- [ ] T17 — Add `applyCopilot` to the no-skip-gate invariant test
  - **Files:** `packages/ai/src/policy/approval-invariant.test.ts` (extends the #6 invariant)
  - **Acceptance:**
    - The invariant set includes `"applyCopilot"`; asserts the copilot submit/record path cannot run
      without an approved gate (returns a `needsApproval` refusal and advances no `applications` row).
    - Includes a prompt-injection "skip approval" case that confirms the record is still blocked.
    - `pnpm test -- --selectProjects ai` green.
  - **Estimate:** 0.5 day

- [ ] T18 — Scaffold the deferred Gauzy Seam-A adapter (off by default)
  - **Files:** `packages/ai/src/integrations/gauzy-apply-adapter.ts` (new); `apps/web/.env.example`
  - **Acceptance:**
    - Exports a thin adapter behind `GAUZY_AUTO_APPLY_ENABLED` (default off): when disabled, returns a
      standalone no-op (`{ handedOff: false, reason: "standalone" }`); when enabled, documents the
      per-application approval-gated handoff to Gauzy AI automation (no live call shipped this epic).
    - No hard Gauzy import at module top level that would break a standalone build; `.env.example` gains
      `GAUZY_AUTO_APPLY_ENABLED` with a comment that it is optional + off by default.
  - **Estimate:** 0.5 day

- [ ] T19 — Unit test the Gauzy adapter standalone fallback (alongside T18)
  - **Files:** `packages/ai/src/integrations/gauzy-apply-adapter.test.ts` (new)
  - **Acceptance:**
    - Tests: with the flag unset/false the adapter returns the standalone no-op and requires no Gauzy env;
      with the flag set the handoff still requires an approved gate (per-application approval preserved).
    - `pnpm test -- --selectProjects ai` green.
  - **Estimate:** 0.5 day

- [ ] T20 — Playwright E2E for the apply-copilot flow
  - **Files:** `tests/e2e/apply-copilot.spec.ts` (new)
  - **Acceptance:**
    - Draft appears on the canvas with the 4 tabs (Details/Proposal/Q&A/Terms); editing a field persists
      after reload; clicking **Deny** blocks the submit (no `applications` row advances); clicking
      **Approve** records the application.
    - `pnpm test:e2e` green against `http://localhost:8443`.
  - **Estimate:** 1 day

- [ ] T21 — Full CI green + roadmap update
  - **Files:** `docs/specs/ROADMAP.md`
  - **Acceptance:**
    - `pnpm lint`, `pnpm check-types`, `pnpm test`, `pnpm test:e2e` all green on `develop`.
    - Epic 19a progress updated in `docs/specs/ROADMAP.md`.
    - Grep confirms zero competitor references in all changed files (Article 11).
  - **Estimate:** 0.5 day

## Notes

- Write tests alongside each implementation task (T03 with T01, T05 with T04, T08 with T06/T07,
  T13 with T12, T17 guards Phase 3/4, T19 with T18); do not batch testing into a final task.
- `userId` is injected server-side by the orchestrator for every tool — never an LLM-supplied param.
- New table (`application_drafts`) requires `pnpm db:push` (T02); never `npm`/`yarn`.
- This epic is **additive**: it reuses `applyJob` / `submitAnswers` / the `applications` table and
  the #6 approval gate — nothing existing is removed or replaced (constitution Article 9).
- Standalone Hust **never auto-submits**; the #6 approval gate is structural. The Gauzy Seam-A
  handoff stays optional, off by default (`GAUZY_AUTO_APPLY_ENABLED`), and per-application
  approval-gated (constitution Articles 2 & 4).
- Hard upstream contracts: #5 (`defineArtifact`/`assertArtifact`), #6 (`requireApproval` +
  `OUTWARD_ACTION_TOOLS` + `assertNoInvented`), #3 (`evaluations`), #10 (cover-letter `allowedFacts`).
- Verify **zero competitor references** before every commit (constitution Article 11); our own Ever
  brands (Ever Jobs, Ever Gauzy, Hust, Ever Co.) are fine.
- Update `docs/specs/ROADMAP.md` progress when this epic's tasks complete.
