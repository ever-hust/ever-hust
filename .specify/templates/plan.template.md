# Plan: <NNN> — <Title>

| Field        | Value                              |
| ------------ | ---------------------------------- |
| Spec         | spec.md                            |
| Created      | YYYY-MM-DD                         |
| Last updated | YYYY-MM-DD                         |

## 1. Approach

High-level narrative of how the spec will be implemented. 3–10 paragraphs.

## 2. Phases

### Phase 1 — <name>

- Goal: …
- Deliverables: …
- Exit criteria: …

### Phase 2 — <name>

- …

## 3. Packages Touched

| Package                        | Change                                |
| ------------------------------ | ------------------------------------- |
| `apps/web`                     | new route / component / hook …        |
| `packages/ai`                  | new tool / prompt …                   |
| `packages/db`                  | new table / migration …               |
| `packages/jobs-api`            | (no change) …                         |
| `packages/ui`                  | new component …                       |

## 4. Dependencies

| Library                | Version  | Rationale                            |
| ---------------------- | -------- | ------------------------------------ |
| <pkg>                  | latest   | why we picked this over alternatives |

## 5. Risks & Mitigations

| Risk                                | Likelihood | Impact | Mitigation                  |
| ----------------------------------- | ---------- | ------ | --------------------------- |
| External API rate-limits us         | M          | H      | Backoff + circuit breaker   |

## 6. Rollback Plan

How to disable / revert this feature without data loss.

## 7. Migration Plan (if applicable)

How existing data / config / consumers transition to the new world.

## 8. Open Questions for Plan

Items needing a decision before implementation starts. Move resolved ones to the
spec's `## Decisions` section.
