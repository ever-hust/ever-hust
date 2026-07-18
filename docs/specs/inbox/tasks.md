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

## Phase 1 — Connect-your-own (SHIPPED via IMAP/SMTP)
> Implemented as **IMAP (read) + SMTP (send)** rather than Gmail OAuth so users can
> connect ANY existing mailbox (Gmail/Outlook/Yahoo/iCloud auto-detected; custom
> hosts supported) with an app password — no Google OAuth-app verification gate.
> `@jobs.hust.so` dedicated address is deprioritized. Corporate mailboxes are a
> later Gauzy seam.
- [x] `email_accounts` + `email_messages` tables (+ ensure-email-tables.cjs, prod-wired).
- [x] `apps/web/lib/mail.ts` — IMAP fetch (imapflow + mailparser) + SMTP send (nodemailer)
      + provider presets + connection verify. Password encrypted at rest.
- [x] API: `/api/inbox/account` (GET/POST/DELETE, verifies before save),
      `/api/inbox/sync`, `/api/inbox/messages` (threaded), `/api/inbox/send`.
- [x] Inbox UI: connect form + setup instructions; thread list + reader + reply composer.
- [ ] Background auto-sync (Trigger.dev) — currently on-demand "Sync" + on page load.
- [ ] AI: classify/summarize/draft-reply + link a thread to an application.
- [x] Gmail one-click **OAuth** (XOAUTH2) as an alternative to app passwords — gated
      behind `GMAIL_INBOX_CLIENT_ID/SECRET` + `NEXT_PUBLIC_GMAIL_INBOX_ENABLED`; works
      in Google "testing" mode (≤100 testers) without CASA. Refresh token encrypted.
- [x] TipTap rich composer.
- [ ] Microsoft Graph (Outlook) OAuth — same pattern, later.
- [ ] CASA verification to publish the Gmail OAuth app past 100 users.
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
