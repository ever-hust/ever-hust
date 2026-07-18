---
slug: /
title: Hust Documentation
sidebar_position: 0
---

# Hust — The Anti-Hustle Career OS

Welcome to the documentation for **Hust**, the open, AI-native, candidate-side
career platform. Stop hustling. Start landing.

Hust carries a job seeker end-to-end — **find → evaluate → tailor → apply →
interview → negotiate → track** — through a conversational, split-screen app
(AI chat + a live jobs canvas), with **you in control of every action**.

## Start here

- **[Product Requirements (PRD)](./PRD.md)** — the full product vision, features, and the candidate journey.
- **[Architecture Decisions](./ARCHITECTURE-DECISIONS.md)** — the tech stack and the key engineering choices.
- **[MVP Implementation Summary](./MVP-IMPLEMENTATION-SUMMARY.md)** — what's actually shipped.
- **[Gauzy Integration](./GAUZY-INTEGRATION.md)** — the two optional Ever Gauzy seams (auto-apply, SSO/org-sync).
- **[Testing](./TESTING.md)** — how Hust is tested.

## How Hust is built

- **Open source** — Hust is licensed under **AGPL-3.0**; the brand is reserved.
- **Built on [Ever Jobs](https://github.com/ever-co/ever-jobs)** — the MIT-licensed engine that
  aggregates **160+ job sources** (boards, ATS platforms, and company career pages) and exposes
  REST / GraphQL / CLI / MCP surfaces.
- **Human-in-the-loop** — Hust drafts and recommends, but never submits an application or sends a
  message without your explicit, per-action approval.

## Links

- Website — [hust.so](https://hust.so)
- App — [app.hust.so](https://app.hust.so)
- Open Source — [hust.so/oss](https://hust.so/oss)

> 📝 These docs are an early scaffold. Deeper guides (getting started, the AI tools/agent, the
> API & MCP, self-hosting, and per-feature references) are being expanded from the codebase and
> the `specs/` folder.
