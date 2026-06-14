# Hust Roadmap — building the Anti-Hustle Career OS

This is the master plan for taking Hust from today's AI job-search app to the full vision in the
[README](../../README.md): **an open, AI-native career operating system** that carries a seeker
end-to-end — find → evaluate → tailor → apply → interview → negotiate → track — with **quality
over quantity** and a **human-in-the-loop**.

Each epic below has its own spec under [`docs/specs/<NN-epic>/`](.) (`spec.md` = what & why,
`plan.md` = how, `tasks.md` = ordered checklist). This file is the index, the sequencing, and the
principles every spec inherits.

> **Sourcing note.** Designs here are informed by deep competitive research and prior-art review.
> Per repo policy, that research is **not** referenced from any tracked repo — it lives only in
> `OTHERS/Research/` (untracked). Nothing in `docs/specs/` names a competitor; every feature is
> described as Hust's own design.

---

## Principles (every spec inherits these)

1. **Quality over quantity.** The product steers users toward *fewer, better* applications. Where a
   feature could push volume, it must instead surface fit and discourage low-value effort.
2. **Human-in-the-loop, always.** Hust drafts; the user approves. Nothing is sent on a user's
   behalf without an explicit, un-overridable approval step. We never auto-submit silently.
3. **The partition rule.** *Whole-market, anonymous, corpus-level → Ever Jobs (behind the API).
   This-user's account/history/identity → Hust.* If a fact is identical for every user it belongs
   in Ever Jobs; if it depends on this user's CV/preferences/outcomes it lives in Hust. See
   [PRD](../PRD.md) and the standalone/integration boundary in [GAUZY-INTEGRATION](../GAUZY-INTEGRATION.md).
4. **Additive.** Nothing already shipped is removed; these epics extend the product.
5. **Structured output everywhere.** Every AI artifact emits a strict, machine-readable summary
   alongside its prose, so output is queryable (the precondition for analytics + learning).
6. **Standalone-first.** Every epic must work without any Gauzy product; only the Ever Jobs API is
   a hard dependency. Optional Gauzy seams stay behind flags + adapters.

---

## The keystone & the trunk

One capability unlocks most of the rest: a **Job-Fit Evaluation & Scoring engine** (`evaluateJob`).
Once each job carries a structured per-user evaluation (a score, blocks, a machine summary), it
feeds the application pipeline, funnel analytics, interview prep, the legitimacy radar's host
surface, document tailoring, negotiation, and the learning loop.

**Trunk:** `#5 Structured-output contract → #3 Evaluation engine`. Almost everything in Phase 2/3
hangs off `#3`. **`#1 Harvest Ever Jobs` is an independent parallel track** (pure integration, no
dependency on the trunk) — the safe concurrent first move.

**Quick-wins shortlist (do first):** `#1 Harvest Ever Jobs`, `#2 Applications Kanban`,
`#3 Evaluation MVP` — highest value-to-effort, and they de-risk everything after.

---

## The epics

**Owner:** Hust (user-stateful) · EJ (Ever Jobs, corpus-level) · `Hust←EJ` (Hust consumes an EJ
capability) · `EJ→Hust` (EJ produces, Hust renders).
**Effort:** S (days) · M (1–2 wk) · L (3–6 wk) · XL (quarter+).

