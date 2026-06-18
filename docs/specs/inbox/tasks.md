# Hust Inbox — Tasks

Phased, checkbox task list for the Inbox feature. See [`spec.md`](spec.md) for the
full PRD. Each phase is independently shippable behind a feature flag
(`NEXT_PUBLIC_INBOX_ENABLED`).

## Phase 0 — Spec & scaffolding
- [x] PRD / spec (`spec.md`) + tasks (`tasks.md`).
- [ ] Add **Inbox** sidebar item below *Jobs* (flag-gated, "Coming soon" until P1).
- [ ] Drizzle schema: `email_accounts`, `email_threads`, `email_messages`,
      `email_attachments` (+ indexes on `userId`, `threadId`, `providerMessageId`).
- [ ] `packages/plugin`: add `MailProviderPlugin` contract + shared types.
- [ ] New `packages/mail` (or extend `packages/ai`) registry/dispatcher.
- [ ] Token encryption helper (reuse `BYOK_ENCRYPTION_KEY` crypto).

## Phase 1 — Connect-your-own (Gmail)
- [ ] `packages/plugins/mail-gmail`: OAuth (getAuthUrl/exchangeCode), `listThreads`,
      `getMessage`, `sendMessage`, Gmail `watch` → Pub/Sub push → `history.list`.
- [ ] OAuth connect/callback routes + Settings "Connected mailboxes" card
      (scopes shown, disconnect + purge).
- [ ] Sync worker (Trigger.dev) → upsert threads/messages; Supabase realtime push.
- [ ] Inbox UI: thread list + reader (sanitized HTML, attachments, AI summary).
- [ ] **TipTap** composer + `@react-email` render → MIME → `sendMessage` (behind
      tool-approval; never silent-send).
- [ ] AI tools: `readInbox`, `summarizeThread`, `draftEmailReply`; classify +
      `linkToJob`/`applicationId`.
- [ ] Link a thread → Applications status timeline.
- [ ] Tests: plugin (mock Gmail), parsing/threading, AI classify, send approval.

## Phase 2 — Hust dedicated address (`jobs.hust.so`)
- [ ] DNS: MX + SPF/DKIM/DMARC for `jobs.hust.so`.
- [ ] Inbound parse webhook (Resend inbound / SES+Lambda / Cloudflare Email
      Routing) → normalize → store; signature verification.
- [ ] `packages/plugins/mail-hust`: outbound via Resend/SES from the address;
      RFC threading (`Message-ID`/`In-Reply-To`/`References`).
- [ ] Provision flow: pick handle → create `email_accounts(provider='hust')`.
- [ ] Deliverability: warmup, bounce/complaint handling, rate caps.

## Phase 3 — Deep AI ops
- [ ] Auto-categorize + application status sync (interview → Interviewing, etc.).
- [ ] Scheduling assistant (propose availability; optional calendar later).
- [ ] Follow-up nudges via `packages/triggers/follow-up-nudges`.
- [ ] Negotiation/offer correspondence help (reuse negotiation tools).

## Phase 4 — Multi-provider & polish
- [ ] `packages/plugins/mail-outlook` (Microsoft Graph) or `mail-nylas` (unified).
- [ ] Search across threads; attachment handling at scale.
- [ ] Deliverability + spam/phishing hardening; full a11y pass.

## Launch gates
- [ ] Google OAuth **restricted-scope verification** + CASA assessment (P1 GA).
- [ ] Security review: token storage, scope minimization, disconnect+purge,
      inbound sanitization.
- [ ] Privacy: retention policy, data export/delete, AGPL transparency notes.
