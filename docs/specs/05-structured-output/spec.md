# Spec #5 — Structured-output / Machine-Summary Contract

> Status: Draft · Owner: Hust (platform) · Effort: S–M · Phase 1 (trunk root) · Depends on: —

## 1. Problem & user value

Today most of Hust's "generation" tools return **prose** (a cover letter, an interview tip, an
opinion) plus an `instruction` string for the orchestrator to narrate. Prose isn't queryable, so
the product can't build analytics, dashboards, sortable verdicts, or a learning loop on top of AI
output. We need every AI artifact to also emit a **strict, machine-readable summary** alongside its
prose — a stable, validated object the product can store, sort, aggregate, and learn from.

This is a **platform seam**, not a user-facing feature. Its value is that it *unblocks* the
evaluation engine ([#3](../03-evaluation-engine/spec.md)), funnel analytics
([#8](../08-funnel-analytics/spec.md)), and the learning loop ([#13](../13-learning-loop/spec.md)).

## 2. Scope

**In:** a shared convention + helper so every AI artifact carries a versioned, Zod-validated
"machine summary"; validation at the tool/output boundary (model retries on mismatch); a place to
persist it; adoption by the first artifact (`evaluateJob`).

**Out:** the downstream consumers themselves (analytics, learning) — they're separate epics; this
just guarantees the data exists and is well-shaped.

## 3. Design

### 3.1 The contract

Every AI tool/agent that produces a durable artifact returns a discriminated object:

```ts
// packages/ai/src/structured/contract.ts
export type Artifact<TKind extends string, TSummary> = {
  kind: TKind;            // "evaluation" | "cover_letter" | "interview_prep" | ...
  schemaVersion: number;  // bump on breaking schema change; old rows keep their version
  summary: TSummary;      // strict, Zod-validated machine summary (whitelisted fields only)
  prose?: string;         // optional human narration (the LLM-written text)
};
```

- `summary` is **whitelisted** — only fields we intend to query/aggregate; no free-form blobs that
  drift. Each artifact kind owns a Zod schema in `packages/ai/src/structured/schemas/<kind>.ts`.
- `schemaVersion` lets us evolve without breaking stored rows (readers switch on version).

### 3.2 Validation harness

```ts
export function defineArtifact<TKind extends string, TSchema extends z.ZodTypeAny>(
  kind: TKind, version: number, schema: TSchema,
) { /* returns { kind, version, schema, parse(), generate() } */ }
```

- For LLM-produced summaries, use the Vercel AI SDK's `generateObject({ schema })` (or tool output
  validation) so the **model retries on mismatch** — the validation lives at the call boundary, not
  in hand-written parsing.
- For deterministic summaries (server-computed), validate with `schema.parse()` before persisting.
- A single `assertArtifact(artifact)` used right before any DB write; throws in dev/test, logs +
  drops to a safe fallback in prod (never 500s the user over a summary).

### 3.3 Persistence

Artifacts persist into the owning feature's table as typed `jsonb` (e.g.,
`evaluations.dimensions` / `evaluations.blocks`, future `applications.machineSummary`,
`interview_sessions.summary`). The contract standardizes the *shape*, not a single table — each
epic stores its own artifact in its own table, but all conform to `Artifact<…>`.

### 3.4 Reuse of existing patterns

This formalizes what the codebase already half-does (tools return structured-ish data). The change
is: (a) a shared `Artifact` envelope + version, (b) Zod schemas per kind, (c) validation at the
boundary, (d) a convention that **new tools emit a machine summary, not just prose**.

## 4. Data / API touchpoints

- New module `packages/ai/src/structured/` (contract, harness, per-kind schemas).
- No new tables of its own; it defines the jsonb shapes other epics' tables use.
- No removal of existing tool behavior — tools that return prose keep doing so; they *add* a
  `summary`.

## 5. Implementation plan

1. Add `packages/ai/src/structured/contract.ts` (the `Artifact` type + `defineArtifact` +
   `assertArtifact`).
2. Add `schemas/evaluation.ts` as the first concrete schema (matches [#3](../03-evaluation-engine/spec.md) §4.1).
3. Wire `evaluateJob` to produce `Artifact<"evaluation", EvaluationSummary>` via `generateObject`
   for LLM dims + `schema.parse` for deterministic dims.
4. Persist via `assertArtifact` → `evaluations` row.
5. Document the convention in `packages/ai/README` (or a short `STRUCTURED_OUTPUT.md`) so future
   tools follow it.

## 6. Tasks

- [ ] `contract.ts` — `Artifact`, `defineArtifact`, `assertArtifact` (+ unit tests).
- [ ] `schemas/evaluation.ts` — Zod schema + `schemaVersion = 1`.
- [ ] Helper to run `generateObject` with retry + structured-telemetry (Langfuse span).
- [ ] Adopt in `evaluateJob` (coordinated with #3).
- [ ] Convention doc + an ESLint/test guard encouraging new artifact tools to define a schema.
- [ ] Unit tests: valid parses, invalid rejects, version switch, prod-fallback path.

## 7. Risks & acceptance

- **Risk:** over-rigid schemas slow iteration → keep summaries small/whitelisted and versioned.
- **Risk:** LLM never satisfies the schema → bounded retries + a deterministic fallback summary.
- **Acceptance:** `evaluateJob` emits a version-1 `evaluation` artifact that round-trips through
  `assertArtifact` and persists; invalid LLM output is retried then safely handled; unit tests green;
  **zero competitor references** (verified per workspace `RULES.md`).
