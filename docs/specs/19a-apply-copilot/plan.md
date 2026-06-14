# Plan: 19a — Apply Copilot (HITL, never auto-submit)

| Field        | Value                              |
| ------------ | ---------------------------------- |
| Spec         | spec.md                            |
| Created      | 2026-06-14                         |
| Last updated | 2026-06-14                         |

## 1. Approach

This epic is the honest, ToS-respecting form of "AI applies for you": a copilot that **drafts
every field** of an application — proposal/cover, screening Q&A, and terms/rate — assembled from
the user's profile, the **#3 evaluation**, and the **#10 cover letter**, then presents a
review-and-edit surface that the user must **explicitly, un-overridably approve** before they
submit. Standalone Hust **never auto-submits**; the approval gate is structural (constitution
Article 4), not a prompt that can be talked around. The optional Ever Gauzy auto-apply seam stays
deferred, behind a flag + adapter, and itself per-application approval-gated (constitution
Article 2; `docs/GAUZY-INTEGRATION.md` Seam A).

The codebase already has the bones of an apply flow. `applyJob`
(`packages/ai/src/tools/apply-job.ts`) initiates an application, moves an `applications` row
through `pending → in_progress → submitted` (`packages/db/src/schema/applications.ts`), gates on
`users.subscriptionStatus in ("active","past_due")`, and returns the apply URL for the user to
finish manually. `submitAnswers` (`packages/ai/src/tools/submit-answers.ts`) records screening
Q&A into `applications.questionsAsked` / `answersProvided`. The chat UI already renders an explicit
confirm step via `apps/web/components/chat/tool-approval.tsx`. This epic **upgrades** that flow:
instead of merely opening a URL, the copilot first **assembles a complete, review-ready draft** of
all fields and surfaces it on the right-hand canvas for edit, then routes the actual submit through
the **#6 structural approval gate** before recording it.

