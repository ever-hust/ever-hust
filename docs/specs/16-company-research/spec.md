# Spec #16 — Deep Company Research

> Status: Draft · Owner: Hust (+ optional Ever Jobs firmographics) · Effort: M (L with EJ) · Phase 3 · Depends on: —

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
