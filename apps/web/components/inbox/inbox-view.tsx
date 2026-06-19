"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Loader2, Send, Plus, Inbox as InboxIcon, Trash2, ArrowLeft, Sparkles, Briefcase } from "lucide-react";
import { Card } from "@ever-hust/ui/card";
import { Button } from "@ever-hust/ui/button";
import { Input } from "@ever-hust/ui/input";
import { Badge } from "@ever-hust/ui/badge";
import { toast } from "sonner";
import { useChatContext } from "@/components/chat/chat-context";
import { CATEGORY_LABELS, type EmailCategory } from "@/lib/email-classify";
import { TipTapComposer } from "./tiptap-composer";

/** Display order / significance for picking a thread's headline category. */
const CATEGORY_RANK: EmailCategory[] = ["offer", "interview", "scheduling", "rejection", "recruiter", "application", "other"];
const CATEGORY_VARIANT: Partial<Record<EmailCategory, string>> = {
  offer: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  interview: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
  scheduling: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
  rejection: "bg-destructive/15 text-destructive",
  recruiter: "bg-violet-500/15 text-violet-700 dark:text-violet-400",
  application: "bg-muted text-muted-foreground",
  other: "bg-muted text-muted-foreground",
};

interface Message {
  id: number;
  direction: "inbound" | "outbound";
  fromAddr: string | null;
  toAddrs: string | null;
  subject: string | null;
  snippet: string | null;
  bodyText: string | null;
  messageId: string | null;
  category: string | null;
  jobId: number | null;
  sentAt: string | null;
  createdAt: string;
}
interface Thread {
  threadKey: string;
  subject: string | null;
  lastAt: string | null;
  count: number;
  messages: Message[];
}
interface AccountView {
  email: string;
  status: string;
  lastSyncedAt: string | null;
}

function emailOf(addr: string | null): string {
  if (!addr) return "";
  const m = addr.match(/<([^>]+)>/);
  return (m?.[1] ?? addr).trim();
}
function fmt(ts: string | null): string {
  if (!ts) return "";
  try { return new Date(ts).toLocaleString(); } catch { return ""; }
}

/** Headline category for a thread: the most significant inbound category. */
function threadCategory(t: Thread): EmailCategory | null {
  const cats = t.messages
    .filter((m) => m.direction === "inbound" && m.category)
    .map((m) => m.category as EmailCategory);
  for (const c of CATEGORY_RANK) if (cats.includes(c)) return c;
  return null;
}
function threadJobId(t: Thread): number | null {
  return t.messages.find((m) => m.jobId)?.jobId ?? null;
}

