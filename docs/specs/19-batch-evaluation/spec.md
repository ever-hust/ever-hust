# Spec #19 — Batch Evaluation

> Status: Draft · Owner: Hust · Effort: M–L · Phase 4 · Depends on: [#3](../03-evaluation-engine/spec.md) + cost gating ([#6](../06-guardrails/spec.md))

## 1. Problem & user value

Power users and (later) teams want many jobs scored without clicking each. Batch evaluation fans
out [#3](../03-evaluation-engine/spec.md) across a result set in the background, **cost-gated** so
expensive work only runs where it's worth it.

## 2. Scope

**In:** background fan-out of `evaluateJob` over a saved search / candidate set via Trigger.dev;
**cost gating** (only fully evaluate above a score floor / within quota); progress + results
surfaced when ready. **Out:** auto-applying to the batch (that's [#19a](../19a-apply-copilot/spec.md), HITL).

## 3. Design

- A Trigger.dev task `batch-evaluate` fans out `evaluateJob` with bounded concurrency; writes
  `evaluations` rows; respects per-tier quota + a **score-floor pre-filter** (cheap heuristic before
  the full LLM evaluation) via #6's `withCostGate`.
- Results stream to the canvas (realtime) / an "evaluated" view; never auto-acts.

## 4. Plan & tasks

1. `batch-evaluate` Trigger.dev task (bounded concurrency, idempotent upserts).
2. Cheap pre-filter + `withCostGate` (score floor / quota).
3. Progress + results UI (realtime).
4. Tests: fan-out caps, cost-gate skip path, idempotent re-run.

## 5. Acceptance

- A user batch-evaluates a result set; expensive evaluation is skipped below the floor / over quota;
  results appear without any auto-action; CI green; **zero competitor references**.