The new work is one tool plus one canvas surface, layered additively on the dependency epics rather
than re-implementing them. A new `applyCopilot` tool
(`packages/ai/src/tools/apply-copilot.ts`) reads the grounded inputs already produced upstream — the
user's profile (via the existing `getUserProfile` discipline), the persisted `evaluations` row (#3),
and the cover-letter `context`/`allowedFacts` (#10/#6) — and returns a single Zod-validated
**`applyDraft` artifact** (#5 `defineArtifact`) carrying four sections: `details`, `proposal`,
`qa[]`, and `terms`. Every screening answer and proposal line is grounded and audited with the #6
`assertNoInvented` validator so the draft never fabricates employers, numbers, dates, or
credentials (constitution Article 7); unknown fields are emitted as explicit gaps, not invented.

Persistence is additive. The draft is stored on a new `application_drafts` table
(`packages/db/src/schema/application-drafts.ts`) keyed to `(userId, jobId)`, holding the four-section
`jsonb` payload, a `schemaVersion`, and an `approvalGateId` reference. The existing `applications`
table is **not** changed in shape — when the user approves, the draft's proposal/Q&A flow into the
existing `applications.coverLetter` / `questionsAsked` / `answersProvided` columns via the existing
`applyJob` + `submitAnswers` machinery, so the #2 applications pipeline and #2 Kanban inherit the
record for free.

The review-and-approve UX reuses existing seams end-to-end. `applyCopilot`'s structured result flows
to the canvas through a new `case "applyCopilot"` in `apps/web/hooks/use-canvas-sync.ts`, which opens
a new 4-tab review card (`apps/web/components/canvas/apply-draft-card.tsx`, modelled on the
`salary-insights-card.tsx` overlay-card template) — tabs for **Details / Proposal / Q&A / Terms**,
each field editable. The "Submit" affordance does not submit anything itself: it calls the **#6**
`requireApproval` primitive (`createApprovalGate` → `POST /api/approvals` approve → `assertApproved`),
and only an *approved* gate lets `applyJob`/`submitAnswers` advance the `applications` row. A new
`applyCopilot` entry is added to #6's `OUTWARD_ACTION_TOOLS` registry so the #6 invariant test
structurally proves the copilot cannot reach a submit path without an approved gate.

The system prompt (`packages/ai/src/prompts.ts`, mirrored to the Langfuse `orchestrator-system`
prompt) is updated to teach the orchestrator the apply-copilot flow: assemble the draft, present the
four tabs, **wait for explicit approval**, then record — never narrate a submit as done, never skip
the gate. The tool is exported from `packages/ai/src/tools/index.ts` and registered in
`packages/ai/src/agents/orchestrator.ts` (with `userId` injected server-side, never an LLM param).

The deferred Gauzy Seam-A handoff is scaffolded but inert: a thin
`packages/ai/src/integrations/gauzy-apply-adapter.ts` is introduced behind an off-by-default
`GAUZY_AUTO_APPLY_ENABLED` flag. When disabled (the standalone default and the only path this epic
ships live) the copilot stops at "approved draft + manual submit / deep-link". When enabled, an
already-approved draft *could* be handed to Gauzy AI's automation — still requiring the same
per-application approval gate. No hard Gauzy dependency is introduced; Ever Jobs API remains the only
hard external dependency (constitution Article 2).

Throughout: TypeScript on Node 24 + pnpm only; every AI tool emits a Zod-validated summary alongside
prose (Article 5); Jest unit tests are written alongside each source file and a Playwright E2E proves
the draft → edit → approve → record flow; the no-skip-gate invariant is asserted in a unit test; CI
(lint, type-check, unit, E2E) must be green before merge (Article 10). No existing table, tool, or
behaviour is removed (Article 9 additive rule). Zero competitor references anywhere (Article 11).

## 2. Phases

### Phase 1 — Draft persistence (`application_drafts` table)

- Goal: A durable, queryable home for an assembled application draft, keyed to `(userId, jobId)`,
  referencing the #6 approval gate — without touching the existing `applications` table shape.
- Deliverables:
  - New `application_drafts` table (`packages/db/src/schema/application-drafts.ts`), exported from
    `packages/db/src/schema/index.ts`, pushed via `pnpm db:push`.
  - House-style columns: `integer("id").primaryKey().generatedAlwaysAsIdentity()`; `user_id` text
    FK → `users.id` (`onDelete: "cascade"`); `job_id` integer FK → `jobs.id`; `status` text enum
    (`drafting | awaiting_approval | approved | recorded | discarded`); four-section `draft` jsonb
    (`$type<ApplyDraftPayload>`); `schema_version` integer default 1; `approval_gate_id` integer
    nullable; `created_at`/`updated_at` timestamps; unique `(user_id, job_id)` + indexes on
    `(user_id)` and `(user_id, status)`.
- Exit criteria: `pnpm db:push` applies the table cleanly with no destructive diff; importable as
  `import { applicationDrafts } from "@ever-hust/db"`; `pnpm test -- --selectProjects db` green.

### Phase 2 — `applyCopilot` assembly tool (grounded, structured, no-invent)

- Goal: One tool that assembles a complete, review-ready 4-section draft from the grounded upstream
  inputs (#3 evaluation, #10 cover letter, user profile), emits it as a #5 `applyDraft` artifact,
  audits it with #6 `assertNoInvented`, and persists it to `application_drafts`.
- Deliverables:
  - `packages/ai/src/tools/apply-copilot.ts` — `tool({ description, inputSchema, execute })` with
    a `.max()`-bounded Zod input (`jobId`, optional `tone`, optional `focusAreas`); `userId`
    injected server-side.
  - A #5 `applyDraft` per-kind schema/artifact (`defineArtifact("applyDraft", 1, applyDraftSchema)`)
    in `packages/ai/src/structured/schemas/apply-draft.ts`, validated with `assertArtifact` before
    the DB write.
  - Grounded assembly: reads the persisted `evaluations` row (#3), the `generateCoverLetter`
    `context`/`allowedFacts` (#10/#6), and profile fields; runs `assertNoInvented` over proposal +
    Q&A; emits unknowns as explicit `gaps`.
  - Export from `packages/ai/src/tools/index.ts`; register in
    `packages/ai/src/agents/orchestrator.ts` (`tools: { applyCopilot: { ... } }`, `userId` injected).
- Exit criteria: tool returns a schema-valid `applyDraft` artifact and an `application_drafts` row;
  no-invent audit flags fabricated facts in tests; `pnpm test -- --selectProjects ai` green.

### Phase 3 — 4-tab review UI + structural approval gate (reuse #6)

- Goal: Surface the draft as an editable Details / Proposal / Q&A / Terms review card and require an
  explicit #6 approval before any submit; standalone Hust never auto-submits.
- Deliverables:
  - `apps/web/components/canvas/apply-draft-card.tsx` (4 tabs, each field editable; modelled on
    `salary-insights-card.tsx`), wired into the canvas via a new `case "applyCopilot"` in
    `apps/web/hooks/use-canvas-sync.ts` (plus `applyDraft` state + `clearApplyDraft`).
  - `apps/web/app/api/applications/draft/route.ts` — `GET`/`PATCH` to load and save edits to a
    draft (`requireSessionUser`, `applyRateLimit(userId, "authenticated")`, Zod from
    `apps/web/lib/api-schemas.ts`, errors via `apps/web/lib/api-response.ts`).
  - "Submit" affordance creates a #6 approval gate (`createApprovalGate`) and posts to
    `POST /api/approvals`; on *approved*, calls the existing `applyJob` + `submitAnswers` path to
    record the proposal/Q&A into `applications`. `applyCopilot` added to #6's
    `OUTWARD_ACTION_TOOLS` registry.
  - `apps/web/components/chat/tool-approval.tsx` renders the copilot gate via the #6 generic
    `summary` path (no copilot-specific switch needed).
- Exit criteria: editing a field persists; the Submit path is blocked until an approved gate exists;
  an `applications` row is only advanced on approval; `pnpm test -- --selectProjects web-lib` green.

### Phase 4 — Prompt, invariant, tests & deferred Gauzy seam

- Goal: Teach the orchestrator the copilot flow, prove the gate can't be skipped, cover the flow
  end-to-end, and scaffold (inert, off-by-default) the optional Gauzy Seam-A handoff.
- Deliverables:
  - System-prompt section in `packages/ai/src/prompts.ts` (mirrored in the Langfuse
    `orchestrator-system` prompt) documenting `applyCopilot`: assemble → 4-tab review → **wait for
    explicit approval** → record; never auto-submit; never claim a submit it didn't make.
  - No-skip-gate invariant: `applyCopilot` added to the #6 invariant test set
    (`packages/ai/src/policy/approval-invariant.test.ts`) so it cannot reach the submit path without
    an approved gate (prompt-injection bypass case included).
  - Playwright E2E `tests/e2e/apply-copilot.spec.ts`: draft appears with 4 tabs → edit a field →
    Deny blocks submit (no `applications` row advances) → Approve records the application.
  - `packages/ai/src/integrations/gauzy-apply-adapter.ts` (new) behind `GAUZY_AUTO_APPLY_ENABLED`
    (default off): a no-op/standalone fallback when disabled; documented as still approval-gated when
    enabled. `.env.example` gains the flag.
- Exit criteria: invariant + unit + E2E green; flag defaults off and standalone path needs no Gauzy;
  full CI (lint, type-check, unit, E2E) green on `develop`; `docs/specs/ROADMAP.md` updated; zero
  competitor references.

## 3. Packages Touched

| Package                        | Change                                                                                                                                                                                                 |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/db`                  | New `application_drafts` table at `packages/db/src/schema/application-drafts.ts`; export from `packages/db/src/schema/index.ts`; `pnpm db:push`. **No change to `packages/db/src/schema/applications.ts`** (additive). |
| `packages/ai` (tool)           | New `packages/ai/src/tools/apply-copilot.ts`; export from `packages/ai/src/tools/index.ts`; register in `packages/ai/src/agents/orchestrator.ts` (`userId` injected server-side).                       |
| `packages/ai` (structured #5)  | New `packages/ai/src/structured/schemas/apply-draft.ts` (`defineArtifact("applyDraft", 1, …)`); validated with `assertArtifact` before the DB write. Reuses the #5 contract — no new contract code.     |
| `packages/ai` (policy #6)      | Add `"applyCopilot"` to the `OUTWARD_ACTION_TOOLS` registry (`packages/ai/src/policy/require-approval.ts`); reuse `createApprovalGate`/`assertApproved` and `assertNoInvented` — no new policy primitive. |
| `packages/ai` (prompt)         | `packages/ai/src/prompts.ts` — document the apply-copilot flow + never-auto-submit posture; mirror to the Langfuse `orchestrator-system` prompt.                                                        |
| `packages/ai` (Gauzy seam)     | New `packages/ai/src/integrations/gauzy-apply-adapter.ts` behind `GAUZY_AUTO_APPLY_ENABLED` (default off); inert standalone fallback. No hard Gauzy dependency.                                          |
| `apps/web` (canvas)            | New `apps/web/components/canvas/apply-draft-card.tsx` (4-tab review, editable; modelled on `apps/web/components/canvas/salary-insights-card.tsx`); add `case "applyCopilot"` + `applyDraft` state to `apps/web/hooks/use-canvas-sync.ts`. |
| `apps/web` (chat UI)           | `apps/web/components/chat/tool-approval.tsx` renders the copilot gate via the #6 generic `summary` path (no bespoke switch).                                                                            |
| `apps/web` (API)               | New `apps/web/app/api/applications/draft/route.ts` (`GET`/`PATCH` load/save edits); Zod in `apps/web/lib/api-schemas.ts`; errors via `apps/web/lib/api-response.ts`. Submit reuses `apps/web/app/api/approvals/route.ts` (#6). |
| `packages/jobs-api`            | (no change) — Ever Jobs API stays the only hard external dependency; the copilot reads already-synced `jobs` rows + persisted `evaluations`.                                                            |
| `packages/ui`                  | (no change) — reuse `@ever-hust/ui/<component>` (card, button, badge, tabs/dialog) and `cn()` from `@ever-hust/ui/lib/utils`.                                                                            |
| `packages/triggers`           | (no change) — assembly is on-demand; batch fan-out is a separate epic.                                                                                                                                  |
| `tests/e2e`                    | New `tests/e2e/apply-copilot.spec.ts` (draft → edit → deny-blocks → approve-records).                                                                                                                  |

## 4. Dependencies

| Library / Epic                           | Version            | Rationale                                                                                                          |
| ---------------------------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `ai` (Vercel AI SDK)                     | v6 (in repo)       | `tool({...})` envelope for `applyCopilot`; `generateObject({ schema })` for any LLM-reasoned draft sections — no new dep. |
| `zod`                                    | in repo            | `.max()`-bounded tool input + the `applyDraft` per-kind schema + API payload validation — no new dep.              |
| `drizzle-orm`                            | in repo            | `application_drafts` table in house style — no new dep.                                                            |
| `@ever-hust/ui`                          | workspace:*        | ShadCN card/button/badge/tabs for the 4-tab review card — reuse, no new dep.                                       |
| **Epic #5 — structured-output**          | landed/in-progress | Shared `defineArtifact`/`assertArtifact` contract the `applyDraft` artifact uses. **Hard upstream contract.**       |
| **Epic #6 — guardrails**                 | landed/in-progress | `requireApproval`/`createApprovalGate`/`assertApproved`, the `OUTWARD_ACTION_TOOLS` registry + invariant test, and `assertNoInvented`. **Hard upstream — the structural gate this epic depends on.** |
| **Epic #3 — evaluation engine**          | landed/in-progress | Source of the grounded `evaluations` row the draft assembles from (fit/strengths/gaps). Read-only consumer.        |
| **Epic #10 — cover-letter pipeline**     | landed/in-progress | Source of the grounded proposal/cover `context` + `allowedFacts`. Read-only consumer.                              |
| **Epic #2 — applications Kanban/pipeline** | landed/in-progress | Records the approved draft via the existing `applications` table; #2 surfaces the resulting status/pipeline.        |
| Ever Gauzy AI API (Seam A)               | optional, deferred | Off by default behind `GAUZY_AUTO_APPLY_ENABLED`; adapter only — never a hard dependency (Article 2).              |

No new direct npm dependency is introduced (constitution Article 10.5).

## 5. Risks & Mitigations

| Risk                                                                            | Likelihood | Impact | Mitigation                                                                                                                            |
| ------------------------------------------------------------------------------- | ---------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| LLM (or a prompt injection) tries to auto-submit without approval               | M          | H      | Enforcement is structural: `applyCopilot` in `OUTWARD_ACTION_TOOLS`, `assertApproved` before any `applications` write, plus the #6 invariant test (injection-bypass case) failing CI — not prompt text alone. |
| #6 / #5 not yet landed when this epic starts (concurrent sessions)              | M          | H      | Treat both as hard upstream contracts; if #6's `requireApproval`/registry or #5's `defineArtifact` are absent, block this epic's Phase 3/2 rather than re-implementing; coordinate shared edits to `orchestrator.ts`/`OUTWARD_ACTION_TOOLS` in one session/worktree. |
| Drafting fabricates an employer/number/credential not in the user's profile     | M          | H      | Ground assembly strictly in `evaluations` + cover-letter `allowedFacts` + profile; run `assertNoInvented` over proposal + Q&A; emit unknowns as explicit `gaps` (Article 7). |
| New `application_drafts` push diverges from prod schema                          | L          | M      | `pnpm db:push` against a non-prod DB first; additive table only (no column drops on `applications`); rollback = drop the new table, no data loss. |
| Editing in the 4-tab card drifts from what gets recorded on approval            | M          | M      | Single source of truth: the persisted `application_drafts.draft` jsonb is what the approval path reads; the card `PATCH`es that row; record reads the same row — no second copy. |
| Subscription gate UX regresses (apply is Pro-only today)                         | L          | M      | Preserve the existing `subscriptionStatus in ("active","past_due")` check from `apply-job.ts`/`submit-answers.ts`; surface `requiresUpgrade` unchanged. |
| Langfuse prompt drift overrides the documented never-auto-submit posture        | M          | M      | Update both the `packages/ai/src/prompts.ts` fallback AND the Langfuse `orchestrator-system` production prompt in the same change; note it in the task/PR. |
| Gauzy seam accidentally becomes a hard dependency                               | L          | H      | Adapter is import-isolated behind `GAUZY_AUTO_APPLY_ENABLED` (default off) with a standalone no-op fallback; a unit test asserts the standalone path needs no Gauzy env. |

## 6. Rollback Plan

- The whole feature is additive and flag-isolated:
  - Removing the `case "applyCopilot"` from `apps/web/hooks/use-canvas-sync.ts` falls through to the
    existing `default` (no-op) branch — the canvas simply ignores the result.
  - Unregistering `applyCopilot` from `packages/ai/src/agents/orchestrator.ts` and removing it from
    `OUTWARD_ACTION_TOOLS` returns the apply experience to today's `applyJob` + `submitAnswers` flow.
  - `application_drafts` is a new, isolated table referenced only by the new tool/route; dropping it
    (or leaving it unused) causes **no data loss** to `users`, `jobs`, `applications`, or `userJobs`.
  - The system-prompt edit is text-only; revert it or relabel the Langfuse `orchestrator-system`
    prompt to a prior version.
- The Gauzy seam ships off (`GAUZY_AUTO_APPLY_ENABLED` unset); standalone behaviour is the default,
  so disabling the seam needs no schema change.
- The approval gate is the existing #6 mechanism; nothing in this epic weakens it on rollback — the
  user still can never have anything submitted without approval.

## 7. Migration Plan (if applicable)

- **Schema:** `application_drafts` is brand new — no backfill. The `applications` table is unchanged;
  existing in-flight `applications` rows keep working under the current status machine and simply
  have no draft row until the user runs the copilot on that job.
- **Existing tools:** `applyJob` / `submitAnswers` are reused, not replaced — when an approved draft
  exists, its proposal/Q&A flow into the same `coverLetter` / `questionsAsked` / `answersProvided`
  columns, so the #2 pipeline reads them with no migration.
- **Prompt:** updating `packages/ai/src/prompts.ts` is forward-only; the Langfuse production prompt
  must be edited in the same change so the DB copy does not override the never-auto-submit language.
- **Consumers (#2 Kanban):** read the resulting `applications` rows unchanged; no migration before
  this epic lands.
- **Gauzy seam:** introducing `GAUZY_AUTO_APPLY_ENABLED` is additive and default-off; no consumer is
  affected until an operator explicitly enables it.

## 8. Open Questions for Plan

- Should the four draft sections live as one `draft` jsonb blob on `application_drafts`, or as four
  typed columns? (Leaning: one versioned `jsonb` `$type<ApplyDraftPayload>` so the #5 `applyDraft`
  schema is the single source of truth and a section can evolve without a migration.)
- Does `applyCopilot` create the #6 approval gate at assembly time (status `awaiting_approval`) or
  only when the user clicks Submit in the card? (Leaning: at Submit, so editing the draft never
  produces a stale/auto-expiring gate; confirm with the #6 owner re: gate TTL.)
- Should screening-question detection reuse the existing `applications.questionsAsked` shape from
  `submit-answers.ts` (question/fieldType/required/options), or derive questions fresh from the JD?
  (Leaning: reuse the existing shape so `submitAnswers` records the approved answers unchanged.)
- For the deep-link/manual-submit affordance, do we surface the job's `applyUrl ?? jobUrl` (as
  `apply-job.ts` does today) alongside the approved draft for copy-paste? (Leaning: yes — that is the
  standalone "submit" path; auto-submit stays the optional Gauzy seam only.)
- Is the apply-copilot gated to Pro (matching today's `applyJob`/`submitAnswers` subscription check),
  or is *drafting* free and only *recording/submit* Pro-gated? (Leaning: draft for all, record Pro —
  confirm with product; preserves the quality-over-quantity ethos without paywalling review.)
