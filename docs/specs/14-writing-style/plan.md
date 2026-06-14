# Plan: 14 — Writing-Style Personalization

| Field        | Value                              |
| ------------ | ---------------------------------- |
| Spec         | spec.md                            |
| Created      | 2026-06-14                         |
| Last updated | 2026-06-14                         |

## 1. Approach

Spec #14 makes generated documents sound like the user instead of generic. The hard
privacy constraint is the whole point: we store an **abstract style fingerprint** —
numeric/enum descriptors only (e.g. `formality: 0.7`, `avgSentenceLen: "short"`,
`usesMetrics: true`) — and **never retain a single character of raw user writing**. The
fingerprint is derived only from artifacts the user has already approved or edited
(today: a cover letter the user accepts in the #10 pipeline), then fed into future
generation prompts so the next letter / outreach note matches their voice.

The cleanest way to honour the spec's privacy rule and the constitution's structured-output
rule (Article 5) at once is to make the fingerprint a **first-class structured artifact**.
We define a versioned Zod descriptor schema and a deterministic-plus-LLM extractor that
takes approved artifact text **in-memory only** and emits the descriptor object — the
text is never persisted, only the descriptors are. Persistence goes into a dedicated
`style_fingerprints` row keyed by `userId` (one current fingerprint per user, with a
small confidence/sample counter so it stabilises as more artifacts are approved). We
choose a table over `users.preferences.styleFingerprint` so the descriptor shape is
typed, indexable, and queryable, and so the privacy invariant (no raw text column) is
enforced structurally at the schema level — there is literally no column for raw text.

Extraction is wired to the **#13 learning loop**: the existing approve/edit moment is the
trigger. When a user approves an artifact, the orchestrator calls a new `updateWritingStyle`
tool (userId injected server-side) that runs the extractor over the just-approved text,
folds the new descriptors into the running fingerprint (exponential-moving-average style so
recent approvals nudge but don't whiplash the profile), and persists. No raw text crosses
the tool boundary into storage.

Application is the second half: a new `getWritingStyle` read path loads the user's
descriptors and a small style-guidance module renders them into a compact instruction
block ("write in short sentences; moderate formality; quantify with metrics where the CV
supports it"). That block is injected into the generation context for #10 (cover letters)
and #17 (outreach) so their output reflects the fingerprint. We keep this **additive**:
the cover-letter and outreach tools gain an optional style block; with no fingerprint yet,
they behave exactly as today (Article 9 / non-negotiable #9 — improve additively).

This epic sits squarely on the Hust side of the partition (Article 6): a writing
fingerprint is per-user, identity-bound, stateful data — it never touches the Ever Jobs
corpus. The only hard external dependency stays the Ever Jobs API, untouched here
(Article 2, standalone-first). No Gauzy seam is involved.

The plan respects the dependency chain. **#5 structured-output** is the shared contract:
the fingerprint is an `Artifact<"writing_style", WritingStyleSummary>` and validates
through `assertArtifact` before any DB write. **#6 guardrails** supplies the grounding
discipline — applying a style descriptor must never let generation invent facts, so the
style block is advisory tone-only and the existing `assertNoInvented` discipline on #10/#17
still governs content. **#13 learning loop** is the capture mechanism the extractor hooks
into. **#10 cover-letter pipeline** (the direct `Depends on:`) is where the approve event
originates and the first consumer of the applied style; **#17 outreach** is the second
consumer. Where #5/#6/#13 land first we consume their primitives; where they are not yet
merged we ship behind the same envelope/helpers so adoption is a wiring change, not a
rewrite.

Finally, the user stays in control (spec §3, Article 4): a settings card lets the user view
their current descriptors and nudge them with plain-language controls ("more concise",
"less formal"), persisted as user overrides that win over auto-derived values — never a raw
text editor, only descriptor tuning.

## 2. Phases

### Phase 1 — Descriptor contract & schema

- Goal: define the privacy-safe, versioned style-descriptor shape and its persistence,
  so every later phase reads/writes one typed object with no raw-text column.
- Deliverables:
  - `packages/ai/src/structured/schemas/writing-style.ts` — Zod `WritingStyleSummary`
    (descriptors only: `formality` 0–1, `warmth` 0–1, `avgSentenceLen` enum
    `short|medium|long`, `hedging` 0–1, `jargonLevel` enum `low|medium|high`,
    `usesMetrics` boolean, `structurePref` enum `bullet|paragraph|mixed`), `schemaVersion = 1`,
    every string `.max()`-bounded; an `Artifact<"writing_style", WritingStyleSummary>`
    definition via `defineArtifact` (#5).
  - `packages/db/src/schema/style-fingerprints.ts` — `style_fingerprints` table; export
    from `packages/db/src/schema/index.ts`; `pnpm db:push`.
- Exit criteria: schema unit tests pass (valid descriptors parse, raw-text / out-of-range
  values reject); `pnpm db:push` applies the table; `pnpm check-types` green.

### Phase 2 — Extraction & capture (no raw text retained)

- Goal: derive descriptors from approved/edited artifact text in-memory and persist only
  the fingerprint, folding new approvals into the running profile.
- Deliverables:
  - `packages/ai/src/writing-style/extract.ts` — `extractStyleDescriptors(text)` →
    `WritingStyleSummary` (deterministic features — sentence length, bullet ratio, hedging
    markers — plus a bounded `generateObject` pass for tone/formality), returning
    descriptors only; the input text is never returned or stored.
  - `packages/ai/src/writing-style/merge.ts` — `mergeFingerprint(existing, incoming, n)`
    EMA fold with a sample counter.
  - `packages/ai/src/tools/update-writing-style.ts` — `updateWritingStyleTool`
    (userId injected server-side), exported from `packages/ai/src/tools/index.ts`,
    registered in `packages/ai/src/agents/orchestrator.ts`; persists via `assertArtifact`
    → `style_fingerprints`.
- Exit criteria: extractor unit test proves the return object contains **no substring of
  the input text** (privacy invariant); merge test proves EMA convergence; tool test proves
  userId is server-injected and a fingerprint row is upserted; CI green.

### Phase 3 — Application to generation (#10 / #17)

- Goal: load the fingerprint and feed it into cover-letter and outreach generation so output
  reflects the user's voice, additively and grounded.
- Deliverables:
  - `packages/ai/src/writing-style/guidance.ts` — `buildStyleGuidance(summary)` → a compact
    tone-only instruction string.
  - `packages/ai/src/writing-style/load.ts` — `loadWritingStyle(userId)` read helper.
  - Wire the guidance block into `packages/ai/src/tools/generate-cover-letter.ts` (#10) and
    the #17 outreach tool's context (optional; absent fingerprint = today's behaviour).
  - System-prompt update in `packages/ai/src/prompts.ts` (and Langfuse `orchestrator-system`)
    documenting `updateWritingStyle` and the style-aware generation behaviour.
- Exit criteria: a unit test shows the cover-letter context carries the style block when a
  fingerprint exists and is byte-identical to today when it doesn't; no-invent discipline
  unaffected; CI green.

### Phase 4 — View & tune UI + canvas sync

- Goal: let the user see and adjust their descriptors; surface the fingerprint on the canvas.
- Deliverables:
  - `apps/web/components/canvas/writing-style-card.tsx` (built from the
    `salary-insights-card.tsx` overlay template) — read-only descriptor view.
  - `apps/web/components/settings/writing-style-card.tsx` + register in the settings page —
    plain-language tune controls ("more concise" / "less formal") persisted as user overrides.
  - `apps/web/app/api/user/writing-style/route.ts` — GET descriptors + PATCH override nudges
    (`requireSessionUser`, `applyRateLimit(userId, "authenticated")`, Zod from
    `apps/web/lib/api-schemas.ts`, errors via `apps/web/lib/api-response.ts`).
  - `case "updateWritingStyle"` in `apps/web/hooks/use-canvas-sync.ts` to surface the
    descriptors card.
- Exit criteria: settings card renders current descriptors and persists a nudge; canvas card
  appears on tool result; Playwright E2E covers view + tune; CI green; **zero competitor
  references**.

## 3. Packages Touched

| Package                                                                    | Change                                                                                                                                                |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/db`                                                              | New `src/schema/style-fingerprints.ts`; export in `src/schema/index.ts`; `pnpm db:push`.                                                            |
| `packages/ai`                                                              | New `src/structured/schemas/writing-style.ts`; `src/writing-style/{extract,merge,guidance,load}.ts`; new tool `src/tools/update-writing-style.ts` + export in `src/tools/index.ts` + register in `src/agents/orchestrator.ts`; style block in `src/tools/generate-cover-letter.ts`; system-prompt doc in `src/prompts.ts`. |
| `apps/web`                                                                 | New `app/api/user/writing-style/route.ts`; `components/canvas/writing-style-card.tsx`; `components/settings/writing-style-card.tsx` (+ register in settings page); `case` in `hooks/use-canvas-sync.ts`; Zod in `lib/api-schemas.ts`. |
| `packages/jobs-api`                                                        | (no change) — Ever Jobs API untouched; fingerprint is per-user Hust data.                                                                            |
| `packages/ui`                                                              | (no change) — reuse `@ever-hust/ui/{card,badge,button,slider}`; `cn()` from `@ever-hust/ui/lib/utils`.                                               |

## 4. Dependencies

| Library                | Version  | Rationale                                                                                                   |
| ---------------------- | -------- | --------------------------------------------------------------------------------------------------------- |
| `zod`                  | existing | Descriptor schema + `.max()` bounds; already the project standard for tool input/output validation.        |
| `ai` (Vercel AI SDK v6)| existing | `tool()` for `updateWritingStyle`; `generateObject({ schema })` for the bounded tone/formality extraction. |
| `drizzle-orm`          | existing | `style_fingerprints` table + typed `jsonb` descriptors, house schema style.                                 |

No new direct dependencies are introduced (Article 10.5). The deterministic feature
extraction (sentence length, bullet ratio, hedging-marker counts) is plain TypeScript — no
NLP library is added; if descriptor quality later warrants one, it gets its own justification
line in a follow-up plan.

## 5. Risks & Mitigations

| Risk                                                                          | Likelihood | Impact | Mitigation                                                                                                          |
| ----------------------------------------------------------------------------- | ---------- | ------ | ----------------------------------------------------------------------------------------------------------------- |
| Raw user text accidentally persisted or echoed back to the LLM                | M          | H      | No raw-text column exists in `style_fingerprints`; extractor returns descriptors only; unit test asserts the output object shares no substring with the input; PII hygiene per Article 8. |
| Fingerprint over-fits to one early letter and feels wrong                      | M          | M      | EMA merge with a sample counter; low-confidence fingerprints emit a softer style block; user can tune via settings. |
| Style block leaks into invented facts (tone instruction → fabricated metrics) | L          | H      | Style guidance is tone-only (no content); #6 `assertNoInvented` still governs #10/#17; `usesMetrics` only encourages quantifying real CV-backed numbers. |
| Upstream #5/#13 not merged when this lands                                     | M          | M      | Ship behind the #5 `Artifact` envelope + a local capture hook; adoption becomes a wiring change once they merge.   |
| LLM tone extraction never satisfies the descriptor schema                      | L          | M      | `generateObject` bounded retry; deterministic features always present as the fallback fingerprint.                 |

## 6. Rollback Plan

Disable without data loss: the feature is gated by the presence of a `style_fingerprints`
row and the `updateWritingStyle` tool registration. To revert, remove the tool from the
`tools: { ... }` object in `packages/ai/src/agents/orchestrator.ts` and drop the style block
call in `generate-cover-letter.ts` (and #17) — generation falls back to today's prose
behaviour, byte-identical to pre-epic. The `style_fingerprints` table can be left in place
(orphaned, no raw text, no PII risk) or dropped via a follow-up `db:push`; existing rows
contain only abstract descriptors. The settings/canvas cards are additive surfaces removable
independently. No existing column, tool, or flow is modified destructively (non-negotiable #9).

## 7. Migration Plan

No data migration. Existing users start with **no fingerprint**; generation behaves exactly
as before until they approve their first artifact, at which point a fingerprint is created
on the fly. There is no backfill from historical text (we deliberately do not store raw
samples, so there is nothing to mine), and no change to `users.preferences` shape — the
descriptors live in the new table, leaving the existing preference blob untouched. The
`style_fingerprints` table is created idempotently via `pnpm db:push` consistent with the
project's push-based Drizzle workflow.

## 8. Open Questions for Plan

- **Fingerprint cardinality:** one current fingerprint per user (chosen) vs. per-document-kind
  (cover-letter voice ≠ outreach voice). Default to one; revisit if tuning feedback shows
  contexts diverge.
- **Trigger source:** is the approve event delivered by the #13 capture hook, or does
  `updateWritingStyle` get called directly by the orchestrator on the #10 approve transition?
  Prefer the #13 hook if merged first; otherwise call directly and migrate.
- **Tune granularity:** expose raw 0–1 sliders in settings, or only coarse plain-language
  nudges? Spec language ("more concise", "less formal") points to coarse nudges — confirm with
  design before building sliders.
