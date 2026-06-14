# Structured Output — the machine-summary contract (spec #5)

Every AI tool/agent in Hust that produces a **durable artifact** (an evaluation, a cover
letter, an interview plan, a negotiation brief, …) must emit a strict, machine-readable
**summary** alongside any human-readable prose. Prose alone is not queryable — the
summary is the substrate the evaluation engine, funnel analytics, and the learning loop
build on.

See the constitution, **Article 5 — Structured Output Everywhere**
([`.specify/memory/constitution.md`](../../.specify/memory/constitution.md)).

## The contract

```ts
import { defineArtifact, assertArtifact } from "@ever-hust/ai/structured";

interface Artifact<TKind extends string, TSummary> {
  kind: TKind;            // "evaluation" | "cover_letter" | …
  schemaVersion: number;  // bump on a breaking schema change; old rows keep their version
  summary: TSummary;      // strict, Zod-validated, whitelisted fields only
  prose?: string;         // optional LLM-written narration
}
```

- `summary` is **whitelisted** — only fields we intend to query/aggregate. No free-form
  blobs that drift.
- `schemaVersion` lets us evolve without breaking stored rows (readers switch on version).

## Authoring a new artifact kind

1. Add `packages/ai/src/structured/schemas/<kind>.ts` with a Zod schema and a version:

   ```ts
   export const MY_SCHEMA_VERSION = 1;
   export const mySummarySchema = z.object({ /* whitelisted fields */ });
   export const myArtifact = defineArtifact("my_kind", MY_SCHEMA_VERSION, mySummarySchema);
   ```

2. Re-export it from `packages/ai/src/structured/index.ts`.

3. In the tool/agent that produces it:
   - **LLM-produced** summaries → `generateValidatedObject({ model, schema, prompt, … })`
     (the model retries to satisfy the schema; we re-validate at the boundary).
   - **Deterministic** (server-computed) summaries → `schema.parse(value)`.

4. **Before any DB write**, pass the assembled artifact through `assertArtifact(def, artifact)`:
   - dev/test → throws on mismatch (fail loud),
   - production → logs + drops to a safe `fallback` (never 500 the user over a summary).

5. Persist the `summary` (and `prose`) into the owning feature's table as typed `jsonb`
   (e.g. `evaluations.dimensions` / `evaluations.blocks`). The contract standardizes the
   *shape*, not a single table — each epic stores its own artifact in its own table.

## Reference implementation

The first concrete artifact is **`evaluation`**
([`schemas/evaluation.ts`](src/structured/schemas/evaluation.ts)), consumed by the
`evaluateJob` tool (spec #3). It splits the work across the determinism boundary:
the LLM produces `evaluationLlmPartSchema` (reasoned dims + A–F blocks + recommendation),
the server computes the deterministic dims + score + band, and the two are assembled into
`evaluationSummarySchema` before persistence.
