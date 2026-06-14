# Plan: 17 — Recruiter / LinkedIn Outreach (draft-only)

| Field        | Value      |
| ------------ | ---------- |
| Spec         | spec.md    |
| Created      | 2026-06-14 |
| Last updated | 2026-06-14 |

## 1. Approach

This epic adds a single new agentic capability — an `outreachDraft` tool — that produces a short,
grounded outreach message (connection note, follow-up, or referral ask) the user can copy and send
themselves. It is **draft-only and human-in-the-loop**: Hust never connects, messages, or sends on
the user's behalf. There is no send integration, no contacts CRM, and no automation seam wired in
this epic. The tool's only job is to assemble grounded context and hand the orchestrator a precise
instruction to write a concise, framework-shaped message; the user copies it to their own client.

The work follows the same shape as every other AI capability already in the repo. A new tool file
`packages/ai/src/tools/outreach-draft.ts` mirrors `generate-cover-letter.ts` and
`company-research.ts`: a `tool({ description, inputSchema, execute })` whose `execute` fetches the
user profile + the job/company row from Postgres, computes matching skills, and returns a plain
context object plus an `instruction` string. As with the cover-letter tool, the tool **assembles
grounded context** and the orchestrator LLM writes the prose — this keeps generation grounded
(Article 7) because the tool only forwards real data and explicitly forbids placeholders/invention.

Per the constitution's Article 5 ("Structured Output Everywhere"), the tool emits a Zod-validated
machine summary **alongside** the prose. We add `packages/ai/src/structured/schemas/outreach.ts`
using the existing `defineArtifact` contract from `packages/ai/src/structured/contract.ts` — the
exact precedent set by `schemas/evaluation.ts` (epic #5 is the shared structured-output contract
this epic depends on). The artifact captures the message framework (hook → credibility → ask),
the contact type, the target role/company, a grounded-sources list, and a `usedFacts` array so the
output is queryable for analytics and the learning loop.

Drafts are persisted so the user can retrieve and re-copy them and so they feed later analytics.
We add an `outreachDrafts` table in `packages/db/src/schema/outreach.ts`, exported from
`packages/db/src/schema/index.ts`, following the house style used by `applications` and
`evaluations` (integer identity PK, `userId` text FK with `onDelete: "cascade"`, optional `jobId`
integer FK, jsonb `$type<>()` columns mirroring the Zod artifact, text enum for `contactType`,
timestamps, and per-user indexes). Schema lands via `pnpm db:push` (push-based Drizzle, no
migration files needed for the dev/stage flow).

The tool is registered in the orchestrator (`packages/ai/src/agents/orchestrator.ts`) inside the
`tools: { ... }` object, with `userId` injected server-side via the same wrapper pattern the
cover-letter/apply tools use — `userId` is **never** an LLM-supplied param. The system prompt
(`packages/ai/src/prompts.ts`, `DEFAULT_ORCHESTRATOR_PROMPT`, and the Langfuse `orchestrator-system`
prompt) gains an `## Outreach Drafts` section documenting the framework, the draft-only/HITL rule,
and a reminder to confirm role/company/contact-type before drafting.

On the UI side the structured result surfaces on the jobs canvas. We add a
`case "outreachDraft"` to `apps/web/hooks/use-canvas-sync.ts` and a new overlay card
`apps/web/components/canvas/outreach-draft-card.tsx` modelled on `salary-insights-card.tsx`
(an overlay card with its own clear handler). The card renders the three framework lines and a
**Copy to clipboard** affordance — copy-to-send is the only action; there is no "Send" button by
design (Article 4).

Subscription/rate gating reuses the existing machinery. The tool is wrapped in the orchestrator the
same way `generateCoverLetter` is; if we gate it as a Pro capability we add a
`checkOutreachLimit`-style helper to `packages/ai/src/rate-limit.ts` mirroring `checkSearchLimit` /
`checkCoverLetterLimit`. Default decision (see Open Questions) is to keep it free-tier with the same
per-week cadence as cover letters, gated through the existing limit helpers.

A small read API route (`apps/web/app/api/outreach/route.ts`) lets the canvas/profile fetch a user's
saved drafts, following the standard route pattern (`requireSessionUser()`, `applyRateLimit`,
Zod from `apps/web/lib/api-schemas.ts`, `apiBadRequest()`/`apiError()`). This is a GET-only read
surface; there is no send/submit endpoint anywhere in this epic.

Tests are written alongside each unit (Jest, `--selectProjects ai`/`db`/`web-lib`) plus a Playwright
E2E that exercises the chat → canvas card → copy affordance and asserts no auto-send control exists.
CI (lint, type-check, unit, E2E) must be green before merge (Article 10). The whole feature is
standalone — the only external dependency remains the Ever Jobs API for the underlying job rows
(already synced into `jobs`); no Gauzy dependency is introduced.

