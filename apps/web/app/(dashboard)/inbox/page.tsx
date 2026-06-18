import type { Metadata } from "next";
import { Inbox, Mail, Sparkles, ShieldCheck, PenLine } from "lucide-react";
import { Card, CardContent } from "@ever-hust/ui/card";
import { Badge } from "@ever-hust/ui/badge";
import { Button } from "@ever-hust/ui/button";
import { PageHeader } from "@/components/shared/page-header";

export const metadata: Metadata = {
  title: "Inbox · Hust",
  description: "Your dedicated job-search inbox — coming soon.",
};

const FEATURES = [
  {
    icon: Mail,
    title: "One inbox for your search",
    body: "Connect Gmail/Outlook or get a dedicated Hust jobs address. Applications you send and replies you receive all live here, threaded.",
  },
  {
    icon: Sparkles,
    title: "AI reads & drafts",
    body: "Hust summarizes each message, links it to the right job, and drafts your reply — interview invites even move the application forward.",
  },
  {
    icon: PenLine,
    title: "Compose inside Hust",
    body: "Reply or write new emails with a rich editor, then send from your jobs address. No more switching to your personal inbox.",
  },
  {
    icon: ShieldCheck,
    title: "Private by design",
    body: "We recommend a dedicated address, request the minimum access, and let you disconnect and wipe synced mail anytime.",
  },
];

export default function InboxPage() {
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <PageHeader icon={Inbox} title="Inbox" />
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <Card>
          <CardContent className="p-6 sm:p-8">
            <div className="flex flex-col items-start gap-3">
              <Badge variant="secondary">Coming soon</Badge>
              <h2 className="text-xl font-semibold">
                Handle every job email without leaving Hust
              </h2>
              <p className="max-w-2xl text-sm text-muted-foreground">
                The Inbox will let Hust send your applications and outreach, receive
                company replies, and help the AI correspond on your behalf — find →
                apply → <span className="font-medium">reply</span> → track, all in
                one place. We&apos;re building it now.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button size="sm" disabled>
                  Connect a mailbox
                </Button>
                <Button size="sm" variant="outline" disabled>
                  Create a Hust jobs address
                </Button>
              </div>
            </div>

            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              {FEATURES.map((f) => (
                <div key={f.title} className="flex gap-3 rounded-lg border p-4">
                  <f.icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-medium">{f.title}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{f.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
