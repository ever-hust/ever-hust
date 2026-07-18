"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Mail, Loader2, ChevronDown, ShieldCheck, ExternalLink } from "lucide-react";
import { Card, CardContent } from "@ever-hust/ui/card";
import { Button } from "@ever-hust/ui/button";
import { Input } from "@ever-hust/ui/input";
import { toast } from "sonner";

interface ConnectBody {
  email: string;
  password: string;
  imapHost?: string;
  imapPort?: number;
  smtpHost?: string;
  smtpPort?: number;
}

const PROVIDER_HELP: { match: RegExp; label: string; href: string; note: string }[] = [
  { match: /gmail|googlemail/, label: "Gmail app password", href: "https://myaccount.google.com/apppasswords", note: "Enable 2-Step Verification, then create an app password (servers auto-detected)." },
  { match: /outlook|hotmail|live/, label: "Outlook app password", href: "https://account.microsoft.com/security", note: "Enable 2-step verification, then add an app password." },
  { match: /yahoo/, label: "Yahoo app password", href: "https://login.yahoo.com/account/security", note: "Generate an app password under Account Security." },
  { match: /icloud|me\.com/, label: "iCloud app-specific password", href: "https://account.apple.com/", note: "Create an app-specific password at appleid (Sign-In & Security)." },
];

export function InboxConnect({ onConnected }: { onConnected: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [imapHost, setImapHost] = useState("");
  const [smtpHost, setSmtpHost] = useState("");

  const help = PROVIDER_HELP.find((p) => p.match.test(email.split("@")[1] ?? ""));

  const connect = useMutation({
    mutationFn: async () => {
      const body: ConnectBody = { email: email.trim(), password };
      if (showAdvanced) {
        if (imapHost.trim()) body.imapHost = imapHost.trim();
        if (smtpHost.trim()) body.smtpHost = smtpHost.trim();
      }
      const res = await fetch("/api/inbox/account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((json as { error?: string }).error ?? "Could not connect");
      return json;
    },
    onSuccess: () => {
      toast.success("Mailbox connected");
      onConnected();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Could not connect"),
  });

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4">
      <Card>
        <CardContent className="p-6">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Mail className="h-5 w-5" aria-hidden="true" />
            Connect your email
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Connect an <span className="font-medium">existing</span> email account so Hust can show
            replies to your applications and send your replies — all in one place. We recommend a
            dedicated address just for your job search. (Custom company mailboxes come later with
            Gauzy.)
          </p>

          {process.env.NEXT_PUBLIC_GMAIL_INBOX_ENABLED === "true" && (
            <div className="mt-5">
              <Button variant="outline" className="w-full" asChild>
                <a href="/api/inbox/oauth/google/start">Connect with Google</a>
              </Button>
              <div className="my-3 flex items-center gap-3 text-xs text-muted-foreground">
                <span className="h-px flex-1 bg-border" />
                or connect with an app password
                <span className="h-px flex-1 bg-border" />
              </div>
            </div>
          )}

          <div className="mt-5 space-y-3">
            <div>
              <label className="text-sm font-medium" htmlFor="inbox-email">Email address</label>
              <Input
                id="inbox-email"
                type="email"
                autoComplete="off"
                placeholder="you@gmail.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium" htmlFor="inbox-pass">App password</label>
              <Input
                id="inbox-pass"
                type="password"
                autoComplete="off"
                placeholder="App-specific password (not your login password)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1"
              />
              {help && (
                <a
                  href={help.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  Create a {help.label} <ExternalLink className="h-3 w-3" aria-hidden="true" />
                </a>
              )}
            </div>

            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showAdvanced ? "rotate-180" : ""}`} aria-hidden="true" />
              Advanced (custom IMAP/SMTP server)
            </button>
            {showAdvanced && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Input placeholder="IMAP host (e.g. imap.example.com)" value={imapHost} onChange={(e) => setImapHost(e.target.value)} />
                <Input placeholder="SMTP host (e.g. smtp.example.com)" value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} />
              </div>
            )}

            <Button
              onClick={() => connect.mutate()}
              disabled={connect.isPending || !email.includes("@") || !password}
            >
              {connect.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              Connect mailbox
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <ShieldCheck className="h-4 w-4 text-primary" aria-hidden="true" />
            How it works &amp; setup
          </h3>
          <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm text-muted-foreground">
            <li>Pick (or create) an email for your job search — a dedicated address keeps things tidy.</li>
            <li>Turn on 2-step verification with your provider, then create an <span className="font-medium">app password</span> (Gmail/Outlook/Yahoo/iCloud are auto-detected).</li>
            <li>Enter your email + that app password above and click Connect. We verify it before saving.</li>
            <li>Hust reads recent mail over IMAP and sends from your account over SMTP. Your password is encrypted at rest and you can disconnect anytime.</li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
