"use client";

import { memo, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@repo/ui/dialog";
import { Button } from "@repo/ui/button";
import { Badge } from "@repo/ui/badge";
import { ExternalLink, MapPin, Building2, Clock, DollarSign } from "lucide-react";
import { cn } from "@repo/ui/lib/utils";
import { formatSalary, formatLocation, timeAgo } from "@/lib/format-date";
import { safeExternalUrl } from "@/lib/safe-url";
import type { JobCardData } from "./job-card";

interface JobCompareDialogProps {
  jobs: JobCardData[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Attribute row label type for the comparison grid. */
type AttributeRow = {
  label: string;
  render: (job: JobCardData, index: number) => React.ReactNode;
  /** When true, highlight cells where values differ across jobs. */
  highlightDiff?: boolean;
};

/**
 * Check whether all non-null string values in an array are identical.
 * Returns `true` when at least two values exist and they differ.
 */
function valuesDiffer(values: (string | null | undefined)[]): boolean {
  const nonNull = values.filter(Boolean) as string[];
  if (nonNull.length < 2) return false;
  return new Set(nonNull).size > 1;
}

export const JobCompareDialog = memo(function JobCompareDialog({
  jobs,
  open,
  onOpenChange,
}: JobCompareDialogProps) {
  const columns = jobs.length;

  /** Pre-compute formatted values for each job. */
  const formatted = useMemo(
    () =>
      jobs.map((job) => ({
        salary: formatSalary(
          job.salaryMin,
          job.salaryMax,
          job.salaryCurrency,
          job.salaryInterval
        ),
        location:
          formatLocation(
            job.locationCity,
            job.locationState,
            job.locationCountry,
            job.isRemote
          ) ?? "Unknown",
        posted: timeAgo(job.datePosted),
        applyLink:
          safeExternalUrl(job.applyUrl) ?? safeExternalUrl(job.jobUrl) ?? null,
        safeLogo: safeExternalUrl(job.companyLogo),
      })),
    [jobs]
  );

  /** Definition of every comparison row. */
  const rows: AttributeRow[] = useMemo(
    () => [
      {
        label: "Company",
        render: (job) => (
          <span className="font-medium">
            {job.companyName ?? "Unknown Company"}
          </span>
        ),
      },
      {
        label: "Location",
        render: (_job, i) => (
          <span className="inline-flex items-center gap-1 text-xs">
            <MapPin className="h-3 w-3 shrink-0" aria-hidden="true" />
            {formatted[i]?.location}
          </span>
        ),
        highlightDiff: true,
      },
      {
        label: "Salary",
        render: (_job, i) =>
          formatted[i]?.salary ? (
            <span className="inline-flex items-center gap-1 text-xs font-medium">
              <DollarSign className="h-3 w-3 shrink-0" aria-hidden="true" />
              {formatted[i]?.salary}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground italic">
              Not listed
            </span>
          ),
        highlightDiff: true,
      },
      {
        label: "Job Type",
        render: (job) =>
          job.jobType && job.jobType.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {job.jobType.map((type) => (
                <Badge
                  key={type}
                  variant="outline"
                  className="text-[10px] px-1.5 py-0"
                >
                  {type}
                </Badge>
              ))}
            </div>
          ) : (
            <span className="text-xs text-muted-foreground italic">--</span>
          ),
      },
      {
        label: "Remote",
        render: (job) =>
          job.isRemote ? (
            <Badge variant="default" className="text-[10px] px-1.5 py-0">
              Remote
            </Badge>
          ) : (
            <span className="text-xs text-muted-foreground">On-site</span>
          ),
        highlightDiff: true,
      },
      {
        label: "Level",
        render: (job) =>
          job.jobLevel ? (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
              {job.jobLevel}
            </Badge>
          ) : (
            <span className="text-xs text-muted-foreground italic">--</span>
          ),
        highlightDiff: true,
      },
      {
        label: "Skills",
        render: (job) =>
          job.skills && job.skills.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {job.skills.slice(0, 6).map((skill) => (
                <Badge
                  key={skill}
                  variant="secondary"
                  className="text-[10px] px-1.5 py-0"
                >
                  {skill}
                </Badge>
              ))}
              {job.skills.length > 6 && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                  +{job.skills.length - 6}
                </Badge>
              )}
            </div>
          ) : (
            <span className="text-xs text-muted-foreground italic">--</span>
          ),
      },
      {
        label: "Posted",
        render: (_job, i) =>
          formatted[i]?.posted ? (
            <span className="inline-flex items-center gap-1 text-xs">
              <Clock className="h-3 w-3 shrink-0" aria-hidden="true" />
              {formatted[i]?.posted}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground italic">--</span>
          ),
      },
      {
        label: "Source",
        render: (job) => (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 capitalize">
            {job.site}
          </Badge>
        ),
      },
    ],
    [formatted]
  );

  /**
   * For rows with `highlightDiff`, compute a simple string value per job
   * to detect differences. This is intentionally approximate — the visual
   * highlight is a subtle hint, not a guarantee of semantic difference.
   */
  const diffMap = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const row of rows) {
      if (!row.highlightDiff) continue;
      const values = jobs.map((job) => {
        switch (row.label) {
          case "Location":
            return (
              formatLocation(
                job.locationCity,
                job.locationState,
                job.locationCountry,
                job.isRemote
              ) ?? ""
            );
          case "Salary":
            return (
              formatSalary(
                job.salaryMin,
                job.salaryMax,
                job.salaryCurrency,
                job.salaryInterval
              ) ?? ""
            );
          case "Remote":
            return job.isRemote ? "remote" : "on-site";
          case "Level":
            return job.jobLevel ?? "";
          default:
            return "";
        }
      });
      map.set(row.label, valuesDiffer(values));
    }
    return map;
  }, [rows, jobs]);

  const renderCell = (row: AttributeRow, job: JobCardData, index: number) => {
    return row.render(job, index);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "max-h-[90vh] overflow-hidden p-0",
          columns === 3 ? "max-w-4xl" : "max-w-2xl"
        )}
      >
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle>Compare Jobs</DialogTitle>
          <DialogDescription>
            Side-by-side comparison of {columns} selected jobs
          </DialogDescription>
        </DialogHeader>

        {/* Scrollable comparison grid */}
        <div className="max-h-[70vh] overflow-auto">
          {/* Job headers — title + company logo per column */}
          <div
            className={cn(
              "grid border-b",
              columns === 3 ? "grid-cols-[140px_1fr_1fr_1fr]" : "grid-cols-[140px_1fr_1fr]"
            )}
          >
            {/* Empty cell for the label column */}
            <div className="border-r bg-muted/30 px-4 py-3" />

            {jobs.map((job, i) => {
              const logo = formatted[i]?.safeLogo;
              return (
                <div
                  key={job.id}
                  className={cn(
                    "px-4 py-3",
                    i < columns - 1 && "border-r"
                  )}
                >
                  <div className="flex items-start gap-2">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border bg-background">
                      {logo ? (
                        <img
                          src={logo}
                          alt={
                            job.companyName
                              ? `${job.companyName} logo`
                              : "Company logo"
                          }
                          className="h-6 w-6 rounded object-contain"
                          loading="lazy"
                          decoding="async"
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).style.display =
                              "none";
                          }}
                        />
                      ) : (
                        <Building2
                          className="h-4 w-4 text-muted-foreground"
                          aria-hidden="true"
                        />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-sm font-semibold leading-tight">
                        {job.title}
                      </h3>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {job.companyName ?? "Unknown Company"}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Attribute rows */}
          {rows.map((row) => {
            const hasDiff = diffMap.get(row.label) ?? false;
            return (
              <div
                key={row.label}
                className={cn(
                  "grid border-b last:border-b-0",
                  columns === 3
                    ? "grid-cols-[140px_1fr_1fr_1fr]"
                    : "grid-cols-[140px_1fr_1fr]"
                )}
              >
                {/* Row label */}
                <div className="flex items-center border-r bg-muted/30 px-4 py-2.5">
                  <span className="text-xs font-medium text-muted-foreground">
                    {row.label}
                  </span>
                </div>

                {/* Value cells */}
                {jobs.map((job, i) => (
                  <div
                    key={job.id}
                    className={cn(
                      "flex items-center px-4 py-2.5",
                      i < columns - 1 && "border-r",
                      hasDiff && "bg-amber-50/50 dark:bg-amber-950/10"
                    )}
                  >
                    {renderCell(row, job, i)}
                  </div>
                ))}
              </div>
            );
          })}

          {/* Action buttons row */}
          <div
            className={cn(
              "grid border-t",
              columns === 3
                ? "grid-cols-[140px_1fr_1fr_1fr]"
                : "grid-cols-[140px_1fr_1fr]"
            )}
          >
            {/* Label */}
            <div className="flex items-center border-r bg-muted/30 px-4 py-3">
              <span className="text-xs font-medium text-muted-foreground">
                Actions
              </span>
            </div>

            {jobs.map((job, i) => {
              const applyLink = formatted[i]?.applyLink;
              return (
                <div
                  key={job.id}
                  className={cn(
                    "flex flex-wrap items-center gap-2 px-4 py-3",
                    i < columns - 1 && "border-r"
                  )}
                >
                  {applyLink && (
                    <Button size="sm" className="h-7 text-xs" asChild>
                      <a
                        href={applyLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`Apply for ${job.title} (opens in new tab)`}
                      >
                        Apply
                        <ExternalLink
                          className="ml-1 h-3 w-3"
                          aria-hidden="true"
                        />
                      </a>
                    </Button>
                  )}
                  {safeExternalUrl(job.jobUrl) && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      asChild
                    >
                      <a
                        href={safeExternalUrl(job.jobUrl)!}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`View ${job.title} details (opens in new tab)`}
                      >
                        View Details
                        <ExternalLink
                          className="ml-1 h-3 w-3"
                          aria-hidden="true"
                        />
                      </a>
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
});
