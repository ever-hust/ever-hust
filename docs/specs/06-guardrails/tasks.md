# Tasks: 06 — Guardrails (HITL approval, cost gating, no-invent)

> Status legend: `[ ]` pending • `[~]` in-progress • `[x]` done • `[-]` dropped

## Phase 1 — Structural approval gate (`requireApproval`)

- [ ] T01 — Add `approval_gates` table schema
  - **Files:** `packages/db/src/schema/approval-gates.ts` (new); export from `packages/db/src/schema/index.ts`
  - **Acceptance:**
    - Table follows house style: `integer("id").primaryKey().generatedAlwaysAsIdentity()`;
      `text("user_id").notNull().references(() => users.id, { onDelete: "cascade" })`;
      `actionId text("action_id", { enum: [...outward actions] }).notNull()`;
      `jobId integer().references(() => jobs.id)` nullable; `applicationId integer()` nullable;
      `status text("status", { enum: ["pending","approved","denied","expired"] }).notNull().default("pending")`;
      `summary jsonb("summary").$type<{ title: string; description: string }>()`;
      `createdAt`/`updatedAt timestamp().notNull().defaultNow()`.
    - Indexes via `(table) => [ index("approval_gates_user_idx").on(table.userId), index("approval_gates_user_status_idx").on(table.userId, table.status) ]`.
    - Exported from `schema/index.ts` and importable as `import { approvalGates } from "@ever-hust/db"`.
  - **Estimate:** 0.5 day

- [ ] T02 — Push `approval_gates` to the database
  - **Files:** `packages/db/src/schema/index.ts` (consumes), `drizzle.config.ts` (schema = `./src/schema/index.ts`)
  - **Acceptance:**
    - `pnpm db:push` applies the new table against a non-prod DB with no errors and no destructive
      diff on existing tables.
    - `pnpm db:studio` shows `approval_gates` with the columns/indexes from T01.
  - **Estimate:** 0.5 day

- [ ] T03 — Build the `requireApproval` policy primitive + outward-action registry
  - **Files:** `packages/ai/src/policy/require-approval.ts` (new); `packages/ai/src/policy/index.ts` (new barrel); re-export from `packages/ai/src/index.ts`
  - **Acceptance:**
    - Exports `OUTWARD_ACTION_TOOLS` constant (e.g. `["applyJob","submitAnswers"]`).
    - Exports `createApprovalGate({ userId, actionId, jobId?, applicationId?, summary })` inserting a
      `pending` row and returning its id.
    - Exports `assertApproved({ userId, gateId })` that returns the row only when `status === "approved"`
      and belongs to the user; throws/returns a typed refusal otherwise.
    - `userId` is always server-supplied — never an LLM input param.
  - **Estimate:** 1 day

- [ ] T04 — Unit test the approval primitive (alongside T03)
  - **Files:** `packages/ai/src/policy/require-approval.test.ts` (new)
  - **Acceptance:**
    - Tests: pending gate is not approved; approved gate for the right user passes; approved gate for
      a different user is rejected; denied/expired gate is rejected.
    - `pnpm test -- --selectProjects ai` green for this file.
  - **Estimate:** 0.5 day

- [ ] T05 — Route `applyJob` through `requireApproval`
  - **Files:** `packages/ai/src/tools/apply-job.ts`; wrapper in `packages/ai/src/agents/orchestrator.ts`
  - **Acceptance:**
    - `applyJob.execute` calls `assertApproved` before the side-effecting transaction; absent/denied
      gate returns `{ applied: false, error: "Awaiting your approval", needsApproval: true, gateId }`
      without creating an `applications` row.
    - Existing `applications` status machine (`pending → in_progress → submitted`) and subscription
      gate (`subscriptionStatus in ("active","past_due")`) are preserved (additive, not replaced).
    - `userId` still injected by the orchestrator wrapper.
  - **Estimate:** 1 day

- [ ] T06 — Route `submitAnswers` through `requireApproval`
  - **Files:** `packages/ai/src/tools/submit-answers.ts`; wrapper in `packages/ai/src/agents/orchestrator.ts`
  - **Acceptance:**
    - `submitAnswers.execute` requires an approved gate before marking the application `submitted`;
      absent/denied gate returns `{ submitted: false, needsApproval: true, gateId }`.
    - Existing required-question validation + Pro-subscription check preserved.
  - **Estimate:** 1 day

