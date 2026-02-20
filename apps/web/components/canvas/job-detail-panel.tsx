"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@repo/ui/dialog";
import { Button } from "@repo/ui/button";
import { Badge } from "@repo/ui/badge";
import { Skeleton } from "@repo/ui/skeleton";
import {
  ExternalLink,
  MapPin,
  Building2,
  Clock,
  Heart,
  DollarSign,
  FileText,
  Share2,
  Check,
} from "lucide-react";
import { cn } from "@repo/ui/lib/utils";
import Link from "next/link";
import { timeAgo, formatSalary, formatLocation } from "@/lib/format-date";
import { safeExternalUrl } from "@/lib/safe-url";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";

interface JobDetail {
  id: number;
  title: string;
  companyName: string | null;
  companyLogo: string | null;
  companyUrl: string | null;
  companyIndustry: string | null;
  companyNumEmployees: string | null;
  companyDescription: string | null;
  jobUrl: string | null;
  applyUrl: string | null;
  locationCity: string | null;
  locationState: string | null;
  locationCountry: string | null;
  isRemote: boolean | null;
  jobType: string[] | null;
  salaryMin: string | null;
  salaryMax: string | null;
  salaryCurrency: string | null;
  salaryInterval: string | null;
  description: string | null;
  skills: string[] | null;
  site: string;
  datePosted: string | null;
  jobLevel: string | null;
  department: string | null;
  team: string | null;
  employmentType: string | null;
  jobFunction: string | null;
}

interface JobDetailPanelProps {
  jobId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isFavorited?: boolean;
  onFavorite?: (jobId: number) => void;
}

type DetailTab = "overview" | "skills" | "company";

