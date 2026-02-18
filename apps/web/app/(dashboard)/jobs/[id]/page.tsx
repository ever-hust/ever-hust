import { cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db, jobs, userJobs } from "@repo/db";
import { eq, and } from "drizzle-orm";
import { Badge } from "@repo/ui/badge";
import { Button } from "@repo/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/card";
import { Separator } from "@repo/ui/separator";
import {
  ExternalLink,
  MapPin,
  Building2,
  Clock,
  Briefcase,
  Users,
  DollarSign,
  GraduationCap,
  FileText,
  Globe,
  Calendar,
} from "lucide-react";
import { FavoriteButton } from "@/components/jobs/favorite-button";
import { Breadcrumbs } from "@/components/shared/breadcrumbs";
import { getSessionUser } from "@/lib/get-session-user";
import { formatSalary, formatLocation, timeAgo } from "@/lib/format-date";
import { safeExternalUrl } from "@/lib/safe-url";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Long-form date for the job detail page, e.g. "January 15, 2025".
 * Different from the shared `formatDate` (which uses short month).
 */
function formatLongDate(date: Date | string | null) {
  if (!date) return null;
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function renderDescription(text: string) {
  // Split on double newlines for paragraphs, single newlines become <br />
  const paragraphs = text.split(/\n{2,}/);
  return paragraphs.map((para, i) => {
    // Strip basic markdown formatting characters for cleaner display
    const cleaned = para.trim();
    if (!cleaned) return null;

    // Detect heading-like lines (starting with #)
    const headingMatch = cleaned.match(/^(#{1,3})\s+(.+)/);
    if (headingMatch) {
      const level = headingMatch[1]!.length;
      const content = headingMatch[2]!;
      if (level === 1)
        return (
          <h3 key={i} className="mb-3 mt-6 text-lg font-semibold first:mt-0">
            {content}
          </h3>
        );
      if (level === 2)
        return (
          <h4 key={i} className="mb-2 mt-5 text-base font-semibold first:mt-0">
            {content}
          </h4>
        );
      return (
        <h4 key={i} className="mb-2 mt-4 text-sm font-semibold first:mt-0">
          {content}
        </h4>
      );
    }

    // Detect list items (lines starting with - or *)
    const lines = cleaned.split("\n");
    const isList = lines.every(
      (line) => line.trim().startsWith("- ") || line.trim().startsWith("* ")
    );
    if (isList) {
      return (
        <ul key={i} className="mb-4 list-disc space-y-1 pl-6 text-sm leading-relaxed text-muted-foreground">
          {lines.map((line, j) => (
            <li key={j}>{line.replace(/^[\s]*[-*]\s+/, "")}</li>
          ))}
        </ul>
      );
    }

    // Regular paragraph
    return (
      <p
        key={i}
        className="mb-4 text-sm leading-relaxed text-muted-foreground"
      >
        {lines.map((line, j) => (
          <span key={j}>
            {j > 0 && <br />}
            {line}
          </span>
        ))}
      </p>
    );
  });
}

// ---------------------------------------------------------------------------
// Cached query — React `cache()` deduplicates this across generateMetadata
// and the page component within the same request, avoiding a redundant DB hit.
// ---------------------------------------------------------------------------

const getJob = cache(async (jobId: number) => {
  const result = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
  return result[0] ?? null;
});

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

type PageProps = { params: Promise<{ id: string }> };

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { id } = await params;
  const jobId = Number(id);
  if (isNaN(jobId)) return { title: "Job Not Found" };

  const job = await getJob(jobId);
  if (!job) return { title: "Job Not Found" };

  const company = job.companyName ?? "Unknown Company";
  return {
    title: `${job.title} at ${company}`,
    description: `View the job listing for ${job.title} at ${company} on Ever Jobs.`,
  };
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function JobDetailPage({ params }: PageProps) {
  const { id } = await params;
  const jobId = Number(id);

  if (isNaN(jobId)) {
    notFound();
  }

  const job = await getJob(jobId);

  if (!job) {
    notFound();
  }

  // Check if current user has favorited this job (used by client components)
  const sessionUser = await getSessionUser();
  /* eslint-disable @typescript-eslint/no-unused-vars */
  let isFavorited = false;
  if (sessionUser) {
    const fav = await db
      .select({ id: userJobs.id })
      .from(userJobs)
      .where(
        and(
          eq(userJobs.userId, sessionUser.id),
          eq(userJobs.jobId, jobId),
          eq(userJobs.status, "favorited")
        )
      )
      .limit(1);
    isFavorited = fav.length > 0;
  }
  /* eslint-enable @typescript-eslint/no-unused-vars */

  const salary = formatSalary(
    job.salaryMin,
    job.salaryMax,
    job.salaryCurrency,
    job.salaryInterval,
    "full"
  );
  const location = formatLocation(
    job.locationCity,
    job.locationState,
    job.locationCountry
  );
  const postedDate = formatLongDate(job.datePosted);
  const postedAgo = timeAgo(job.datePosted);
  const safeLogo = safeExternalUrl(job.companyLogo);
  const applyLink = safeExternalUrl(job.applyUrl) ?? safeExternalUrl(job.jobUrl) ?? safeExternalUrl(job.jobUrlDirect) ?? null;

  // Build JSON-LD structured data for SEO (Google for Jobs)
  const jsonLd = {
    "@context": "https://schema.org/",
    "@type": "JobPosting",
    title: job.title,
    description: job.description ?? "",
    datePosted: job.datePosted
      ? new Date(job.datePosted).toISOString()
      : new Date(job.createdAt).toISOString(),
    ...(job.expiresAt
      ? { validThrough: new Date(job.expiresAt).toISOString() }
      : {}),
    hiringOrganization: {
      "@type": "Organization",
      name: job.companyName ?? "Unknown",
      ...(safeExternalUrl(job.companyUrl) ? { sameAs: safeExternalUrl(job.companyUrl) } : {}),
      ...(safeLogo ? { logo: safeLogo } : {}),
    },
    jobLocation: {
      "@type": "Place",
      address: {
        "@type": "PostalAddress",
        ...(job.locationCity ? { addressLocality: job.locationCity } : {}),
        ...(job.locationState ? { addressRegion: job.locationState } : {}),
        ...(job.locationCountry ? { addressCountry: job.locationCountry } : {}),
      },
    },
    ...(job.isRemote
      ? { jobLocationType: "TELECOMMUTE" }
      : {}),
    ...(job.employmentType
      ? { employmentType: job.employmentType.toUpperCase().replace(/ /g, "_") }
      : {}),
    ...(job.salaryMin || job.salaryMax
      ? {
          baseSalary: {
            "@type": "MonetaryAmount",
            currency: job.salaryCurrency ?? "USD",
            value: {
              "@type": "QuantitativeValue",
              ...(job.salaryMin ? { minValue: Number(job.salaryMin) } : {}),
              ...(job.salaryMax ? { maxValue: Number(job.salaryMax) } : {}),
              unitText:
                job.salaryInterval === "yearly"
                  ? "YEAR"
                  : job.salaryInterval === "monthly"
                    ? "MONTH"
                    : job.salaryInterval === "hourly"
                      ? "HOUR"
                      : "YEAR",
            },
          },
        }
      : {}),
    ...(applyLink ? { directApply: true } : {}),
  };

  return (
    <>
      {/* Escape closing script tags in JSON-LD to prevent XSS via crafted
          job data (e.g. a description containing "</script>"). */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />
      <div className="flex flex-1 flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
        {/* ----------------------------------------------------------------- */}
        {/* Breadcrumb Navigation                                             */}
        {/* ----------------------------------------------------------------- */}
        <Breadcrumbs overrideLabel={job.title} className="mb-6" />

        {/* ----------------------------------------------------------------- */}
        {/* Header Section                                                    */}
        {/* ----------------------------------------------------------------- */}
        <div className="mb-6">
          <div className="flex items-start gap-4">
            {/* Company Logo */}
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border bg-background">
              {safeLogo ? (
                <img
                  src={safeLogo}
                  alt={job.companyName ?? "Company"}
                  className="h-10 w-10 rounded object-contain"
                />
              ) : (
                <Building2 className="h-7 w-7 text-muted-foreground" aria-hidden="true" />
              )}
            </div>

            {/* Title and Company */}
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-bold leading-tight tracking-tight sm:text-3xl">
                {job.title}
              </h1>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                {job.companyName && (
                  <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                    <Building2 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    {safeExternalUrl(job.companyUrl) ? (
                      <a
                        href={safeExternalUrl(job.companyUrl)!}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:underline"
                      >
                        {job.companyName}
                      </a>
                    ) : (
                      job.companyName
                    )}
                  </span>
                )}

                {location && (
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="h-4 w-4" aria-hidden="true" />
                    {location}
                  </span>
                )}

                {postedAgo && (
                  <span className="inline-flex items-center gap-1.5">
                    <Clock className="h-4 w-4" aria-hidden="true" />
                    {postedAgo}
                  </span>
                )}
              </div>

              {/* Badges Row */}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {job.isRemote && (
                  <Badge variant="default">Remote</Badge>
                )}
                {job.jobType?.map((type) => (
                  <Badge key={type} variant="secondary">
                    {type}
                  </Badge>
                ))}
                {job.jobLevel && (
                  <Badge variant="secondary">{job.jobLevel}</Badge>
                )}
                {salary && (
                  <Badge variant="outline" className="font-semibold">
                    <DollarSign className="h-3 w-3" aria-hidden="true" />
                    {salary}
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ----------------------------------------------------------------- */}
        {/* Action Buttons                                                    */}
        {/* ----------------------------------------------------------------- */}
        <div className="mb-6 flex flex-wrap items-center gap-3">
          {applyLink && (
            <Button size="lg" asChild>
              <a href={applyLink} target="_blank" rel="noopener noreferrer">
                Apply on{" "}
                <span className="capitalize">{job.site}</span>
                <ExternalLink className="ml-1 h-4 w-4" aria-hidden="true" />
              </a>
            </Button>
          )}
          <Button variant="outline" size="lg" asChild>
            <Link href={`/chat?job=${job.id}`}>
              <FileText className="mr-1 h-4 w-4" aria-hidden="true" />
              Generate Cover Letter
            </Link>
          </Button>
          <FavoriteButton jobId={job.id} />
        </div>

        <Separator className="mb-6" />

        {/* ----------------------------------------------------------------- */}
        {/* Main Content: Description + Sidebar                               */}
        {/* ----------------------------------------------------------------- */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Description Column */}
          <div className="lg:col-span-2">
            {/* Description */}
            {job.description && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Job Description</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="prose prose-sm max-w-none">
                    {renderDescription(job.description)}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Skills */}
            {job.skills && job.skills.length > 0 && (
              <Card className="mt-6">
                <CardHeader>
                  <CardTitle className="text-lg">Skills &amp; Technologies</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {job.skills.map((skill) => (
                      <Badge key={skill} variant="secondary" className="px-3 py-1 text-sm">
                        {skill}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Sidebar Column */}
          <div className="space-y-6">
            {/* Job Details Card */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Job Details</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="space-y-4">
                  {job.jobType && job.jobType.length > 0 && (
                    <div className="flex items-start gap-3">
                      <Briefcase className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                      <div>
                        <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                          Job Type
                        </dt>
                        <dd className="mt-0.5 text-sm">{job.jobType.join(", ")}</dd>
                      </div>
                    </div>
                  )}

                  {job.jobLevel && (
                    <div className="flex items-start gap-3">
                      <GraduationCap className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                      <div>
                        <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                          Experience Level
                        </dt>
                        <dd className="mt-0.5 text-sm">{job.jobLevel}</dd>
                      </div>
                    </div>
                  )}

                  {job.department && (
                    <div className="flex items-start gap-3">
                      <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                      <div>
                        <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                          Department
                        </dt>
                        <dd className="mt-0.5 text-sm">{job.department}</dd>
                      </div>
                    </div>
                  )}

                  {job.team && (
                    <div className="flex items-start gap-3">
                      <Users className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                      <div>
                        <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                          Team
                        </dt>
                        <dd className="mt-0.5 text-sm">{job.team}</dd>
                      </div>
                    </div>
                  )}

                  {job.employmentType && (
                    <div className="flex items-start gap-3">
                      <Briefcase className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                      <div>
                        <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                          Employment Type
                        </dt>
                        <dd className="mt-0.5 text-sm">{job.employmentType}</dd>
                      </div>
                    </div>
                  )}

                  {job.jobFunction && (
                    <div className="flex items-start gap-3">
                      <Briefcase className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                      <div>
                        <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                          Function
                        </dt>
                        <dd className="mt-0.5 text-sm">{job.jobFunction}</dd>
                      </div>
                    </div>
                  )}

                  {salary && (
                    <div className="flex items-start gap-3">
                      <DollarSign className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                      <div>
                        <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                          Salary Range
                        </dt>
                        <dd className="mt-0.5 text-sm">{salary}</dd>
                      </div>
                    </div>
                  )}

                  {location && (
                    <div className="flex items-start gap-3">
                      <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                      <div>
                        <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                          Location
                        </dt>
                        <dd className="mt-0.5 text-sm">
                          {location}
                          {job.isRemote && " (Remote)"}
                        </dd>
                      </div>
                    </div>
                  )}

                  {postedDate && (
                    <div className="flex items-start gap-3">
                      <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                      <div>
                        <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                          Date Posted
                        </dt>
                        <dd className="mt-0.5 text-sm">{postedDate}</dd>
                      </div>
                    </div>
                  )}
                </dl>
              </CardContent>
            </Card>

            {/* Source Badge */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Source</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <Globe className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  <Badge variant="outline" className="capitalize">
                    {job.site}
                  </Badge>
                </div>
                {safeExternalUrl(job.jobUrl) && (
                  <a
                    href={safeExternalUrl(job.jobUrl)!}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    View original listing
                    <ExternalLink className="h-3 w-3" aria-hidden="true" />
                  </a>
                )}
              </CardContent>
            </Card>

            {/* Company Info Card */}
            {(job.companyName || job.companyDescription || job.companyIndustry || job.companyNumEmployees) && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">About the Company</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {job.companyName && (
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border bg-background">
                          {safeLogo ? (
                            <img
                              src={safeLogo}
                              alt={job.companyName ?? "Company"}
                              className="h-8 w-8 rounded object-contain"
                            />
                          ) : (
                            <Building2 className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                          )}
                        </div>
                        <div>
                          <p className="text-sm font-medium">
                            {safeExternalUrl(job.companyUrl) ? (
                              <a
                                href={safeExternalUrl(job.companyUrl)!}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="hover:underline"
                              >
                                {job.companyName}
                              </a>
                            ) : (
                              job.companyName
                            )}
                          </p>
                          {job.companyIndustry && (
                            <p className="text-xs text-muted-foreground">
                              {job.companyIndustry}
                            </p>
                          )}
                        </div>
                      </div>
                    )}

                    {job.companyNumEmployees && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Users className="h-4 w-4" aria-hidden="true" />
                        <span>{job.companyNumEmployees} employees</span>
                      </div>
                    )}

                    {job.companyDescription && (
                      <p className="text-sm leading-relaxed text-muted-foreground">
                        {job.companyDescription}
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Apply CTA in sidebar */}
            {applyLink && (
              <Button className="block w-full" size="lg" asChild>
                <a
                  href={applyLink}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Apply Now
                  <ExternalLink className="ml-1 h-4 w-4" aria-hidden="true" />
                </a>
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
    </>
  );
}