- [ ] T07 — Approval API route (approve / deny a gate)
  - **Files:** `apps/web/app/api/approvals/route.ts` (new); Zod schema in `apps/web/lib/api-schemas.ts`; errors via `apps/web/lib/api-response.ts`
  - **Acceptance:**
    - `POST` authenticates via `requireSessionUser()` and `applyRateLimit(userId, "authenticated")`.
    - Validates `{ gateId: number, decision: "approve" | "deny" }` with Zod; rejects malformed input
      via `apiBadRequest()`.
    - Updates the gate `status` only when it belongs to the session user; returns the updated gate.
    - Default `Cache-Control: private, no-store` headers applied.
  - **Estimate:** 1 day

- [ ] T08 — Unit test the approval API route (alongside T07)
  - **Files:** `apps/web/app/api/approvals/route.test.ts` (new) — `web-lib` Jest project
  - **Acceptance:**
    - Tests: unauthenticated → 401; bad body → 400; approving another user's gate → rejected;
      valid approve/deny → gate status updated.
    - `pnpm test -- --selectProjects web-lib` green for this file.
  - **Estimate:** 0.5 day

- [ ] T09 — Generalize the approval card to read gate `actionId`/`summary`
  - **Files:** `apps/web/components/chat/tool-approval.tsx`; `apps/web/hooks/use-canvas-sync.ts`
  - **Acceptance:**
    - `getToolDisplay` renders title/description from the gate's `summary` (falling back to the
      generic card for unknown actions), so a new outward tool needs no UI edit.
    - `use-canvas-sync.ts` gains an `applyJob`/approval `case` that surfaces a pending gate
      (`needsApproval`/`gateId`) to the chat UI; the `default` branch still logs unknowns in dev.
    - Approve/Deny buttons call `POST /api/approvals`.
  - **Estimate:** 1 day

- [ ] T10 — Approval invariant test (prompt-injection bypass guard)
  - **Files:** `packages/ai/src/policy/approval-invariant.test.ts` (new)
  - **Acceptance:**
    - Iterates `OUTWARD_ACTION_TOOLS`; asserts each tool's `execute` returns a `needsApproval` refusal
      (and creates no side-effecting row) when called with no approved gate.
    - Includes a case where the params simulate an injected "skip approval" instruction and confirms
      the side effect is still blocked.
    - `pnpm test -- --selectProjects ai` green.
  - **Estimate:** 0.5 day

## Phase 2 — No-invent grounding validator (`assertNoInvented`)

- [ ] T11 — Implement `assertNoInvented` validator
  - **Files:** `packages/ai/src/policy/assert-no-invented.ts` (new); export from `packages/ai/src/policy/index.ts`
  - **Acceptance:**
    - Signature `assertNoInvented({ text, allowedFacts }: { text: string; allowedFacts: string[] }): { grounded: boolean; flaggedClaims: string[] }`.
    - Flags employers / numbers / dates / credentials in `text` not traceable to `allowedFacts`;
      returns them as `flaggedClaims` (advisory — never throws, never blocks generation).
    - Empty/grounded text returns `{ grounded: true, flaggedClaims: [] }`.
  - **Estimate:** 1 day

- [ ] T12 — Unit test `assertNoInvented` (alongside T11)
  - **Files:** `packages/ai/src/policy/assert-no-invented.test.ts` (new)
  - **Acceptance:**
    - Tests: fully grounded prose passes; fabricated employer is flagged; an unverifiable salary/number
      is flagged; a real CV skill from `allowedFacts` is not flagged.
    - `pnpm test -- --selectProjects ai` green.
  - **Estimate:** 0.5 day

- [ ] T13 — Surface `allowedFacts` from the cover-letter tool
  - **Files:** `packages/ai/src/tools/generate-cover-letter.ts`
  - **Acceptance:**
    - The tool's return object includes an `allowedFacts: string[]` derived from its existing grounded
      `context` (user name/headline/skills, job title/company/skills/location) so callers can audit prose.
    - No change to existing `generated`/`context`/`instruction` fields (additive).
    - Existing `generate-cover-letter`-related tests still pass.
  - **Estimate:** 0.5 day

- [ ] T14 — Document the no-invent + structural-approval posture in the system prompt
  - **Files:** `packages/ai/src/prompts.ts` (`DEFAULT_ORCHESTRATOR_PROMPT`); mirror in Langfuse prompt `orchestrator-system` (label `production`)
  - **Acceptance:**
    - Prompt gains a "Grounding / no-invent" section (never fabricate employers, numbers, dates,
      credentials; mark unknowns as gaps) and a note that outward actions are blocked server-side
      until the user approves.
    - The Langfuse `orchestrator-system` production prompt is updated to match (noted in PR so the DB
      copy does not override the fallback).
    - `pnpm test -- --selectProjects ai` (`prompts.test.ts`) green.
  - **Estimate:** 0.5 day

