# Plan: 06 — Guardrails (HITL approval, cost gating, no-invent)

| Field        | Value                              |
| ------------ | ---------------------------------- |
| Spec         | spec.md                            |
| Created      | 2026-06-14                         |
| Last updated | 2026-06-14                         |

## 1. Approach

This epic encodes Hust's brand promises — **human-in-the-loop**, **quality over quantity**, and
**grounded / no-invent** — as **server-side policy primitives** rather than prose hints in a system
prompt that a jailbreak could talk around. The work is deliberately a *platform seam*: it ships a
small, reusable policy module that every current and future AI tool calls, plus the matching Terms
copy. The features that consume these primitives (apply, document generation, follow-up cadence,
batch evaluation) are out of scope here — this epic only provides the shared building blocks they
will call. This keeps blast radius small and lets later epics inherit the guardrails for free.

The codebase already half-implements the approval pattern: `applyJob` (`packages/ai/src/tools/apply-job.ts`)
and `submitAnswers` (`packages/ai/src/tools/submit-answers.ts`) both carry the
`REQUIRES USER APPROVAL` description string, gate on `users.subscriptionStatus`, and move an
`applications` row through a `pending → in_progress → submitted` state machine. The client side
already renders an explicit confirm step via `apps/web/components/chat/tool-approval.tsx`. The
problem is that this approval discipline is **convention, not enforcement**: the gate lives in the
prompt and in a hand-written `getToolDisplay` switch, so a new outward-action tool can be added that
forgets it, and an LLM that ignores the "ALWAYS confirm" instruction is not structurally stopped.
Phase 1 fixes that by extracting a single, reusable `requireApproval(actionId)` primitive plus a
**registry of which tools are outward actions**, and an **invariant test** that fails CI if any
outward-action tool can reach its side-effecting path without an approved gate row.

