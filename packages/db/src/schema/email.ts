import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { users } from "./users";
import { jobs } from "./jobs";

/**
 * A connected email account (the user's EXISTING mailbox, e.g. Gmail) accessed
 * over IMAP (read) + SMTP (send). One per user for the MVP. The password (an
 * app-specific password) is encrypted at rest via @ever-hust/ai crypto.
 */
export const emailAccounts = pgTable(
  "email_accounts",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    userId: text("user_id")
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    username: text("username").notNull(),
    passwordEnc: text("password_enc").notNull(),
    imapHost: text("imap_host").notNull(),
    imapPort: integer("imap_port").notNull().default(993),
    imapSecure: boolean("imap_secure").notNull().default(true),
    smtpHost: text("smtp_host").notNull(),
    smtpPort: integer("smtp_port").notNull().default(465),
    smtpSecure: boolean("smtp_secure").notNull().default(true),
    status: text("status", { enum: ["connected", "error"] }).notNull().default("connected"),
    lastError: text("last_error"),
    lastSyncedAt: timestamp("last_synced_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("email_accounts_user_idx").on(t.userId)],
);

/** A stored email message (inbound from sync, or outbound we sent). */
export const emailMessages = pgTable(
  "email_messages",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accountId: integer("account_id")
      .notNull()
      .references(() => emailAccounts.id, { onDelete: "cascade" }),
    /** IMAP UID (inbound) — for incremental sync. */
    uid: integer("uid"),
    /** RFC Message-ID — dedup key. */
    messageId: text("message_id"),
    /** Normalized subject for grouping a conversation. */
    threadKey: text("thread_key"),
    direction: text("direction", { enum: ["inbound", "outbound"] }).notNull(),
    /** Heuristic category for inbound mail (interview/rejection/offer/...). */
    category: text("category"),
    /** Linked job (the application this thread relates to), when matched. */
    jobId: integer("job_id").references(() => jobs.id, { onDelete: "set null" }),
    fromAddr: text("from_addr"),
    toAddrs: text("to_addrs"),
    subject: text("subject"),
    snippet: text("snippet"),
    bodyText: text("body_text"),
    bodyHtml: text("body_html"),
    sentAt: timestamp("sent_at"),
    seen: boolean("seen").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("email_messages_user_idx").on(t.userId),
    index("email_messages_account_idx").on(t.accountId),
    index("email_messages_thread_idx").on(t.userId, t.threadKey),
    index("email_messages_job_idx").on(t.jobId),
    unique("email_messages_msgid_unique").on(t.accountId, t.messageId),
  ],
);
