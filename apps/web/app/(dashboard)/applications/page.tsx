"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import {
  ClipboardList,
  Building2,
  MapPin,
  Clock,
  FileText,
  ExternalLink,
  Loader2,
  Filter,
} from "lucide-react";
import { Button } from "@repo/ui/button";
import { Badge } from "@repo/ui/badge";
import { Skeleton } from "@repo/ui/skeleton";
import { cn } from "@repo/ui/lib/utils";
import { ScrollToTop } from "@/components/shared/scroll-to-top";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { PageHeader } from "@/components/shared/page-header";
import { timeAgo, formatDate } from "@/lib/format-date";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Application {
  id: number;
  jobId: number;
  status: "pending" | "in_progress" | "submitted" | "failed";
  coverLetter: string | null;
  createdAt: string;
  updatedAt: string;
  jobTitle: string;
  companyName: string | null;
  companyLogo: string | null;
  locationCity: string | null;
  locationState: string | null;
  isRemote: boolean | null;
}

type StatusFilter = "all" | "pending" | "in_progress" | "submitted" | "failed";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<
  Application["status"],
  { label: string; variant: "default" | "secondary" | "outline" | "destructive"; className?: string }
> = {
  pending: { label: "Pending", variant: "secondary" },
  in_progress: { label: "In Progress", variant: "default", className: "bg-blue-500 hover:bg-blue-600" },
  submitted: { label: "Submitted", variant: "default", className: "bg-emerald-500 hover:bg-emerald-600" },
  failed: { label: "Failed", variant: "destructive" },
};

function formatLocation(
  city: string | null,
  state: string | null,
  isRemote: boolean | null
) {
  const parts = [city, state].filter(Boolean);
  const loc = parts.join(", ");
  if (isRemote) return loc ? `${loc} (Remote)` : "Remote";
  return loc || null;
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function ApplicationSkeleton() {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-start gap-3">
        <Skeleton className="h-10 w-10 shrink-0 rounded-md" />
        <div className="min-w-0 flex-1">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="mt-1.5 h-3 w-1/3" />
          <div className="mt-3 flex items-center gap-2">
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-3 w-20" />
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Application card
// ---------------------------------------------------------------------------

function ApplicationCard({ app }: { app: Application }) {
  const statusConfig = STATUS_CONFIG[app.status];
  const location = formatLocation(app.locationCity, app.locationState, app.isRemote);

  return (
    <article
      aria-label={`Application for ${app.jobTitle} at ${app.companyName ?? "Unknown"}`}
      className="group rounded-lg border bg-card p-4 transition-colors hover:bg-accent/50"
    >
      <div className="flex items-start gap-3">
        {/* Company logo */}
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border bg-background">
          {app.companyLogo ? (
            <img
              src={app.companyLogo}
              alt={app.companyName ?? ""}
              className="h-8 w-8 rounded object-contain"
            />
          ) : (
            <Building2 className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
          )}
        </div>

        {/* Info */}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <Link
                href={`/jobs/${app.jobId}`}
                className="truncate text-sm font-semibold leading-tight hover:underline"
              >
                {app.jobTitle}
              </Link>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {app.companyName ?? "Unknown Company"}
              </p>
            </div>
            <Badge
              variant={statusConfig.variant}
              className={cn("shrink-0 text-[10px]", statusConfig.className)}
            >
              {statusConfig.label}
            </Badge>
          </div>

          {/* Location + date */}
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {location && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3 w-3" aria-hidden="true" />
                {location}
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" aria-hidden="true" />
              Applied {timeAgo(app.createdAt) ?? "recently"}
            </span>
          </div>

          {/* Actions */}
          <div className="mt-3 flex items-center gap-2">
            {app.coverLetter && (
              <Link href={`/chat?job=${app.jobId}`}>
                <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs">
                  <FileText className="h-3 w-3" aria-hidden="true" />
                  View Cover Letter
                </Button>
              </Link>
            )}
            <Link href={`/jobs/${app.jobId}`}>
              <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs text-muted-foreground">
                <ExternalLink className="h-3 w-3" aria-hidden="true" />
                Job Details
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const FILTER_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "in_progress", label: "In Progress" },
  { value: "submitted", label: "Submitted" },
  { value: "failed", label: "Failed" },
];

export default function ApplicationsPage() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [applications, setApplications] = useState<Application[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const fetchApplications = useCallback(async (signal?: AbortSignal) => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      params.set("limit", "100");

      const res = await fetch(`/api/user/applications?${params.toString()}`, { signal });
      if (!res.ok) {
        if (res.status === 401) {
          setError("Please sign in to view your applications.");
          return;
        }
        throw new Error("Failed to load applications");
      }
      if (signal?.aborted) return;
      const data = (await res.json()) as { applications: Application[] };
      setApplications(data.applications);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      if (!signal?.aborted) setIsLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    const controller = new AbortController();
    fetchApplications(controller.signal);
    return () => { controller.abort(); };
  }, [fetchApplications]);

  // Stats summary
  const stats = useMemo(() => {
    const counts = { pending: 0, in_progress: 0, submitted: 0, failed: 0 };
    for (const app of applications) {
      counts[app.status]++;
    }
    return counts;
  }, [applications]);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Header */}
      <div className="border-b px-4 py-4 sm:px-6">
        <PageHeader
          icon={ClipboardList}
          title="Applications"
          description="Track your job applications and their progress"
          count={!isLoading && applications.length > 0 ? applications.length : undefined}
          iconClassName="text-primary"
          className="border-b-0 px-0 py-0"
        />

        {/* Stats row */}
        {!isLoading && applications.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-3">
            <div className="rounded-md border px-3 py-1.5 text-center">
              <p className="text-lg font-semibold">{applications.length}</p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total</p>
            </div>
            <div className="rounded-md border px-3 py-1.5 text-center">
              <p className="text-lg font-semibold text-emerald-500">{stats.submitted}</p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Submitted</p>
            </div>
            <div className="rounded-md border px-3 py-1.5 text-center">
              <p className="text-lg font-semibold text-blue-500">{stats.in_progress}</p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">In Progress</p>
            </div>
            <div className="rounded-md border px-3 py-1.5 text-center">
              <p className="text-lg font-semibold text-muted-foreground">{stats.pending}</p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Pending</p>
            </div>
          </div>
        )}

        {/* Filter tabs */}
        <div className="mt-4 flex items-center gap-1" role="tablist" aria-label="Filter by status">
          <Filter className="mr-1 h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
          {FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              role="tab"
              aria-selected={statusFilter === opt.value}
              onClick={() => setStatusFilter(opt.value)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                statusFilter === opt.value
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 sm:p-6">
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }, (_, i) => (
              <ApplicationSkeleton key={i} />
            ))}
          </div>
        ) : error ? (
          <ErrorState message={error} onRetry={fetchApplications} />
        ) : applications.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title="No applications yet"
            description={
              statusFilter !== "all"
                ? `No ${statusFilter.replace("_", " ")} applications found. Try a different filter.`
                : "Start by searching for jobs in the chat and applying to positions you like."
            }
          >
            <Link href="/chat">
              <Button size="sm">Go to Chat</Button>
            </Link>
          </EmptyState>
        ) : (
          <div className="space-y-3">
            {applications.map((app) => (
              <ApplicationCard key={app.id} app={app} />
            ))}
          </div>
        )}
      </div>

      <ScrollToTop containerRef={scrollRef} />
    </div>
  );
}