Phase 2 adds the **no-invent** primitive. Generation tools (`generateCoverLetter` today; the
document epics #10/#11/#12 later) already pass a `context` object of *real* user + job fields to the
model and instruct it "Do NOT include placeholders — use the actual data provided"
(`packages/ai/src/tools/generate-cover-letter.ts`). We harden this into a reusable
`assertNoInvented({ text, allowedFacts })` validator that flags claims (employers, numbers, dates,
credentials) not traceable to the grounded `context`, marking them as gaps rather than facts. This
is intentionally a **light, advisory post-generation check** layered on top of the existing prompt
discipline (constitution Article 7) — it does not replace the structured-output contract from
**epic #5**, it composes with it: the `summary` object from `#5` is the whitelisted, queryable
surface; `assertNoInvented` audits the prose against the grounded facts that produced that summary.

Phase 3 adds the two **cost / cadence policy helpers**. `withCostGate({ scoreFloor?, quota? })`
wraps an expensive tool's `execute` so generation (PDF render, batch evaluation) only runs when a
job's fit score clears a floor and/or the user is under a per-tier quota — reusing the existing
Upstash sliding-window plumbing in `packages/ai/src/rate-limit.ts` (`checkRateLimit`,
`checkSearchLimit`). `followUpPolicy` exposes a central cadence cap (max follow-ups per application,
min interval) that **epic #9 (follow-up cadence)** will read so nudging can never become spam. Both
helpers are pure policy with unit tests; the consuming features wire them later.

Phase 4 aligns **product and policy**: the Terms page (`apps/web/app/(marketing)/terms/page.tsx`)
gets copy asserting *no auto-submit*, *AI is advisory*, and *user owns their data* — so the legal
posture matches the structural guardrails. Contact addresses stay on `ever.co` per brand rules.

Throughout: no tables are removed and no existing tool behaviour is deleted (constitution Article 9
additive rule / workspace non-negotiable #9). One **new table** is added —
`approval_gates` — to make the approval step durable, auditable, and impossible to skip via prompt
(it is the state the invariant test asserts on). It is applied with `pnpm db:push` per the repo's
push-based Drizzle workflow. The Gauzy auto-apply seam stays optional and per-action approval-gated;
nothing in this epic introduces a hard Gauzy dependency (constitution Article 2).

## 2. Phases

### Phase 1 — Structural approval gate (`requireApproval`)

- Goal: Make the human-approval step an un-overridable **server-side state transition**, shared by
  every outward-action tool, with an invariant test that prevents regressions.
- Deliverables:
  - New `approval_gates` table (`packages/db/src/schema/approval-gates.ts`, exported from
    `packages/db/src/schema/index.ts`, pushed via `pnpm db:push`).
  - New policy module `packages/ai/src/policy/require-approval.ts` exporting
    `requireApproval(actionId)`, `createApprovalGate(...)`, `assertApproved(...)`, and an
    `OUTWARD_ACTION_TOOLS` registry constant.
  - `applyJob` and `submitAnswers` refactored to create/consume an approval gate instead of relying
    only on the prompt + `applications` status.
  - Approval API route `apps/web/app/api/approvals/route.ts` (approve/deny by gate id).
  - `tool-approval.tsx` reads the gate's `actionId`/`summary` instead of a hard-coded switch.
  - Invariant Jest test: every tool in `OUTWARD_ACTION_TOOLS` cannot reach its side-effect path
    without an approved gate row (prompt-injection bypass test included).
- Exit criteria: invariant test passes; `applyJob`/`submitAnswers` reject when no approved gate
  exists; `pnpm db:push` applies the table cleanly; `pnpm test -- --selectProjects ai db` green.

### Phase 2 — No-invent grounding validator (`assertNoInvented`)

- Goal: A reusable post-generation check that flags ungrounded claims in AI-written artifacts and
  marks them as gaps, composing with the epic #5 structured-output `summary`.
- Deliverables:
  - `packages/ai/src/policy/assert-no-invented.ts` exporting
    `assertNoInvented({ text, allowedFacts }) => { grounded: boolean; flaggedClaims: string[] }`.
  - `generateCoverLetter` returns the `allowedFacts` set (from its existing grounded `context`) so
    callers/consumers can audit prose; the no-invent invariant is documented for #10/#11/#12.
  - System-prompt section in `packages/ai/src/prompts.ts` documenting the no-invent posture
    (mirror in the Langfuse `orchestrator-system` prompt is noted in the task).
- Exit criteria: validator unit tests cover grounded-pass, fabricated-employer-fail, and
  unverifiable-number-flag cases; cover-letter context surfaces `allowedFacts`; `pnpm test --
  --selectProjects ai` green.

### Phase 3 — Cost gate + follow-up cadence policy

- Goal: Shared `withCostGate` and `followUpPolicy` helpers consumed later by #19 (batch) and
  #9 (follow-up cadence), built on the existing rate-limit plumbing.
- Deliverables:
  - `packages/ai/src/policy/cost-gate.ts` exporting `withCostGate({ scoreFloor?, quota? })` that
    wraps a tool `execute`, reusing `checkRateLimit` from `packages/ai/src/rate-limit.ts`.
  - `packages/ai/src/policy/follow-up-policy.ts` exporting `followUpPolicy` (caps + min interval)
    and `canSendFollowUp(...)`.
  - Tier/limit constants added to `packages/ai/src/policy/limits.ts` (or reuse
    `FREE_LIMITS` from `@ever-hust/stripe`).
  - Barrel `packages/ai/src/policy/index.ts` exporting all four primitives; re-export from
    `packages/ai/src/index.ts`.
- Exit criteria: both helpers unit-tested (allow above floor / under quota; block below floor / over
  quota; cadence cap + interval enforced); `pnpm test -- --selectProjects ai` green.

### Phase 4 — Terms copy + E2E policy verification

- Goal: Make the product's stated terms agree with the structural posture, and prove the approval
  gate end-to-end in a real browser.
- Deliverables:
  - Terms copy update in `apps/web/app/(marketing)/terms/page.tsx` (no auto-submit / AI-advisory /
    user-owns-data), contacts on `ever.co`.
  - Playwright E2E `tests/e2e/guardrails.spec.ts`: outward action surfaces the approval card; denial
    blocks the action; Terms page shows the HITL posture.
- Exit criteria: `pnpm test:e2e` covers approve/deny + Terms copy; full CI (lint, types, unit, E2E)
  green on `develop`.

## 3. Packages Touched

| Package                                            | Change                                                                                                                              |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `packages/db`                                       | New `approval_gates` table at `packages/db/src/schema/approval-gates.ts`; export from `packages/db/src/schema/index.ts`; `pnpm db:push`. |
| `packages/ai`                                        | New `packages/ai/src/policy/` module (`require-approval.ts`, `assert-no-invented.ts`, `cost-gate.ts`, `follow-up-policy.ts`, `limits.ts`, `index.ts`); re-export from `packages/ai/src/index.ts`. |
| `packages/ai` (tools)                               | Refactor `packages/ai/src/tools/apply-job.ts` + `packages/ai/src/tools/submit-answers.ts` to route through `requireApproval`; surface `allowedFacts` from `packages/ai/src/tools/generate-cover-letter.ts`. |
| `packages/ai` (prompt)                              | `packages/ai/src/prompts.ts` — document the no-invent + structural-approval posture; mirror to Langfuse `orchestrator-system`. |
| `packages/ai` (orchestrator)                        | `packages/ai/src/agents/orchestrator.ts` — `applyJob`/`submitAnswers` wrappers create/check approval gates (userId still injected server-side). |
| `apps/web` (API)                                    | New `apps/web/app/api/approvals/route.ts` (approve/deny gate); Zod in `apps/web/lib/api-schemas.ts`; errors via `apps/web/lib/api-response.ts`. |
| `apps/web` (chat UI)                                | `apps/web/components/chat/tool-approval.tsx` reads gate `actionId`/`summary`; `apps/web/hooks/use-canvas-sync.ts` — add `case "applyJob"` / approval handling to surface pending gates. |
| `apps/web` (marketing)                              | `apps/web/app/(marketing)/terms/page.tsx` — HITL / no-auto-submit / advisory / user-owns-data copy. |
| `packages/jobs-api`                                 | (no change) — Ever Jobs API remains the only hard external dependency; guardrails are local policy. |
| `packages/stripe`                                   | (read-only) — reuse `FREE_LIMITS` for per-tier cost-gate quotas; no change. |
| `tests/e2e`                                          | New `tests/e2e/guardrails.spec.ts` Playwright spec for approve/deny + Terms copy. |

## 4. Dependencies

| Library / Epic            | Version  | Rationale                                                                                          |
| ------------------------- | -------- | ------------------------------------------------------------------------------------------------- |
| `ai` (Vercel AI SDK)      | v6 (in-repo) | `tool({...})` envelope the policy primitives wrap; no new dep.                                  |
| `zod`                     | in-repo  | `.max()`-bounded input schemas for the approval API and gate `summary`; no new dep.               |
| `drizzle-orm`             | in-repo  | `approval_gates` table in house style; no new dep.                                                 |
| `@upstash/ratelimit` / `@upstash/redis` | in-repo | Reused by `withCostGate` quotas via existing `packages/ai/src/rate-limit.ts`; no new dep. |
| `@ever-hust/stripe` (`FREE_LIMITS`) | workspace:* | Per-tier quota source already used by rate-limit; reuse, don't redefine.                  |
| **Epic #5 — structured-output** | spec/in-progress | Shared `Artifact`/`summary` contract; `assertNoInvented` audits prose against the grounded facts behind that summary. Hard upstream contract. |
| **Epic #3 — evaluation engine** | spec only | Source of the fit `score` that `withCostGate({ scoreFloor })` reads; gate is built score-agnostic so #3 can land independently. |
| **Epic #9 — follow-up cadence** | spec only | Downstream consumer of `followUpPolicy`; this epic only provides the cap helper. |
| **Epic #19 — batch evaluation** | spec only | Downstream consumer of `withCostGate({ quota })` for expensive batch runs. |

No new direct npm dependency is introduced (constitution Article 10.5).

## 5. Risks & Mitigations

| Risk                                                                 | Likelihood | Impact | Mitigation                                                                                                  |
| ------------------------------------------------------------------- | ---------- | ------ | ---------------------------------------------------------------------------------------------------------- |
| Refactoring `applyJob`/`submitAnswers` breaks the live apply flow    | M          | H      | Keep the existing `applications` status machine; layer the gate additively; E2E approve/deny + invariant test before merge. |
| LLM ignores prompt and a *new* outward tool forgets the gate         | M          | H      | Enforcement is the `OUTWARD_ACTION_TOOLS` registry + invariant test that fails CI, not prompt text alone.   |
| `assertNoInvented` false-positives flag legitimate grounded claims   | M          | M      | Ship it **advisory** (flags as gaps, does not hard-block generation); tune with unit fixtures; never 500 the user. |
| New `approval_gates` table push diverges from prod schema            | L          | M      | `pnpm db:push` in a non-prod DB first; additive table only (no column drops); rollback = drop table, no data loss. |
| Cost-gate quota collides with existing search/cover-letter limiters  | L          | M      | Reuse `checkRateLimit` with a distinct `prefix`; unit test prefix isolation.                                |
| Langfuse prompt drift (DB prompt overrides the documented no-invent) | M          | M      | Update both `packages/ai/src/prompts.ts` fallback AND the Langfuse `orchestrator-system` prompt; note in task. |

## 6. Rollback Plan

- The policy module is additive: deleting the `packages/ai/src/policy/` import sites and reverting
  `apply-job.ts` / `submit-answers.ts` to the prior status-only gate restores previous behaviour.
- `withCostGate` / `followUpPolicy` have **no consumers in this epic**, so removing them is inert.
- `approval_gates` is a new, isolated table referenced only by the new primitives; dropping it (or
  leaving it unused) causes no data loss to `users`, `jobs`, `applications`, or `userJobs`.
- Terms copy is a static-page edit revertable by a single commit.
- Feature can be soft-disabled by having `requireApproval` short-circuit to the legacy status check
  behind an env flag if a production issue appears, without a schema change.

## 7. Migration Plan

- **Schema:** `approval_gates` is brand new — no backfill needed; existing in-flight `applications`
  rows continue to work under the legacy status machine and simply won't have a gate row until their
  next outward action.
- **Existing tools:** `applyJob`/`submitAnswers` are migrated in place; the approval API + UI are
  backward-compatible (the `default` branch of `getToolDisplay` already handles unknown actions, so
  a partially-rolled-out gate still renders a generic confirm card).
- **Prompt:** updating `packages/ai/src/prompts.ts` is forward-only; the Langfuse production prompt
  must be edited in the same change to avoid the DB copy overriding the new no-invent language.
- **Consumers (#3/#9/#19):** import the new primitives when those epics land; no migration required
  before then because the helpers are unused until imported.

## 8. Open Questions for Plan

- Should `approval_gates` carry a TTL / expiry so stale un-acted gates auto-deny, or stay open
  indefinitely? (Leaning: short TTL, default-deny on expiry.)
- Does `withCostGate({ scoreFloor })` read the fit score from epic #3's `evaluations` table directly,
  or take it as a passed parameter to stay decoupled until #3 lands? (Leaning: passed parameter.)
- Is the no-invent validator purely advisory in v1, or should fabricated **credentials/employers**
  hard-block the artifact while numbers stay advisory? (Leaning: advisory v1, revisit per the
  document epics.)
- Should `followUpPolicy` caps live in code constants or a per-user/per-tier configurable column?
  (Leaning: code constant in v1, configurable later.)