export function JobDetailPanel({
  jobId,
  open,
  onOpenChange,
  isFavorited = false,
  onFavorite,
}: JobDetailPanelProps) {
  const [job, setJob] = useState<JobDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<DetailTab>("overview");
  const tabPanelRef = useRef<HTMLDivElement>(null);

  // Reset scroll position when switching tabs
  useEffect(() => {
    tabPanelRef.current?.scrollTo({ top: 0 });
  }, [activeTab]);

  const { copied, copy } = useCopyToClipboard();

  const handleShare = useCallback(async () => {
    if (!job) return;
    const url = `${window.location.origin}/jobs/${job.id}`;
    try {
      // Try native share first (mobile)
      if (navigator.share) {
        await navigator.share({
          title: `${job.title} at ${job.companyName ?? ""}`,
          url,
        });
        return;
      }
      // Fallback: copy to clipboard
      await copy(url);
    } catch {
      // User cancelled share or clipboard failed
    }
  }, [job, copy]);

  useEffect(() => {
    // Don't clear job when dialog closes — it causes a blank flash during
    // the close animation.  Only fetch when a new jobId opens.
    if (!open || jobId === null) return;

    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setActiveTab("overview");

    fetch(`/api/jobs/${jobId}`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to load job details");
        const data = (await res.json()) as { job?: JobDetail };
        if (!data.job) throw new Error("Job not found");
        if (!controller.signal.aborted) setJob(data.job);
      })
      .catch((err) => {
        // Don't report abort errors — they're expected on cleanup
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : "Failed to load");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => {
      controller.abort();
    };
  }, [open, jobId]);

  const salary = job ? formatSalary(job.salaryMin, job.salaryMax, job.salaryCurrency, job.salaryInterval, "full") : null;
  const location = job ? formatLocation(job.locationCity, job.locationState, job.locationCountry) : null;
  const posted = job ? timeAgo(job.datePosted) : null;
  const safeLogo = job ? safeExternalUrl(job.companyLogo) : undefined;
  const applyLink = job ? safeExternalUrl(job.applyUrl) ?? safeExternalUrl(job.jobUrl) ?? null : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-hidden p-0">
        {loading ? (
          <div className="p-6 space-y-4">
            <div className="flex items-start gap-3">
              <Skeleton className="h-12 w-12 rounded-lg" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-6 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            </div>
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-4 w-3/5" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : error ? (
          <div className="p-6 text-center">
            <p className="text-sm text-destructive">{error}</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => onOpenChange(false)}
            >
              Close
            </Button>
          </div>
        ) : job ? (
          <>
            {/* Header */}
            <DialogHeader className="border-b px-6 py-4">
              <div className="flex items-start gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border bg-background">
                  {safeLogo ? (
                    <img
                      src={safeLogo}
                      alt={job.companyName ? `${job.companyName} logo` : "Company logo"}
                      className="h-8 w-8 rounded object-contain"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.display = "none";
                      }}
                    />
                  ) : (
                    <Building2 className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
                  )}
                </div>
                <div className="min-w-0 flex-1 pr-8">
                  <DialogTitle className="text-lg leading-tight">
                    {job.title}
                  </DialogTitle>
                  <DialogDescription className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                    {job.companyName && (
                      <span className="font-medium text-foreground">
                        {job.companyName}
                      </span>
                    )}
                    {location && (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-3 w-3" aria-hidden="true" />
                        {location}
                      </span>
                    )}
                    {posted && (
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" aria-hidden="true" />
                        {posted}
                      </span>
                    )}
                  </DialogDescription>
                </div>
              </div>

              {/* Badges */}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {job.isRemote && <Badge variant="default">Remote</Badge>}
                {job.jobType?.map((type, i) => (
                  <Badge key={`${type}-${i}`} variant="secondary">{type}</Badge>
                ))}
                {job.jobLevel && <Badge variant="secondary">{job.jobLevel}</Badge>}
                {salary && (
                  <Badge variant="outline" className="font-semibold">
                    <DollarSign className="mr-0.5 h-3 w-3" aria-hidden="true" />
                    {salary}
                  </Badge>
                )}
              </div>
            </DialogHeader>

            {/* Action buttons */}
            <div className="flex items-center gap-2 border-b px-6 py-3">
              {applyLink && (
                <Button size="sm" asChild>
                  <a
                    href={applyLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Apply for ${job.title} (opens in new tab)`}
                  >
                    Apply
                    <ExternalLink className="ml-1 h-3 w-3" aria-hidden="true" />
                  </a>
                </Button>
              )}
              <Button variant="outline" size="sm" asChild>
                <Link
                  href={`/chat?job=${job.id}`}
                  aria-label={`Generate cover letter for ${job.title}`}
                >
                  <FileText className="mr-1 h-3 w-3" aria-hidden="true" />
                  Cover Letter
                </Link>
              </Button>
              <div className="ml-auto flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  aria-label="Share job"
                  onClick={handleShare}
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-emerald-500" aria-hidden="true" />
                  ) : (
                    <Share2 className="h-4 w-4" aria-hidden="true" />
                  )}
                  <span className="sr-only" aria-live="polite">
                    {copied ? "Link copied to clipboard" : ""}
                  </span>
                </Button>
                {onFavorite && (
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    aria-label={isFavorited ? "Remove from favorites" : "Add to favorites"}
                    aria-pressed={isFavorited}
                    onClick={() => onFavorite(job.id)}
                  >
                    <Heart
                      className={cn(
                        "h-4 w-4",
                        isFavorited ? "fill-red-500 text-red-500" : ""
                      )}
                      aria-hidden="true"
                    />
                  </Button>
                )}
              </div>
              <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" asChild>
                <Link href={`/jobs/${job.id}`} aria-label={`View ${job.title} full page`}>
                  Full page
                  <ExternalLink className="ml-1 h-3 w-3" aria-hidden="true" />
                </Link>
              </Button>
            </div>

            {/* Tab navigation */}
            <div className="flex border-b px-6" role="tablist" aria-label="Job detail sections">
              {(
                [
                  { id: "overview" as DetailTab, label: "Overview" },
                  ...(job.skills && job.skills.length > 0
                    ? [{ id: "skills" as DetailTab, label: `Skills (${job.skills.length})` }]
                    : []),
                  ...(job.companyDescription || job.companyIndustry
                    ? [{ id: "company" as DetailTab, label: job.companyName ?? "Company" }]
                    : []),
                ] as { id: DetailTab; label: string }[]
              ).map((tab) => (
                <button
                  key={tab.id}
                  id={`job-detail-tab-${tab.id}`}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab.id}
                  aria-controls="job-detail-tabpanel"
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "border-b-2 px-3 py-2 text-xs font-medium transition-colors",
                    activeTab === tab.id
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div
              ref={tabPanelRef}
              id="job-detail-tabpanel"
              className="max-h-[50vh] overflow-y-auto px-6 py-4"
              role="tabpanel"
              aria-labelledby={`job-detail-tab-${activeTab}`}
            >
              {/* Overview tab */}
              {activeTab === "overview" && (
                <>
                  {/* Quick info grid */}
                  {(job.department || job.team || job.employmentType || job.jobFunction || job.salaryInterval) && (
                    <div className="mb-4 grid grid-cols-2 gap-3 rounded-lg border bg-muted/30 p-3">
                      {job.department && (
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Department</p>
                          <p className="text-xs font-medium">{job.department}</p>
                        </div>
                      )}
                      {job.team && (
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Team</p>
                          <p className="text-xs font-medium">{job.team}</p>
                        </div>
                      )}
                      {job.employmentType && (
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Employment</p>
                          <p className="text-xs font-medium capitalize">{job.employmentType}</p>
                        </div>
                      )}
                      {job.jobFunction && (
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Function</p>
                          <p className="text-xs font-medium">{job.jobFunction}</p>
                        </div>
                      )}
                      {salary && job.salaryInterval && (
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Pay Period</p>
                          <p className="text-xs font-medium capitalize">{job.salaryInterval}</p>
                        </div>
                      )}
                      {job.site && (
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Source</p>
                          <p className="text-xs font-medium capitalize">{job.site}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Description */}
                  {job.description ? (
                    <div className="prose prose-sm max-w-none text-sm leading-relaxed text-muted-foreground">
                      {job.description
                        .split(/\n{2,}/)
                        .filter(Boolean)
                        .map((para, i) => (
                          <p key={i} className="mb-3 whitespace-pre-wrap">
                            {para.trim()}
                          </p>
                        ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">
                      No description available for this position.
                    </p>
                  )}
                </>
              )}

              {/* Skills tab */}
              {activeTab === "skills" && job.skills && job.skills.length > 0 && (
                <div>
                  <p className="mb-3 text-xs text-muted-foreground">
                    This position requires or prefers the following skills and technologies:
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {job.skills.map((skill, i) => (
                      <Badge key={`${skill}-${i}`} variant="secondary" className="px-3 py-1 text-xs">
                        {skill}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Company tab */}
              {activeTab === "company" && (
                <div className="space-y-4">
                  {/* Company stats grid */}
                  <div className="grid grid-cols-2 gap-3">
                    {job.companyIndustry && (
                      <div className="rounded-lg border p-3">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Industry</p>
                        <p className="mt-0.5 text-sm font-medium">{job.companyIndustry}</p>
                      </div>
                    )}
                    {job.companyNumEmployees && (
                      <div className="rounded-lg border p-3">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Company Size</p>
                        <p className="mt-0.5 text-sm font-medium">{job.companyNumEmployees} employees</p>
                      </div>
                    )}
                    {safeExternalUrl(job.companyUrl) && (
                      <div className="rounded-lg border p-3 col-span-2">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Website</p>
                        <a
                          href={safeExternalUrl(job.companyUrl)!}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-0.5 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                        >
                          {safeExternalUrl(job.companyUrl)!.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                          <ExternalLink className="h-3 w-3" aria-hidden="true" />
                        </a>
                      </div>
                    )}
                  </div>

                  {/* Company description */}
                  {job.companyDescription && (
                    <div>
                      <h4 className="mb-2 text-sm font-semibold">
                        About {job.companyName}
                      </h4>
                      <p className="text-sm leading-relaxed text-muted-foreground">
                        {job.companyDescription}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