| # | Epic | Owner | Effort | Depends on | Phase |
|---|------|-------|--------|-----------|-------|
| 1 | **Harvest Ever Jobs** — widen `siteType` (11→160+), pass `companySlug` for ATS depth, drop USA-only, consume `/api/jobs/analyze`; multi-source dedup + liveness come along free | Hust←EJ | M | — | 1 |
| 2 | **Applications Kanban** — drag pipeline + rank-preserving state machine + fuzzy dedup over the existing `applications` table | Hust | M | — | 1 |
| 3 | **Evaluation engine (`evaluateJob`)** — A–F fit report, configurable weighted dimensions, job-family/archetype-aware, persisted | Hust | L | #5 | 1 |
| 4 | **Per-job liveness on the search DTO** — surface `active/expired/uncertain` so we never apply to dead listings | EJ→Hust | S+S | — | 1 |
| 5 | **Structured-output / machine-summary contract** — the platform seam that makes every AI artifact queryable | Hust | S–M | — | 1 |
| 6 | **Ethical guardrails as policy** — HITL, no-invent, follow-up caps, encoded in ToS + server-side state | Hust | S | — | 1 |
| 7 | **Posting-legitimacy / "ghost-job" radar** — corpus-level trust signals (repost frequency, perpetual reqs, vague comp, off-platform redirects); the one net-new *data* capability | EJ→Hust | M+S | #3 | 2 |
| 8 | **Funnel & rejection-pattern analytics** — conversion by segment, empirical score floor, auto-tuned targeting | Hust | L | #3, #5, #2 | 2 |
| 9 | **Follow-up cadence engine** — pure urgency functions → badges + email nudges (reuses cron + Resend) | Hust | M | #2 | 2 |
| 10 | **Cover-letter pipeline** — HITL approval gates, keyword mirroring, real PDF output | Hust | L | render service | 2 |
| 11 | **Résumé / CV document rendering** — HTML→PDF + ATS sanitizer (LaTeX fast-follow) | Hust | L | #5, render service | 2 |
| 12 | **Interview prep + STAR story bank** — audience-segmented, reusable master stories, mock mode | Hust | M–L | #3 | 2–3 |
| 13 | **Personalization & continuous-learning loop** — user feedback/overrides tune future scoring & generation | Hust | M | #3 | 2–3 |
| 14 | **Writing-style fingerprint** — voice-matched generation from abstract descriptors (privacy-safe, no raw text) | Hust | M | #10 | 3 |
| 15 | **Negotiation coaching** — offer-stage scripts, cited, market-aware | Hust | M | #3 + comp data | 3 |
| 16 | **Deep company research** — multi-axis external enrichment, cached, progressive UI | Hust (+opt EJ) | M | — | 3 |
| 17 | **Recruiter/LinkedIn outreach** — short framework drafts, draft-only (HITL) | Hust | S–M | #16 | 3 |
| 18 | **Career-growth advisor** — gap-driven training/project suggestions | Hust | M | #8 | 3 |
| 19 | **Batch evaluation** — background fan-out (Trigger.dev), cost-gated by score floor | Hust | M–L | #3 | 4 |
| 19a | **Apply copilot** — HITL form-fill that drafts every answer, **never auto-submits** | Hust | M | #3, #10, #6 | 4 |
| 19b | **Localized comp/benefit knowledge packs** — per-market comp semantics beyond string i18n | Hust | XL | #1 (non-US) + #3 | 4 |

---

## Phases (Now / Next / Later / Ambition)

- **Phase 1 — Foundation & Quick Wins:** #1, #2, #3 (+ enablers #4, #5, #6). Harvest the backend
  we already pay for; turn `/applications` into a real pipeline; ship the evaluation keystone.
- **Phase 2 — Workflow Depth:** #7 ghost-job radar, #8 funnel analytics, #9 follow-ups,
  #10/#11 real documents, #12 interview prep, #13 learning loop. All lean on #3.
- **Phase 3 — Differentiation:** #14 style fingerprint, #15 negotiation, #16 company research,
  #17 outreach, #18 growth advisor.
- **Phase 4 — Ambition:** #19 batch, #19a apply copilot, #19b localized comp.

---

## Execution conventions

- One **feature branch per epic** off `develop` (`feature/<NN>-<slug>`); PR into `develop`; cascade
  `develop → stage → main` when green (see workspace `RELEASE_CASCADE`).
- Each epic ships its spec (`spec.md`/`plan.md`/`tasks.md`) **first**, then code, then tests
  (unit + E2E), green CI before merge.
- **Verify every commit is competitor-free** (workspace `RULES.md` → the grep in
  `OTHERS/Research/COMPETITORS.md`). No competitor names in any spec, comment, or commit.
- New AI tools follow the existing orchestrator pattern: Zod input, `userId` injected server-side,
  structured output. New tables via Drizzle migrations.
