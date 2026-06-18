# Hust Inbox — Email-for-Jobs (PRD / Spec)

**Status:** Draft · **Owner:** Product/Eng · **Created:** 2026-06-19 · **License:** AGPL-3.0
**Spec-kit slug:** `inbox`

> Hust should own the *entire* email conversation around a job search. A candidate
> connects (or is given) a dedicated jobs mailbox; Hust sends applications and
> outreach from it, receives company replies into it, and the AI reads, triages,
> drafts, and helps the user reply — all inside the split-screen app. This turns
> Hust from "find + tailor" into "find → apply → **correspond** → track" without
> the user ever leaving for Gmail.

---

## 1. Problem & Vision

Today the apply/outreach loop leaves the product: the user applies on an external
site or sends an email from their personal Gmail, then replies arrive somewhere
Hust can't see. Hust loses the thread exactly when the high-value coaching
(negotiation, scheduling, follow-ups) matters most.

**Vision:** an **Inbox** surface (menu item directly below *Jobs*) where:

- The user connects an email account **or** uses a Hust-provisioned address
  dedicated to the job search (recommended: a fresh address, not their primary).
- Outgoing emails Hust sends on the user's behalf (applications, recruiter
  outreach, replies) appear in the inbox as **sent**.
- Incoming replies from companies/recruiters land as **received**, threaded.
- The orchestrator AI reads every message, classifies it (interview invite,
  rejection, recruiter outreach, offer, scheduling, info request…), links it to
  the right **job/application**, and proposes a **draft reply**.
- The user composes/replies inside Hust with a rich editor (**TipTap**) using
  **react-email** templates, or sends the AI draft with one click.

---

## 2. Goals / Non-Goals

### Goals
- G1. A first-class **Inbox** page (below *Jobs* in the sidebar).
- G2. **Connect a mailbox** (Gmail / Outlook) via OAuth, **and/or** a
  **Hust-managed dedicated address** (`<handle>@jobs.hust.so` or similar).
