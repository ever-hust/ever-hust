"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  Heart,
  MapPin,
  Building2,
  DollarSign,
  ExternalLink,
  FileText,
  Trash2,
  Loader2,
  Briefcase,
  Clock,
} from "lucide-react";
import { Badge } from "@repo/ui/badge";
import { Button } from "@repo/ui/button";
import { Skeleton } from "@repo/ui/skeleton";
import { cn } from "@repo/ui/lib/utils";
import { toast } from "sonner";
import Link from "next/link";
import { ScrollToTop } from "@/components/shared/scroll-to-top";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { PageHeader } from "@/components/shared/page-header";
import { timeAgo, formatSalary, formatLocation } from "@/lib/format-date";
import { safeExternalUrl } from "@/lib/safe-url";

interface FavoriteJob {
  id: number;
  title: string;
  companyName: string | null;
  companyLogo: string | null;
  companyIndustry: string | null;
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
  skills: string[] | null;
  datePosted: string | null;
  jobLevel: string | null;
  savedAt: string;
  notes: string | null;
}

function FavoriteJobSkeleton() {
  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-start gap-3">
        <Skeleton className="h-10 w-10 rounded-lg" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <div className="flex gap-2">
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-5 w-20 rounded-full" />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function FavoritesPage() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [favorites, setFavorites] = useState<FavoriteJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<number | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  const reloadPage = useCallback(() => {
    setRetryKey((k) => k + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    async function loadFavorites() {
      try {
        const res = await fetch("/api/user/favorites/list", { signal: controller.signal });
        if (!res.ok) throw new Error("Failed to load favorites");
        if (controller.signal.aborted) return;
        const data = (await res.json()) as { favorites: FavoriteJob[] };
        setFavorites(data.favorites);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    loadFavorites();
    return () => { controller.abort(); };
  }, [retryKey]);

  const handleRemoveFavorite = useCallback(async (jobId: number) => {
    setRemovingId(jobId);
    try {
      const res = await fetch("/api/user/favorites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId }),
      });
      if (res.ok) {
        const data = (await res.json()) as { favorited: boolean };
        if (!data.favorited) {
          setFavorites((prev) => prev.filter((f) => f.id !== jobId));
          toast.success("Removed from favorites");
        } else {
          // Toggle re-added it unexpectedly — keep UI in sync
          toast.info("Favorite status updated");
        }
      } else {
        toast.error("Failed to remove favorite");
      }
    } catch {
      toast.error("Failed to remove favorite");
    } finally {
      setRemovingId(null);
    }
  }, []);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <PageHeader
        icon={Heart}
        title="Favorites"
        description="Jobs you've saved for later. Click the heart icon on any job to add it here."
        count={!loading ? favorites.length : undefined}
        iconClassName="text-red-500"
      />

      {/* Content */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 sm:p-6">
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }, (_, i) => (
              <FavoriteJobSkeleton key={i} />
            ))}
          </div>
        ) : error ? (
          <ErrorState
            message={error}
            onRetry={reloadPage}
          />
        ) : favorites.length === 0 ? (
          <EmptyState
            icon={Heart}
            title="No favorites yet"
            description="Browse jobs and click the heart icon to save them here for easy access later."
          >
            <Button size="sm" className="gap-1.5" asChild>
              <Link href="/chat">
                <Briefcase className="h-3.5 w-3.5" aria-hidden="true" />
                Search Jobs
              </Link>
            </Button>
          </EmptyState>
        ) : (
          <ul className="space-y-3" role="list" aria-label="Favorited jobs">
            {favorites.map((job) => {
              const location = formatLocation(
                job.locationCity,
                job.locationState,
                job.locationCountry
              );
              const salary = formatSalary(job.salaryMin, job.salaryMax, job.salaryCurrency);
              const posted = timeAgo(job.datePosted);
              const saved = timeAgo(job.savedAt);
              const safeLogo = safeExternalUrl(job.companyLogo);
              const applyLink = safeExternalUrl(job.applyUrl) ?? safeExternalUrl(job.jobUrl) ?? null;
              const isRemoving = removingId === job.id;

              return (
                <li
                  key={job.id}
                  className={cn(
                    "group rounded-lg border p-4 transition-colors hover:bg-accent/30",
                    isRemoving && "opacity-50"
                  )}
                >
                  <article aria-label={`${job.title} at ${job.companyName ?? "Unknown Company"}`}>
                  <div className="flex items-start gap-3">
                    {/* Company logo */}
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border bg-background">
                      {safeLogo ? (
                        <img
                          src={safeLogo}
                          alt={job.companyName ? `${job.companyName} logo` : "Company logo"}
                          className="h-7 w-7 rounded object-contain"
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).style.display = "none";
                          }}
                        />
                      ) : (
                        <Building2 className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                      )}
                    </div>

                    {/* Job details */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <Link
                            href={`/jobs/${job.id}`}
                            className="text-sm font-semibold hover:underline"
                          >
                            {job.title}
                          </Link>
                          {job.companyName && (
                            <p className="text-xs text-muted-foreground">
                              {job.companyName}
                              {job.companyIndustry && (
                                <span className="ml-1 text-muted-foreground/60">
                                  · {job.companyIndustry}
                                </span>
                              )}
                            </p>
                          )}
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center gap-1 shrink-0">
                          {applyLink && (
                            <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" asChild>
                              <a
                                href={applyLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                aria-label={`Apply for ${job.title} (opens in new tab)`}
                              >
                                Apply
                                <ExternalLink className="h-3 w-3" aria-hidden="true" />
                              </a>
                            </Button>
                          )}
                          <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" asChild>
                            <Link
                              href={`/chat?job=${job.id}`}
                              aria-label={`Generate cover letter for ${job.title}`}
                            >
                              <FileText className="h-3 w-3" aria-hidden="true" />
                              Cover Letter
                            </Link>
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            aria-label="Remove from favorites"
                            onClick={() => handleRemoveFavorite(job.id)}
                            disabled={isRemoving}
                          >
                            {isRemoving ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                            ) : (
                              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                            )}
                          </Button>
                        </div>
                      </div>

                      {/* Meta info row */}
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        {location && (
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="h-3 w-3" aria-hidden="true" />
                            {location}
                          </span>
                        )}
                        {job.isRemote && (
                          <Badge variant="default" className="h-4 px-1.5 text-[10px]">
                            Remote
                          </Badge>
                        )}
                        {salary && (
                          <span className="inline-flex items-center gap-1 font-medium text-foreground">
                            <DollarSign className="h-3 w-3" aria-hidden="true" />
                            {salary}
                          </span>
                        )}
                        {posted && (
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-3 w-3" aria-hidden="true" />
                            Posted {posted}
                          </span>
                        )}
                        {saved && (
                          <span className="inline-flex items-center gap-1">
                            <Heart className="h-3 w-3" aria-hidden="true" />
                            Saved {saved}
                          </span>
                        )}
                      </div>

                      {/* Badges row */}
                      <div className="mt-2 flex flex-wrap gap-1">
                        {job.jobLevel && (
                          <Badge variant="secondary" className="text-[10px]">
                            {job.jobLevel}
                          </Badge>
                        )}
                        {job.jobType?.map((type, i) => (
                          <Badge key={`type-${i}`} variant="secondary" className="text-[10px]">
                            {type}
                          </Badge>
                        ))}
                        {job.skills?.slice(0, 5).map((skill, i) => (
                          <Badge key={`skill-${i}`} variant="outline" className="text-[10px]">
                            {skill}
                          </Badge>
                        ))}
                        {job.skills && job.skills.length > 5 && (
                          <Badge variant="outline" className="text-[10px]">
                            +{job.skills.length - 5} more
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  </article>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <ScrollToTop containerRef={scrollRef} />
    </div>
  );
}
