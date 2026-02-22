import Link from "next/link";
import { Button } from "@ever-hust/ui/button";
import { Briefcase, ArrowLeft, MessageSquare } from "lucide-react";

export default function JobNotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center p-6 text-center">
      <div className="rounded-full bg-muted p-4">
        <Briefcase className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
      </div>
      <h1 className="mt-6 text-2xl font-bold">Job Not Found</h1>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        This job listing doesn&apos;t exist or may have been removed. It&apos;s
        possible the position has been filled or the listing has expired.
      </p>
      <div className="mt-6 flex items-center gap-3">
        <Button variant="outline" className="gap-2" asChild>
          <Link href="/jobs">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to Jobs
          </Link>
        </Button>
        <Button className="gap-2" asChild>
          <Link href="/dashboard">
            <MessageSquare className="h-4 w-4" aria-hidden="true" />
            Search with AI
          </Link>
        </Button>
      </div>
    </div>
  );
}