- G3. **Two-way sync**: see incoming *and* outgoing email, threaded.
- G4. **Send/reply from inside Hust** (TipTap composer + react-email rendering).
- G5. **AI processing**: classify, summarize, link-to-job/application, draft reply.
- G6. Tight link to the existing **Applications** pipeline (a message updates an
  application's status: applied → interviewing → offer → rejected).
- G7. Strong **security/privacy**: encrypted token storage, least-privilege
  scopes, clear consent, easy disconnect + data deletion.

### Non-Goals (initially)
- N1. Being a full general-purpose email client (labels, full search across all
  mail, calendar). Scope is **job-search correspondence**.
- N2. Replacing the user's primary inbox. We *recommend a dedicated address.*
- N3. Mass/cold outreach automation (anti-spam posture; human-in-the-loop stays).
- N4. Phone/SMS channels.

---

## 3. Build-vs-buy: what fits (and what doesn't)

| Option | What it is | Fit for Hust Inbox |
|---|---|---|
| **Novu Inbox** (`novu.co/inbox`) | In-app **notification** center (bell feed, toasts) | ❌ **Not an email client.** Great for app notifications/alerts (see item 15) but does **not** receive/send real email or thread company replies. Keep for notifications, not for this. |
| **Gmail API / Microsoft Graph** | Direct per-provider OAuth + REST + push | ✅ Best fidelity for *connect-your-own-mailbox*. Two integrations to maintain. |
| **Nylas / Unipile / AgentMail** | Unified email API over many providers (OAuth, send, sync, webhooks) | ✅ Fastest path to multi-provider connect; one integration. Cost + vendor lock-in. **Recommended for Phase 1** if budget allows; Gmail-direct as the free/OSS fallback. |
| **Postmark inbound / Resend inbound / AWS SES + Cloudflare Email Routing** | Inbound parse webhook + outbound send for a **Hust-owned domain** | ✅ Best for the **dedicated `@jobs.hust.so` address**. We already use **Resend** for transactional mail — extend it. **Recommended for Phase 2.** |
| **Stalwart / Mailcow (self-host)** | Full mail server | ⚠️ Maximum control + OSS-friendly, but ops-heavy. Consider later for the dedicated-address backend instead of a SaaS. |

**Editor stack (decided):** **TipTap** for compose/reply WYSIWYG → serialize to
HTML; render/send with **`@react-email`** components (we already depend on
react-email + Resend). Plain-text fallback auto-generated.

**Recommendation:** Phase 1 = **connect-your-own (Gmail direct, OSS-friendly)**;
Phase 2 = **Hust dedicated address** via Resend/SES inbound on `jobs.hust.so`.
Abstract both behind a `MailProviderPlugin` (see §6) so the app code is
provider-agnostic — consistent with Hust's "pluggable features = plugins" rule.

---

## 4. User Stories

1. *As a seeker*, I connect (or get) a jobs email so all application correspondence
   lives in one place.
2. *As a seeker*, when I apply to a job, the email Hust sends shows up in my Inbox
   as **Sent**, linked to that job.
3. *As a seeker*, a recruiter replies and I see it in Hust with an AI summary and a
   suggested response.
4. *As a seeker*, I reply with a rich editor or accept the AI draft; it sends from
   my jobs address and threads correctly.
5. *As a seeker*, an "interview invite" email auto-moves the application to
   **Interviewing** and offers to draft scheduling/availability.
6. *As a privacy-conscious user*, I'm told to use a **dedicated** address, can see
   exactly what scopes Hust has, and can disconnect + wipe synced mail anytime.

---

## 5. Architecture

```
                ┌────────────── Hust (Next.js / app.hust.so) ──────────────┐
 Provider       │  Inbox UI (thread list · reader · TipTap composer)        │
 ───────        │        │                  ▲                               │
 Gmail API ─┐   │        ▼                  │ realtime (Supabase)           │
 MS Graph  ─┼─▶ │  MailProviderPlugin  ──▶ email_threads / email_messages   │
 Nylas     ─┘   │   (sync · send · parse)   email_accounts / attachments    │
 Resend/SES ┐   │        │                  │                               │
 (inbound)  ┴─▶ │  Inbound webhook  ───────▶ AI pipeline (classify · link · │
                │        ▲                    draft) ─▶ applications/jobs     │
                └────────┼──────────────────────────────────────────────────┘
                  push/webhooks (Gmail watch, SES/Resend inbound, Nylas)
```

### 5.1 Data model (Drizzle / Postgres — new tables)
- **`email_accounts`** — `id, userId, provider ('gmail'|'outlook'|'nylas'|'hust')`,
  `address`, `displayName`, `status`, `accessTokenEnc`, `refreshTokenEnc`,
  `historyId/cursor`, `scopes`, `connectedAt`, `lastSyncedAt`. Tokens **encrypted
  at rest** (reuse `@ever-hust/ai` crypto / `BYOK_ENCRYPTION_KEY` pattern).
- **`email_threads`** — `id, userId, accountId, providerThreadId, subject`,
  `jobId?` (FK jobs), `applicationId?` (FK user_jobs), `lastMessageAt`, `snippet`,
  `unread`, `category` (enum: interview, rejection, recruiter, offer, scheduling,
  info, other), `archived`.
- **`email_messages`** — `id, threadId, providerMessageId, direction
  ('inbound'|'outbound')`, `fromAddr, toAddrs, cc, bcc`, `subject`, `bodyHtml`,
  `bodyText`, `sentAt`, `state ('draft'|'queued'|'sent'|'received'|'failed')`,
  `aiSummary?`, `inReplyTo?`, `headersJson`.
- **`email_attachments`** — `id, messageId, filename, mime, size, storageKey`
  (Supabase Storage), `providerAttachmentId`.
- **`email_send_queue`** (optional, Trigger.dev) — outbound jobs with retry.

### 5.2 Sync & send
- **Gmail (Phase 1):** OAuth (scopes `gmail.readonly` + `gmail.send`, or
  `gmail.modify` for labels); `users.watch` → Pub/Sub push → `history.list` delta;
  send via `messages.send` (RFC822 from react-email HTML + MIME).
- **Dedicated address (Phase 2):** MX on `jobs.hust.so` → **inbound parse**
  (Resend inbound / SES + Lambda / Cloudflare Email Routing → webhook) →
  normalize → store; send via Resend/SES with that address; reply-to threading via
  `Message-ID`/`In-Reply-To`/`References`.
- **Threading:** key on RFC `Message-ID` + `References`; provider thread id when
  available; fall back to normalized subject + participants.

### 5.3 AI pipeline (extends `packages/ai`)
- On new inbound message: `classifyEmail` (category), `summarizeEmail`, `linkToJob`
  (match sender domain/company + recent applications), and `draftReply`
  (structured-output tool, human-in-the-loop — never auto-send by default).
- Surfaces in the orchestrator as tools: `readInbox`, `summarizeThread`,
  `draftEmailReply`, `sendEmail` (gated approval), `logApplicationStatus`.
- Reuses the existing tool-approval UX (no silent sends; AGPL-clean).

### 5.4 Security & privacy
- Tokens encrypted at rest; secrets only in `.env`/secret store; never to client.
- **Least privilege**: request the minimum scopes; show them in Settings.
- **Consent & control**: explicit connect screen; one-click **disconnect** that
  revokes tokens and (optionally) **purges** synced mail.
- Strongly **recommend a dedicated address** in onboarding copy.
- Inbound spam/phishing handling; never render remote content unsanitized
  (sanitize like job descriptions: rehype-sanitize / DOMPurify).
- Compliance: Google **OAuth restricted-scope** verification + CASA assessment is
  required before GA of Gmail send/read — track as a launch gate.

---

## 6. `MailProviderPlugin` contract (packages/plugins)

Consistent with the AI-provider plugin architecture already in the repo:

```ts
// packages/plugin (base, client-safe types)
export interface MailProviderPlugin {
  kind: "mail-provider";
  id: "gmail" | "outlook" | "nylas" | "hust";
  label: string;
  // OAuth / connection
  getAuthUrl(state: string): string;
  exchangeCode(code: string): Promise<MailAccountTokens>;
  // sync
  listThreads(account: MailAccount, cursor?: string): Promise<MailThreadPage>;
  getMessage(account: MailAccount, id: string): Promise<MailMessage>;
  // send
  sendMessage(account: MailAccount, msg: OutboundMail): Promise<{ id: string }>;
  // webhooks
  parseInbound(req: Request): Promise<MailMessage | null>;
}
```

Implementations: `packages/plugins/mail-gmail`, `…/mail-nylas`,
`…/mail-hust` (Resend/SES). Registry + dispatcher live in `packages/ai` or a new
`packages/mail`.

---

## 7. UX

- **Sidebar:** new **Inbox** item directly **below Jobs** (badge = unread count).
- **Inbox page:** 3-pane on desktop — thread list (filter by category/job),
  reading pane (rendered HTML, attachments, AI summary + suggested reply chip),
  **TipTap composer**. Mobile: list → thread → composer.
- **Job/Application linkage:** each thread shows the linked job card; a thread can
  drive the application status timeline.
- **Onboarding:** "Set up your jobs inbox" — choose *Connect Gmail/Outlook* or
  *Create a Hust jobs address*; explain the dedicated-address recommendation.
- **Settings:** connected accounts, scopes, disconnect, data export/delete.

---

## 8. Phasing

- **Phase 0 — Spec & scaffolding** *(this doc + tables + sidebar item, no provider).*
- **Phase 1 — Connect-your-own (Gmail):** OAuth, read+send, threads, TipTap
  composer, AI summarize + draft reply, link to applications. Read-only sync first,
  then send behind approval.
- **Phase 2 — Hust dedicated address:** MX + inbound parse on `jobs.hust.so`,
  outbound via Resend/SES, full thread ownership.
- **Phase 3 — Deep AI ops:** auto-categorize + status sync, scheduling assistant,
  follow-up nudges (reuse `packages/triggers/follow-up-nudges`), negotiation help.
- **Phase 4 — Outlook/Nylas + polish:** multi-provider, search, attachments at
  scale, deliverability hardening.

---

## 9. Risks / Open questions

- **Deliverability** of the dedicated domain (SPF/DKIM/DMARC, warmup, reputation).
- **Google verification** (restricted scopes + CASA) — long lead time; gate GA.
- **Privacy/compliance** (storing third-party email) — retention, encryption,
  regional data; AGPL transparency.
- **Cost** of unified APIs (Nylas) vs maintaining Gmail+Graph directly.
- **Open Q:** dedicated address format (`user@jobs.hust.so` vs random handle)?
- **Open Q:** store full bodies vs metadata + on-demand fetch (privacy vs UX)?
- **Open Q:** default to connect-own or to Hust-address in onboarding?

---

## 10. Success metrics
- % of applications whose replies are captured in Hust.
- Time-to-first-reply; AI-draft acceptance rate.
- Inbox WAU; threads linked to an application; disconnect/complaint rate (inverse).

See [`tasks.md`](tasks.md) for the phased, checkbox task breakdown.
