import Link from "next/link";
import { Button } from "@repo/ui/button";
import { SearchX, MessageSquare, Briefcase, ArrowLeft } from "lucide-react";

export default function DashboardNotFound() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 text-center">
      <div className="rounded-full bg-muted p-4">
        <SearchX className="h-10 w-10 text-muted-foreground" />
      </div>
      <h1 className="mt-6 text-3xl font-bold">Page Not Found</h1>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        The page you&apos;re looking for doesn&apos;t exist or may have been moved.
        Try navigating back or use one of the shortcuts below.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Link href="/chat">
          <Button className="gap-2">
            <MessageSquare className="h-4 w-4" />
            Go to Chat
          </Button>
        </Link>
        <Link href="/jobs">
          <Button variant="outline" className="gap-2">
            <Briefcase className="h-4 w-4" />
            Browse Jobs
          </Button>
        </Link>
      </div>
      <Link
        href="/chat"
        className="mt-4 inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3 w-3" />
        Back to Dashboard
      </Link>
    </div>
  );
}