function CategoryBadge({ category }: { category: EmailCategory | null }) {
  if (!category || category === "other") return null;
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${CATEGORY_VARIANT[category] ?? ""}`}>
      {CATEGORY_LABELS[category]}
    </span>
  );
}

export function InboxView({ account, onDisconnected }: { account: AccountView; onDisconnected: () => void }) {
  const qc = useQueryClient();
  const { setInitialPrompt } = useChatContext();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");

  const { data, isLoading } = useQuery<{ threads: Thread[] }>({
    queryKey: ["inbox-messages"],
    queryFn: async ({ signal }) => {
      const res = await fetch("/api/inbox/messages", { signal });
      if (!res.ok) throw new Error("Failed to load messages");
      const json = await res.json();
      return (json.data ?? json) as { threads: Thread[] };
    },
  });
  const threads = useMemo(() => data?.threads ?? [], [data]);
  const selected = useMemo(() => threads.find((t) => t.threadKey === selectedKey) ?? null, [threads, selectedKey]);

  const sync = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/inbox/sync", { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((json as { error?: string }).error ?? "Sync failed");
      return (json.data ?? json) as { stored: number; fetched: number };
    },
    onSuccess: (r) => {
      toast.success(r.stored > 0 ? `${r.stored} new message(s)` : "Up to date");
      qc.invalidateQueries({ queryKey: ["inbox-messages"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Sync failed"),
  });

  // Auto-sync on open: quietly pull new mail once if it hasn't synced in 5 min,
  // so replies show up without the user clicking Sync. (Background hourly sync
  // for everyone runs via Trigger.dev → /api/inbox/cron-sync.)
  const autoSyncedRef = useRef(false);
  useEffect(() => {
    if (autoSyncedRef.current) return;
    autoSyncedRef.current = true;
    const last = account.lastSyncedAt ? new Date(account.lastSyncedAt).getTime() : 0;
    if (Date.now() - last <= 5 * 60 * 1000) return;
    fetch("/api/inbox/sync", { method: "POST" })
      .then((res) => {
        if (res.ok) qc.invalidateQueries({ queryKey: ["inbox-messages"] });
      })
      .catch(() => {});
  }, [account.lastSyncedAt, qc]);

  const disconnect = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/inbox/account", { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to disconnect");
    },
    onSuccess: () => { toast.success("Disconnected"); onDisconnected(); },
    onError: () => toast.error("Failed to disconnect"),
  });

  const send = useMutation({
    mutationFn: async (payload: { to: string; subject: string; body: string; html?: string; inReplyTo?: string }) => {
      const res = await fetch("/api/inbox/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((json as { error?: string }).error ?? "Send failed");
    },
    onSuccess: () => {
      toast.success("Email sent");
      setComposeOpen(false); setTo(""); setSubject(""); setBody(""); setBodyHtml("");
      qc.invalidateQueries({ queryKey: ["inbox-messages"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Send failed"),
  });

  function startReply(t: Thread) {
    const lastInbound = [...t.messages].reverse().find((m) => m.direction === "inbound") ?? t.messages[t.messages.length - 1];
    setTo(emailOf(lastInbound?.fromAddr ?? null));
    setSubject(t.subject?.toLowerCase().startsWith("re:") ? t.subject : `Re: ${t.subject ?? ""}`);
    setBody(""); setBodyHtml("");
    setComposeOpen(true);
  }

  // Ask the AI (global chat) to draft a reply for this thread. Always includes
  // the linked job ID when known so the AI can pull the job's details.
  function draftWithAI(t: Thread) {
    const lastInbound = [...t.messages].reverse().find((m) => m.direction === "inbound") ?? t.messages[t.messages.length - 1];
    const jobId = threadJobId(t);
    const jobRef = jobId ? ` This relates to job ID ${jobId} — use its details.` : "";
    setInitialPrompt(
      `Draft a professional reply to this email so I can send it from my inbox.\n\n` +
        `Subject: ${t.subject ?? "(no subject)"}\n` +
        `From: ${lastInbound?.fromAddr ?? "unknown"}\n` +
        `Their message: """${(lastInbound?.bodyText ?? lastInbound?.snippet ?? "").slice(0, 1500)}"""${jobRef}\n\n` +
        `Keep it concise and friendly; output only the reply body.`,
      true,
    );
    toast.success("Drafting a reply in chat…");
  }

  const lastMessageId = selected?.messages[selected.messages.length - 1]?.messageId ?? undefined;

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2">
        <div className="flex items-center gap-2 text-sm">
          <InboxIcon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <span className="font-medium">{account.email}</span>
          {account.status === "error" && <Badge variant="destructive" className="text-[10px]">Connection error</Badge>}
          {account.lastSyncedAt && <span className="text-xs text-muted-foreground">· synced {fmt(account.lastSyncedAt)}</span>}
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => sync.mutate()} disabled={sync.isPending}>
            {sync.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}
            Sync
          </Button>
          <Button size="sm" onClick={() => { setTo(""); setSubject(""); setBody(""); setBodyHtml(""); setComposeOpen(true); setSelectedKey(null); }}>
            <Plus className="mr-1.5 h-3.5 w-3.5" /> New
          </Button>
          <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => disconnect.mutate()} disabled={disconnect.isPending} aria-label="Disconnect mailbox">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Thread list */}
        <div className={`w-full overflow-y-auto border-r sm:w-80 ${selected || composeOpen ? "hidden sm:block" : ""}`}>
          {isLoading ? (
            <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
          ) : threads.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              No messages yet. Click <span className="font-medium">Sync</span> to pull recent mail.
            </div>
          ) : (
            <ul>
              {threads.map((t) => (
                <li key={t.threadKey}>
                  <button
                    type="button"
                    onClick={() => { setSelectedKey(t.threadKey); setComposeOpen(false); }}
                    className={`flex w-full flex-col items-start gap-0.5 border-b px-4 py-3 text-left hover:bg-accent/50 ${selectedKey === t.threadKey ? "bg-accent/50" : ""}`}
                  >
                    <span className="flex w-full items-center gap-1.5">
                      <span className="line-clamp-1 flex-1 text-sm font-medium">{t.subject || "(no subject)"}</span>
                      <CategoryBadge category={threadCategory(t)} />
                    </span>
                    <span className="line-clamp-1 text-xs text-muted-foreground">{t.messages[t.messages.length - 1]?.snippet}</span>
                    <span className="flex items-center gap-1 text-[11px] text-muted-foreground/70">
                      {fmt(t.lastAt)} · {t.count} msg
                      {threadJobId(t) && <Briefcase className="h-3 w-3" aria-hidden="true" />}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Reader / composer */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {composeOpen ? (
            <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-4">
              <div className="flex items-center gap-2">
                <Button size="sm" variant="ghost" onClick={() => setComposeOpen(false)}><ArrowLeft className="h-4 w-4" /></Button>
                <span className="text-sm font-medium">New message</span>
              </div>
              <Input placeholder="To" value={to} onChange={(e) => setTo(e.target.value)} />
              <Input placeholder="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
              <TipTapComposer
                value={bodyHtml}
                onChange={(html, text) => { setBodyHtml(html); setBody(text); }}
                placeholder="Write your message…"
              />
              <div>
                <Button onClick={() => send.mutate({ to, subject, body, html: bodyHtml, inReplyTo: lastMessageId })} disabled={send.isPending || !to.includes("@")}>
                  {send.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Send className="mr-1.5 h-4 w-4" />}
                  Send
                </Button>
              </div>
            </div>
          ) : selected ? (
            <div className="flex flex-1 flex-col overflow-y-auto p-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <h2 className="truncate text-base font-semibold">{selected.subject || "(no subject)"}</h2>
                  <CategoryBadge category={threadCategory(selected)} />
                </div>
                <div className="flex items-center gap-2">
                  {threadJobId(selected) && (
                    <Button size="sm" variant="ghost" asChild>
                      <Link href={`/jobs/${threadJobId(selected)}`}>
                        <Briefcase className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" /> View job
                      </Link>
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => draftWithAI(selected)}>
                    <Sparkles className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" /> Draft with AI
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => startReply(selected)}>Reply</Button>
                </div>
              </div>
              <div className="space-y-3">
                {selected.messages.map((m) => (
                  <Card key={m.id} className="p-3">
                    <div className="mb-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span className="truncate">
                        {m.direction === "outbound" ? `You → ${m.toAddrs}` : `${m.fromAddr}`}
                      </span>
                      <span>{fmt(m.sentAt ?? m.createdAt)}</span>
                    </div>
                    <p className="whitespace-pre-wrap text-sm">{m.bodyText || m.snippet || "(no content)"}</p>
                  </Card>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-muted-foreground">
              Select a conversation, or click <span className="mx-1 font-medium">New</span> to compose.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
