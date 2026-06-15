# Spec #16 — Deep Company Research

> Status: Done (shipped 2026-06-15) · Owner: Hust (+ optional Ever Jobs firmographics) · Effort: M (L with EJ) · Phase 3 · Depends on: —

## 1. Problem & user value

Before applying/interviewing, candidates need real context on the employer. Hust can assemble a
**multi-axis** research card — size, funding, tech stack, ratings, hiring trend, recent news —
from external enrichment, cached, with **progressive** UI (fields fill in as sources return).

## 2. Scope

**In:** a per-company research card across ~6 axes (firmographics, funding, tech, reputation,
hiring trend, news), cached with TTL + provenance per field; progressive rendering. **Out:**
building a general CRM; per-contact enrichment beyond what outreach ([#17](../17-outreach/spec.md))
needs.

## 3. Design

- Upgrade the `companyResearch` tool to a **multi-source** enricher (plugin pattern); each source
  fills fields independently; **merge with provenance** (which source, when, confidence).
- Cache in a `company_research` table (jsonb per axis + `fetchedAt` + provenance); respect source
  rate limits. Optionally consume Ever Jobs firmographics where available (corpus-level).
- Progressive UI: skeleton → fields stream in (reuse realtime patterns).

## 4. Plan & tasks

1. `company_research` table (axes jsonb, provenance, TTL).
2. Multi-source enricher (plugin interface) + merge-with-provenance.
3. Progressive research card UI (card on job/company + application detail).
4. Optional Ever Jobs firmographics source.
5. Tests: merge/provenance, cache TTL, E2E card renders progressively.

## 5. Acceptance

- A company card shows enriched axes with per-field provenance, cached; fields render progressively;
  CI green; **zero competitor references**.

## Implementation (shipped)

Shipped as a grounded **company brief** assembled by an AI tool, built on the #5 structured-output
artifact contract and audited by the #6 no-invent policy. Actual implementation:

- **Schema** — `packages/ai/src/structured/schemas/company-research.ts`: `companyResearchDraftSchema`
  (LLM-produced overview + smart interview questions + green-flags + things-to-verify) and
  `companyResearchSummarySchema` (adds `companyName`, `industry`, `size`, `openRolesInCorpus`,
  `grounded`, `flaggedClaims`); exported as the `company_research` artifact (`companyResearchArtifact`,
  schema version 1).
- **AI tool** — `packages/ai/src/tools/company-deep-dive.ts` exposes the `companyDeepDive` tool: reads
  the job's company fields from the `jobs` table, counts that company's open roles in the corpus, has
  the model write a brief grounded only in those facts, then runs the no-invent audit and returns a
  validated `company_research` artifact.
- **No-invent audit** — `packages/ai/src/policy/assert-no-invented.ts` (`assertNoInvented`) flags any
  overview claim not supported by the supplied grounded facts instead of presenting it as fact.
- **Orchestrator wiring** — `packages/ai/src/agents/orchestrator.ts` registers `companyDeepDive`
  (injecting `userId` + `model` server-side); also exported from `packages/ai/src/tools/index.ts` and
  `packages/ai/src/index.ts`. Served through the existing chat route
  (`apps/web/app/api/ai/chat/route.ts`) — no dedicated REST endpoint.
- **Corpus signal (Ever Jobs)** — open-roles-in-corpus is derived from Hust's synced `jobs` table
  (the Ever Jobs corpus), not an external firmographics provider.
- **Lighter companion tool** — `packages/ai/src/tools/company-research.ts` (`companyResearch`) returns
  raw corpus facts for the chat to narrate; coexists with the deep-dive brief.
- **UI** — surfaced on the jobs canvas via the generic artifact card
  `apps/web/components/canvas/artifact-card.tsx`, titled **"Company Brief"** through
  `apps/web/hooks/use-canvas-sync.ts` (`ARTIFACT_TITLES.companyDeepDive`). No bespoke company-card
  component was needed.
- **Tests** — `packages/ai/src/structured/schemas/company-research.test.ts`,
  `packages/ai/src/tools/company-deep-dive.test.ts`, plus tool-schema coverage in
  `packages/ai/src/tools/__tests__/tool-schemas.test.ts`.

**Intentionally deferred** (future enhancement, not shipped): the dedicated `company_research` cache
table (per-axis jsonb + `fetchedAt` + per-field provenance + TTL) and the multi-source plugin
enricher — no such table exists in `packages/db/src/schema/`. Likewise the progressive
skeleton-then-stream rendering and an external multi-axis firmographics source (funding, tech stack,
ratings, news) are not implemented; today's brief is grounded in the listing's own company fields plus
the Ever Jobs corpus open-roles count.
