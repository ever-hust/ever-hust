"use client";

import { useState, useCallback, useRef, useEffect, memo } from "react";
import { Heart, ExternalLink, MapPin, Building2, Clock, FileText, Share2, Check } from "lucide-react";
import { Badge } from "@repo/ui/badge";
import { Button } from "@repo/ui/button";
import { cn } from "@repo/ui/lib/utils";
import Link from "next/link";
import { formatSalary, formatLocation, timeAgo } from "@/lib/format-date";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { safeExternalUrl } from "@/lib/safe-url";

export interface JobCardData {
  id: number;
  externalId: string;
  title: string;
  companyName: string | null;
  companyLogo: string | null;
  companyUrl: string | null;
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
  datePosted: string | Date | null;
  jobLevel: string | null;
  companyIndustry: string | null;
}

interface JobCardProps {
  job: JobCardData;
  isFavorited?: boolean;
  isCompareMode?: boolean;
  isSelected?: boolean;
  onFavorite?: (jobId: number) => void;
  onViewDetails?: (jobId: number) => void;
  onToggleCompare?: (jobId: number) => void;
}

/** Duration of the favorite-button bounce animation (ms). */
const FAVORITE_ANIMATION_MS = 300;

export const JobCard = memo(function JobCard({
  job,
  isFavorited = false,
  isCompareMode = false,
  isSelected = false,
  onFavorite,
  onViewDetails,
  onToggleCompare,
}: JobCardProps) {
  const [animating, setAnimating] = useState(false);
  const animTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clean up animation timer on unmount
  useEffect(() => {
    return () => {
      if (animTimerRef.current) clearTimeout(animTimerRef.current);
    };
  }, []);

  const salary = formatSalary(
    job.salaryMin,
    job.salaryMax,
    job.salaryCurrency,
    job.salaryInterval
  );
  const location = formatLocation(
    job.locationCity,
    job.locationState,
    job.locationCountry,
    job.isRemote
  ) ?? "Unknown";
  const posted = timeAgo(job.datePosted);
  const safeLogo = safeExternalUrl(job.companyLogo);
  const applyLink = safeExternalUrl(job.applyUrl) ?? safeExternalUrl(job.jobUrl) ?? null;

  const handleFavorite = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!onFavorite) return;
      setAnimating(true);
      onFavorite(job.id);
      // Reset animation after bounce — track timer for cleanup
      if (animTimerRef.current) clearTimeout(animTimerRef.current);
      animTimerRef.current = setTimeout(() => setAnimating(false), FAVORITE_ANIMATION_MS);
    },
    [onFavorite, job.id]
  );

  const handleCompareToggle = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onToggleCompare?.(job.id);
    },
    [onToggleCompare, job.id]
  );

  const { copied, copy } = useCopyToClipboard();

  const handleShare = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      const url = `${window.location.origin}/jobs/${job.id}`;
      try {
        if (navigator.share) {
          await navigator.share({
            title: `${job.title} at ${job.companyName ?? ""}`,
            url,
          });
          return;
        }
        await copy(url);
      } catch {
        // User cancelled share or clipboard failed
      }
    },
    [job.id, job.title, job.companyName, copy]
  );

  return (
    <article
      aria-label={`${job.title} at ${job.companyName ?? "Unknown Company"}`}
      className={cn(
        "group rounded-lg border bg-card p-4 transition-all hover:bg-accent/50 hover:shadow-sm",
        isCompareMode && "cursor-pointer",
        isCompareMode && "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        isSelected && "ring-2 ring-primary"
      )}
      onClick={isCompareMode ? handleCompareToggle : undefined}
      onKeyDown={
        isCompareMode
          ? (e: React.KeyboardEvent) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onToggleCompare?.(job.id);
              }
            }
          : undefined
      }
      tabIndex={isCompareMode ? 0 : undefined}
      role={isCompareMode ? "button" : undefined}
    >
      <div className="flex items-start gap-3">
        {/* Compare mode selection indicator */}
        {isCompareMode && (
          <button
            type="button"
            onClick={handleCompareToggle}
            className={cn(
              "flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors",
              isSelected
                ? "border-primary bg-primary text-primary-foreground"
                : "border-muted-foreground/30 bg-background hover:border-primary"
            )}
            aria-label={isSelected ? `Deselect ${job.title} from comparison` : `Select ${job.title} for comparison`}
            aria-pressed={isSelected}
          >
            {isSelected && <Check className="h-3 w-3" aria-hidden="true" />}
          </button>
        )}

        {/* Company logo — clicking it opens details */}
        <button
          type="button"
          onClick={() => onViewDetails?.(job.id)}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border bg-background transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`View ${job.title} details`}
        >
          {safeLogo ? (
            <img
              src={safeLogo}
              alt={job.companyName ? `${job.companyName} logo` : "Company logo"}
              className="h-8 w-8 rounded object-contain"
              loading="lazy"
              decoding="async"
              onError={(e) => {
                // Hide broken image and show nothing (fallback icon is in the else branch)
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
          ) : (
            <Building2 className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
          )}
        </button>

        {/* Job info */}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="truncate text-sm font-semibold leading-tight">
                <button
                  type="button"
                  className="text-left hover:underline focus-visible:outline-none focus-visible:underline"
                  onClick={() => onViewDetails?.(job.id)}
                >
                  {job.title}
                </button>
              </h3>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {job.companyName ?? "Unknown Company"}
                {job.companyIndustry && (
                  <span className="text-muted-foreground/60">
                    {" "}
                    &middot; {job.companyIndustry}
                  </span>
                )}
              </p>
            </div>

            {/* Favorite button with animation */}
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "h-7 w-7 shrink-0 transition-transform",
                animating && "scale-125"
              )}
              aria-label={isFavorited ? `Remove ${job.title} from favorites` : `Add ${job.title} to favorites`}
              aria-pressed={isFavorited}
              onClick={handleFavorite}
            >
              <Heart
                className={cn(
                  "h-4 w-4 transition-colors duration-200",
                  isFavorited
                    ? "fill-red-500 text-red-500"
                    : "text-muted-foreground hover:text-red-400"
                )}
              />
            </Button>
          </div>

          {/* Location and salary */}
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3 w-3" aria-hidden="true" />
              {location}
            </span>
            {salary && (
              <span className="font-medium text-foreground">{salary}</span>
            )}
            {posted && (
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3" aria-hidden="true" />
                {posted}
              </span>
            )}
            {job.jobLevel && (
              <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
                {job.jobLevel}
              </Badge>
            )}
          </div>

          {/* Skills */}
          {job.skills && job.skills.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {job.skills.slice(0, 5).map((skill) => (
                <Badge key={skill} variant="secondary" className="text-[10px] px-1.5 py-0">
                  {skill}
                </Badge>
              ))}
              {job.skills.length > 5 && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                  +{job.skills.length - 5}
                </Badge>
              )}
            </div>
          )}

          {/* Description preview */}
          {job.description && (
            <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
              {job.description.replace(/[#*_`]/g, "")}
            </p>
          )}

          {/* Tags and actions */}
          <div className="mt-3 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              {job.isRemote && (
                <Badge variant="default" className="text-[10px] px-1.5 py-0">
                  Remote
                </Badge>
              )}
              {job.jobType?.map((type) => (
                <Badge key={type} variant="outline" className="text-[10px] px-1.5 py-0">
                  {type}
                </Badge>
              ))}
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 capitalize">
                {job.site}
              </Badge>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2">
              <Link
                href={`/chat?job=${job.id}`}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:underline"
                onClick={(e) => e.stopPropagation()}
                aria-label={`Generate cover letter for ${job.title}`}
              >
                <FileText className="h-3 w-3" aria-hidden="true" />
                <span className="hidden sm:inline">Cover Letter</span>
              </Link>
              <button
                type="button"
                className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:underline"
                onClick={handleShare}
                aria-label={copied ? "Link copied" : `Share ${job.title}`}
              >
                {copied ? (
                  <Check className="h-3 w-3 text-green-500" aria-hidden="true" />
                ) : (
                  <Share2 className="h-3 w-3" aria-hidden="true" />
                )}
                <span className="hidden sm:inline">{copied ? "Copied!" : "Share"}</span>
              </button>
              {applyLink && (
                <a
                  href={applyLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:underline"
                  onClick={(e) => e.stopPropagation()}
                  aria-label={`Apply for ${job.title} (opens in new tab)`}
                >
                  Apply
                  <ExternalLink className="h-3 w-3" aria-hidden="true" />
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    </article>
  );
});