## Phase 3 — Cost gate + follow-up cadence policy

- [ ] T15 — Implement `withCostGate` wrapper
  - **Files:** `packages/ai/src/policy/cost-gate.ts` (new); `packages/ai/src/policy/limits.ts` (new); export from `packages/ai/src/policy/index.ts`
  - **Acceptance:**
    - `withCostGate({ scoreFloor?, quota? })(execute)` returns a wrapped `execute` that:
      blocks with a typed refusal when a passed fit `score` is below `scoreFloor`; blocks when the
      user is over `quota` (reusing `checkRateLimit` from `packages/ai/src/rate-limit.ts` with a
      distinct prefix); otherwise calls through.
    - Per-tier quota constants live in `limits.ts` or reuse `FREE_LIMITS` from `@ever-hust/stripe`.
    - `userId` is server-supplied, never an LLM param.
  - **Estimate:** 1 day

- [ ] T16 — Unit test `withCostGate` (alongside T15)
  - **Files:** `packages/ai/src/policy/cost-gate.test.ts` (new)
  - **Acceptance:**
    - Tests: score above floor passes; score below floor blocks; under quota passes; over quota blocks;
      quota prefix is isolated from `search`/`cover` limiters.
    - `pnpm test -- --selectProjects ai` green.
  - **Estimate:** 0.5 day

- [ ] T17 — Implement `followUpPolicy` cadence cap
  - **Files:** `packages/ai/src/policy/follow-up-policy.ts` (new); export from `packages/ai/src/policy/index.ts`
  - **Acceptance:**
    - Exports `followUpPolicy` (max follow-ups per application, min interval) and
      `canSendFollowUp({ sentCount, lastSentAt, now }) => boolean`.
    - Blocks when `sentCount >= max` or when `now - lastSentAt < minInterval`.
    - Pure function with no I/O; ready for epic #9 to consume.
  - **Estimate:** 0.5 day

- [ ] T18 — Unit test `followUpPolicy` (alongside T17)
  - **Files:** `packages/ai/src/policy/follow-up-policy.test.ts` (new)
  - **Acceptance:**
    - Tests: under cap + past interval allowed; at cap blocked; within min interval blocked.
    - `pnpm test -- --selectProjects ai` green.
  - **Estimate:** 0.5 day

## Phase 4 — Terms copy + E2E policy verification

- [ ] T19 — Update Terms copy to match the HITL / advisory posture
  - **Files:** `apps/web/app/(marketing)/terms/page.tsx`
  - **Acceptance:**
    - Terms state: Hust never auto-submits / applies / sends on the user's behalf without explicit
      approval; AI output is advisory and must be reviewed; the user owns their data.
    - Contact addresses use `ever.co`; no `everjobs.ai` references in product copy; no competitor names.
  - **Estimate:** 0.5 day

- [ ] T20 — Playwright E2E for the approval gate + Terms
  - **Files:** `tests/e2e/guardrails.spec.ts` (new)
  - **Acceptance:**
    - An outward action surfaces the approval card; clicking Deny blocks the action (no submitted
      application); clicking Approve allows it.
    - The Terms page renders the no-auto-submit / advisory language.
    - `pnpm test:e2e` green against `http://localhost:8443`.
  - **Estimate:** 1 day

- [ ] T21 — Full CI green + roadmap update
  - **Files:** `docs/specs/ROADMAP.md`
  - **Acceptance:**
    - `pnpm lint`, `pnpm check-types`, `pnpm test`, `pnpm test:e2e` all green on `develop`.
    - Epic 06 progress updated in `docs/specs/ROADMAP.md`.
    - Grep confirms zero competitor references in all changed files (Article 11).
  - **Estimate:** 0.5 day

## Notes

- Write tests alongside each implementation task (T04 with T03, T08 with T07, T10 guards Phase 1,
  T12 with T11, T16 with T15, T18 with T17); do not batch testing into a final task.
- `userId` is injected server-side by the orchestrator for every tool — never an LLM-supplied param.
- New table (`approval_gates`) requires `pnpm db:push` (T02); never `npm`/`yarn`.
- Verify **zero competitor references** before every commit (constitution Article 11); our own Ever
  brands (Ever Jobs, Ever Gauzy, Hust, Ever Co.) are fine.
- Keep the Gauzy auto-apply seam optional + per-action approval-gated (constitution Article 2/4).
- Update `docs/specs/ROADMAP.md` progress when this epic's tasks complete.