## 2. Phases

### Phase 1 — Structured contract + persistence

- Goal: Define the `outreach` artifact (Zod, alongside-prose machine summary) and the
  `outreachDrafts` table so generation has a typed, queryable target.
- Deliverables:
  - `packages/ai/src/structured/schemas/outreach.ts` via `defineArtifact` (hook/credibility/ask
    framework, `contactType`, target role/company, `groundedSources`, `usedFacts`, schema version),
    exported from `packages/ai/src/structured/index.ts`.
  - `packages/db/src/schema/outreach.ts` (`outreachDrafts`) exported from
    `packages/db/src/schema/index.ts`; jsonb columns `$type<>()` mirror the artifact.
  - Schema pushed to the database (`pnpm db:push`).
  - Unit tests for the artifact schema and the table types.
- Exit criteria: `pnpm test -- --selectProjects ai db` green; `pnpm db:push` applies the
  `outreach_drafts` table cleanly; `pnpm check-types` green.

### Phase 2 — `outreachDraft` tool + orchestrator wiring

- Goal: Implement the grounded, draft-only tool and register it with the orchestrator + prompt.
- Deliverables:
  - `packages/ai/src/tools/outreach-draft.ts` (`tool({...})`, `.max()`-bounded inputs, grounded
    context assembly, no-invent instruction, validated artifact via `runValidatedGeneration` /
    `assertArtifact`, persists to `outreachDrafts`).
  - Export from `packages/ai/src/tools/index.ts`; register in
    `packages/ai/src/agents/orchestrator.ts` with server-side `userId` injection.
  - `## Outreach Drafts` section added to `DEFAULT_ORCHESTRATOR_PROMPT` in
    `packages/ai/src/prompts.ts` (and noted for the Langfuse `orchestrator-system` prompt).
  - Optional `checkOutreachLimit` in `packages/ai/src/rate-limit.ts` (if gated).
  - Unit tests for the tool (framework structure, grounded/no-invent, draft-only shape).
- Exit criteria: orchestrator lists `outreachDraft`; `pnpm test -- --selectProjects ai` green;
  the tool returns a validated artifact and writes one `outreachDrafts` row.

### Phase 3 — Canvas surface, read API, copy-to-send, E2E

- Goal: Surface the draft on the canvas with a copy affordance and a read API; prove HITL.
- Deliverables:
  - `case "outreachDraft"` added to `apps/web/hooks/use-canvas-sync.ts` (+ `outreachDraft` state +
    `clearOutreachDraft`).
  - `apps/web/components/canvas/outreach-draft-card.tsx` (overlay card, three framework lines,
    Copy-to-clipboard, **no Send control**), wired into the canvas page.
  - `apps/web/app/api/outreach/route.ts` (GET-only read of saved drafts) + Zod in
    `apps/web/lib/api-schemas.ts` + response helpers.
  - Jest tests for the route/schema; Playwright E2E `tests/e2e/outreach.spec.ts`.
- Exit criteria: chat produces a draft, the card renders, copy works, no auto-send control is
  present; `pnpm test:e2e` + full CI green.

## 3. Packages Touched

