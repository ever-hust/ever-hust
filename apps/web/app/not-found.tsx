import Link from "next/link";
import { Button } from "@ever-hust/ui/button";
import { BriefcaseBusiness, Home, MessageSquare, Search } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <div className="rounded-full bg-muted p-4">
        <BriefcaseBusiness className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
      </div>
      <h1 className="mt-6 text-5xl font-bold tracking-tight">404</h1>
      <p className="mt-2 text-lg font-medium text-foreground">
        Page not found
      </p>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">
        The page you&apos;re looking for doesn&apos;t exist or has been moved.
        Let&apos;s get you back on track.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button className="gap-2" asChild>
          <Link href="/">
            <Home className="h-4 w-4" aria-hidden="true" />
            Go Home
          </Link>
        </Button>
        <Button variant="outline" className="gap-2" asChild>
          <Link href="/chat">
            <MessageSquare className="h-4 w-4" aria-hidden="true" />
            Go to Chat
          </Link>
        </Button>
      </div>
      <div className="mt-12 rounded-lg border bg-card p-4 text-left shadow-sm">
        <p className="mb-2 text-xs font-medium text-muted-foreground">
          Looking for something specific?
        </p>
        <ul className="space-y-1.5 text-sm">
          <li>
            <Link href="/chat" className="inline-flex items-center gap-1.5 text-primary hover:underline">
              <Search className="h-3 w-3" aria-hidden="true" />
              Search for jobs
            </Link>
          </li>
          <li>
            <Link href="/favorites" className="inline-flex items-center gap-1.5 text-primary hover:underline">
              <BriefcaseBusiness className="h-3 w-3" aria-hidden="true" />
              View saved jobs
            </Link>
          </li>
          <li>
            <Link href="/pricing" className="inline-flex items-center gap-1.5 text-primary hover:underline">
              <BriefcaseBusiness className="h-3 w-3" aria-hidden="true" />
              Pricing plans
            </Link>
          </li>
        </ul>
      </div>
    </div>
  );
}
