"use client";

import { Heart, ExternalLink, MapPin, Building2, Clock } from "lucide-react";
import { Badge } from "@repo/ui/badge";
import { Button } from "@repo/ui/button";
import { cn } from "@repo/ui/lib/utils";

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
  onFavorite?: (jobId: number) => void;
  onViewDetails?: (jobId: number) => void;
}

function formatSalary(
  min: string | null,
  max: string | null,
  currency: string | null,
  interval: string | null
) {
  if (!min && !max) return null;
  const curr = currency ?? "USD";
  const fmt = (v: string) => {
    const num = Number(v);
    if (num >= 1000) return `${curr === "USD" ? "$" : curr}${Math.round(num / 1000)}k`;
    return `${curr === "USD" ? "$" : curr}${num}`;
  };
  const parts = [];
  if (min) parts.push(fmt(min));
  if (max) parts.push(fmt(max));
  const range = parts.join(" - ");
  const int = interval === "yearly" ? "/yr" : interval ? `/${interval}` : "/yr";
  return `${range}${int}`;
}

function formatLocation(
  city: string | null,
  state: string | null,
  country: string | null,
  isRemote: boolean | null
) {
  const parts = [city, state].filter(Boolean);
  const loc = parts.length > 0 ? parts.join(", ") : country;
  if (isRemote) return loc ? `${loc} (Remote)` : "Remote";
  return loc ?? "Unknown";
}

function timeAgo(date: string | Date | null) {
  if (!date) return null;
  const d = typeof date === "string" ? new Date(date) : date;
  const diff = Date.now() - d.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export function JobCard({
  job,
  isFavorited = false,
  onFavorite,
  onViewDetails,
}: JobCardProps) {
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
  );
  const posted = timeAgo(job.datePosted);

  return (
    <article aria-label={`${job.title} at ${job.companyName ?? "Unknown Company"}`} className="group rounded-lg border bg-card p-4 transition-colors hover:bg-accent/50">
      <div className="flex items-start gap-3">
        {/* Company logo */}
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border bg-background">
          {job.companyLogo ? (
            <img
              src={job.companyLogo}
              alt={job.companyName ?? ""}
              className="h-8 w-8 rounded object-contain"
            />
          ) : (
            <Building2 className="h-5 w-5 text-muted-foreground" />
          )}
        </div>

        {/* Job info */}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3
                className="cursor-pointer truncate text-sm font-semibold leading-tight hover:underline"
                onClick={() => onViewDetails?.(job.id)}
              >
                {job.title}
              </h3>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {job.companyName ?? "Unknown Company"}
              </p>
            </div>

            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
              aria-label={isFavorited ? `Remove ${job.title} from favorites` : `Add ${job.title} to favorites`}
              onClick={() => onFavorite?.(job.id)}
            >
              <Heart
                className={cn(
                  "h-4 w-4",
                  isFavorited
                    ? "fill-red-500 text-red-500"
                    : "text-muted-foreground"
                )}
              />
            </Button>
          </div>

          {/* Location and salary */}
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {location}
            </span>
            {salary && (
              <span className="font-medium text-foreground">{salary}</span>
            )}
            {posted && (
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {posted}
              </span>
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

            {(job.applyUrl || job.jobUrl) && (
              <a
                href={job.applyUrl ?? job.jobUrl ?? "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                Apply
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
