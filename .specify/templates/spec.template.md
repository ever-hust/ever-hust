# Spec: <NNN> — <Title>

| Field          | Value                              |
| -------------- | ---------------------------------- |
| Spec ID        | NNN                                |
| Slug           | <kebab-case-slug>                  |
| Status         | draft \| accepted \| in-progress \| done \| rejected |
| Owner          | <agent or human>                   |
| Created        | YYYY-MM-DD                         |
| Last updated   | YYYY-MM-DD                         |
| Supersedes     | (none) \| NNN                      |
| Related specs  | NNN, NNN                           |

## 1. Problem Statement

What is the problem? Who feels it? Why now?

## 2. Goals

- Goal 1
- Goal 2

## 3. Non-Goals

- Out of scope item 1
- Out of scope item 2

## 4. User / Caller Stories

> As a **<role>**, I want **<capability>**, so that **<value>**.

## 5. Functional Requirements

| ID    | Requirement                              | Priority |
| ----- | ---------------------------------------- | -------- |
| FR-1  | …                                        | must     |
| FR-2  | …                                        | should   |

## 6. Non-Functional Requirements

| ID     | Requirement                            | Target            |
| ------ | -------------------------------------- | ----------------- |
| NFR-1  | Latency (p95)                          | < N ms            |
| NFR-2  | Throughput                             | ≥ N req/s         |
| NFR-3  | Memory                                 | ≤ N MB / request  |

## 7. Contracts

### 7.1 API / Interface

```ts
// add concrete TS interface(s) here
```

### 7.2 Errors

| Code             | Meaning                       |
| ---------------- | ----------------------------- |
| `ERR_FOO_BAR`    | …                             |

## 8. Test Plan

- Unit: …
- Integration: …
- E2E: …
- Performance: …

## 9. Open Questions

(Move resolved questions to a `## Decisions` section. Unresolved go to
`docs/questions.md` with a default choice marked `(default — proceeding)`.)

## 10. Decisions

(Append-only log of decisions made during implementation.)

## 11. References

- Link to related code, RFCs, analysis, etc.