| Package             | Change                                                                                                                                                                                                                                                                            |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/ai`       | New tool `src/tools/outreach-draft.ts` (+ export in `src/tools/index.ts`); register in `src/agents/orchestrator.ts`; new structured schema `src/structured/schemas/outreach.ts` (+ export in `src/structured/index.ts`); prompt section in `src/prompts.ts`; optional `src/rate-limit.ts` helper. Tests alongside. |
| `packages/db`       | New schema `src/schema/outreach.ts` (`outreachDrafts`) + export in `src/schema/index.ts`; applied via `pnpm db:push`. Tests alongside.                                                                                                                                            |
| `apps/web`          | `case "outreachDraft"` in `hooks/use-canvas-sync.ts`; new `components/canvas/outreach-draft-card.tsx` wired into `app/(dashboard)/chat/page.tsx`; new read route `app/api/outreach/route.ts`; Zod in `lib/api-schemas.ts`; uses `lib/api-response.ts`. Tests + `tests/e2e/outreach.spec.ts`. |
| `packages/jobs-api` | (no change) — underlying job rows are already synced into the `jobs` table; outreach reads from `jobs`, not from the API directly.                                                                                                                                                  |
| `packages/ui`       | (no new component expected) — reuse `@ever-hust/ui/card`, `@ever-hust/ui/button`, `@ever-hust/ui/badge`, `cn()` from `@ever-hust/ui/lib/utils`, as `salary-insights-card.tsx` does.                                                                                                |
| `packages/triggers` | (no change) — no background fan-out; drafting is synchronous within the chat turn.                                                                                                                                                                                                |

## 4. Dependencies

| Library                        | Version  | Rationale                                                                                                                              |
| ------------------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| (none new)                     | —        | Reuses Vercel AI SDK v6 (`ai`), `zod`, Drizzle, and the existing `@ever-hust/ai/structured` contract. No new direct dependency added. |

**Upstream epic dependencies (assumed, not re-implemented here):**

- **#5 — structured output** (`packages/ai/src/structured/`): the shared `defineArtifact` /
  `runValidatedGeneration` / `assertArtifact` contract. This epic's artifact is built on it; it is
  the source-of-truth typed contract.
- **#16 — company research** (`packages/ai/src/tools/company-research.ts`): provides the company
  context the draft is grounded in; the tool may reuse the same company lookup off the `jobs` table.
- **#6 — guardrails (HITL + grounding helpers)**: the draft-only / no-invent posture is the HITL
  guarantee; grounding/no-invent helpers from #6 are reused when present.
- **#3 — evaluation engine** (`evaluations` table / `evaluation` artifact): optional — a fit/role
  summary can seed the "credibility" line when available; the tool degrades gracefully without it.

## 5. Risks & Mitigations

| Risk                                                                                  | Likelihood | Impact | Mitigation                                                                                                                                |
| ------------------------------------------------------------------------------------- | ---------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| LLM invents a contact name, shared connection, or fact not in the grounded context    | M          | H      | Tool forwards only real DB data; `instruction` explicitly forbids placeholders/invention; `usedFacts` in the artifact is asserted in tests; grounding helpers from #6 reused. |
| Feature is misread as enabling auto-send/auto-connect (Article 4 violation)            | L          | H      | No send/connect code path exists anywhere; UI has Copy only, no Send button; E2E asserts no auto-send control; prompt states draft-only. |
| Draft is too long / not framework-shaped                                               | M          | M      | Artifact enforces 3-line hook→credibility→ask with `.max()` length bounds; unit test asserts framework structure.                        |
| A competitor name leaks into prompt/card/test copy                                     | L          | H      | Article 11 grep before commit; no competitor names in any source/test/fixture; only Ever brands referenced.                              |
| New `outreachDrafts` table push conflicts with concurrent schema work                  | L          | M      | Single additive table, namespaced columns/indexes; coordinate `pnpm db:push` after rebasing `develop`.                                   |
| PII (raw CV text, email/phone) sent to the LLM via the draft context                   | L          | H      | Reuse `getUserProfile` hygiene (Article 8); forward only name/headline/skills/matching-skills, never encrypted keys or raw CV text.      |

## 6. Rollback Plan

The feature is additive and flag-free at the data layer. To disable: remove `outreachDraft` from the
`tools: { ... }` object in `packages/ai/src/agents/orchestrator.ts` and drop the `## Outreach Drafts`
section from the prompt — the capability vanishes from the agent immediately with no data loss. The
`outreach-draft-card.tsx` + `case "outreachDraft"` are inert without the tool emitting results. The
`outreachDrafts` table and the read route can stay in place harmlessly (no writer, GET returns empty);
if full removal is desired, revert the schema file + `index.ts` export and re-run `pnpm db:push`. No
destructive data migration is involved; existing tables are untouched.

## 7. Migration Plan (if applicable)

No data migration. `outreachDrafts` is a brand-new table added by `pnpm db:push`; no existing rows or
consumers change. No env vars are added (no new vendor). The orchestrator gains one tool; existing
tool behaviour is unchanged. If outreach is later gated behind a flag/adapter for an optional Gauzy
send seam, that work is a separate epic and stays off-by-default per Article 2 — it is **not** part of
this migration.

## 8. Open Questions for Plan

1. **Gating tier** — free-tier (same weekly cadence as cover letters, via a `checkOutreachLimit`
   helper) vs Pro-only? Default assumption: free with cover-letter-style cadence. Resolve before
   Phase 2; if Pro-only, add the gate in the orchestrator wrapper like `interviewPrep`.
2. **Persist on every draft, or only on explicit user save?** Default: persist each generated draft
   (mirrors how applications/evaluations are recorded for analytics). Confirm in spec `## Decisions`.
3. **Contact-type set** — `connection_note | follow_up | referral_ask` is the spec's list; do we
   add `thank_you` / `informational`? Default: ship the three named in the spec; extend later.
4. **Does the "credibility" line consume the #3 evaluation artifact when present?** Default: opportunistic
   — use it if a row exists, otherwise derive from matching skills only. Confirm dependency direction.
