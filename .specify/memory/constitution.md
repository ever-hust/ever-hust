# Hust — Project Constitution

> Non-negotiable design principles for **Hust — The Anti-Hustle Career OS** (hust.so).
> If a new spec contradicts a clause here, the spec must be rejected or the constitution
> must be amended (with a recorded ADR in `docs/adr/`).

## Article 1 — Identity

Hust is a **standalone, open, AI-native, candidate-side career operating system**. It
carries a job seeker end-to-end — **find → evaluate → tailor → apply → interview →
negotiate → track** — through a conversational split-screen app (AI chat on the left, a
live jobs canvas on the right). The ethos is **quality over quantity** and
**human-in-the-loop**, not spray-and-pray automation. Licence: **AGPL-3.0**.

## Article 2 — Standalone-First (optional Gauzy integration)

1. Hust MUST always build, run, and ship **independently**, with no dependency on any
   Gauzy product.
2. The **only hard external dependency** is the **Ever Jobs API** (`packages/jobs-api/`).
3. Hust owns its own auth (BetterAuth + LinkedIn), users, database, and apply flow.
4. Optional **Ever Gauzy** integration (auto-apply; employee/org/tenant sync + SSO) is
   **off by default**, lives **behind a flag + adapter** with graceful fallback to
   standalone behaviour, and is reached **only via the Gauzy AI API**. Full design:
   [`docs/GAUZY-INTEGRATION.md`](../../docs/GAUZY-INTEGRATION.md).

## Article 3 — Quality Over Quantity

Product design must steer users toward **fewer, better** applications. Features that
merely increase the volume of low-value effort are rejected. Evaluation, fit-scoring,
and ghost-job filtering exist to spend the user's energy where it counts.

## Article 4 — Human-in-the-Loop, Always

Hust **drafts; the user approves**. Nothing is sent, submitted, connected, or applied on
a user's behalf without an **explicit, un-overridable approval**. Silent automation is
forbidden — the approval gate is structural, not a prompt that can be talked around.
(Even the optional Gauzy auto-apply seam stays per-action approval-gated.)

## Article 5 — Structured Output Everywhere

Every AI artifact (evaluation, cover letter, interview plan, negotiation brief, …) emits
a **strict, machine-readable summary** (a Zod-validated object) **alongside** its prose,
so output is queryable for analytics, learning loops, and downstream tools. Tool results
flow to the canvas via `useCanvasSync`; the typed contract is the source of truth.

## Article 6 — The Partition Rule (Hust ⇄ Ever Jobs)

1. **Whole-market, corpus-level, anonymous** work (sourcing, dedup, liveness, salary
   normalisation, corpus legitimacy signals) lives in **Ever Jobs**, behind the API.
2. **This-user's stateful, identity-bound** work (CV, preferences, evaluations,
   applications, interview notes, analytics) lives in **Hust**.
3. New features go to whichever side owns that class of data. When unsure, default to
   Hust for anything user-specific.

## Article 7 — Grounded Generation (no invention)

AI output must be **grounded** in real inputs — the user's profile/CV, the job's data,
and retrieved facts. No fabricated experience, employers, numbers, or quotes. Where a
fact is unknown, say so; never invent. Grounding/no-invent helpers live with the
guardrails (epic #6).

## Article 8 — Privacy & Security

1. Secrets only via env vars; never in source.
2. PII hygiene: strip encrypted keys, raw CV text, email/phone from any payload sent to
   the LLM (see `getUserProfile`).
3. Every AI tool's Zod input schema enforces `.max()` bounds on strings/arrays.
4. Validate every inbound API payload with Zod; rate-limit every public endpoint.

## Article 9 — Spec-First Development

1. No code is written for an epic without a `spec.md` **and** a `plan.md` under
   `docs/specs/<NN>-<slug>/`.
2. The spec answers: *what, why, scope, non-goals, contracts, test plan*.
3. The plan lists: *phases, packages touched, dependencies, risks, rollback*.
4. The tasks file contains ordered, verifiable, ≤1-day work items.
5. The Spec Kit machinery (this constitution + `templates/`) lives in `.specify/`; the
   **specs themselves live in `docs/specs/`** (deliberate — keep specs with the docs).

## Article 10 — House Stack, Testing & CI

1. **TypeScript only**; **pnpm** exclusively (never npm/yarn); **Node.js ≥ 24**.
2. Every AI tool and every public function has at least one unit test (**Jest** + ts-jest,
   `isolatedModules: true`).
3. Critical user flows have **Playwright** E2E coverage.
4. CI (lint, type-check, unit, E2E) must be **green** before merge; work lands on
   `develop`, then cascades `develop → stage → main` only when green.
5. Prefer the latest stable dependency; new direct deps need a justification line in the
   epic's `plan.md`.

## Article 11 — Competitor Confidentiality (STRICT, non-negotiable)

1. **NEVER** mention, name, link, or reference any competitor in **any tracked repo**
   (code, comments, docs, specs, commit messages, branch names, tests, fixtures).
2. Competitor material is stored **only** in the untracked research hub
   `C:\Coding\Ever Gauzy AI\OTHERS\Research` — never inside a product repo.
3. **Our own Ever brands are always fine to mention** — `ever-jobs` / **Ever Jobs**,
   **Ever Gauzy** / Gauzy AI, **Hust**, **Ever Co.**, etc. They are ours, not competitors.
4. **Verify before every commit/push**: grep the staged change for competitor names; a
   non-empty result blocks the commit. The canonical name list lives only in the
   untracked `OTHERS/Research/COMPETITORS.md`.
5. Capabilities inspired by external analysis are re-expressed as **our own** design,
   grounded in our codebase and roadmap — never attributed to or named after a competitor.

---

_Ratified: 2026-06-14._
_Amend via ADR in `docs/adr/`._
