import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db, jobs } from "@repo/db";
import { eq } from "drizzle-orm";
import { Badge } from "@repo/ui/badge";
import { Button } from "@repo/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/card";
import { Separator } from "@repo/ui/separator";
import {
  ArrowLeft,
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatSalary(
  min: string | null,
  max: string | null,
  currency: string | null,
  interval: string | null
) {
  if (!min && !max) return null;
  const curr = currency ?? "USD";
  const symbol = curr === "USD" ? "$" : curr;

  const fmt = (v: string) => {
    const num = Number(v);
    if (isNaN(num)) return v;
    return `${symbol}${num.toLocaleString("en-US")}`;
  };

  const parts: string[] = [];
  if (min) parts.push(fmt(min));
  if (max) parts.push(fmt(max));
  const range = parts.join(" - ");
  const int =
    interval === "yearly"
      ? "/year"
      : interval === "monthly"
        ? "/month"
        : interval === "hourly"
          ? "/hour"
          : interval
            ? `/${interval}`
            : "/year";
  return `${range} ${int}`;
}

function formatLocation(
  city: string | null,
  state: string | null,
  country: string | null
) {
  const parts = [city, state, country].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}

function formatDate(date: Date | string | null) {
  if (!date) return null;
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function timeAgo(date: Date | string | null) {
  if (!date) return null;
  const d = typeof date === "string" ? new Date(date) : date;
  const diff = Date.now() - d.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  return `${Math.floor(days / 30)} months ago`;
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
      const level = headingMatch[1].length;
      const content = headingMatch[2];
      if (level === 1)
        return (
          <h3 key={i} className="mb-3 mt-6 text-lg font-semibold first:mt-0">
            {content}
          </h3>
        );
      if (level === 2)
        return (
          <h4
            key={i}
            className="mb-2 mt-5 text-base font-semibold first:mt-0"
          >
            {content}
          </h4>
        );
      return (
        <h5 key={i} className="mb-2 mt-4 text-sm font-semibold first:mt-0">
          {content}
        </h5>
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
// Metadata
// ---------------------------------------------------------------------------

type PageProps = { params: Promise<{ id: string }> };

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { id } = await params;
  const jobId = Number(id);
  if (isNaN(jobId)) return { title: "Job Not Found" };

  const result = await db
    .select({ title: jobs.title, companyName: jobs.companyName })
    .from(jobs)
    .where(eq(jobs.id, jobId))
    .limit(1);

  if (result.length === 0) return { title: "Job Not Found" };

  const job = result[0];
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

  const result = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);

  if (result.length === 0) {
    notFound();
  }

  const job = result[0];

  const salary = formatSalary(
    job.salaryMin,
    job.salaryMax,
    job.salaryCurrency,
    job.salaryInterval
  );
  const location = formatLocation(
    job.locationCity,
    job.locationState,
    job.locationCountry
  );
  const postedDate = formatDate(job.datePosted);
  const postedAgo = timeAgo(job.datePosted);
  const applyLink = job.applyUrl || job.jobUrl || job.jobUrlDirect;

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
      ...(job.companyUrl ? { sameAs: job.companyUrl } : {}),
      ...(job.companyLogo ? { logo: job.companyLogo } : {}),
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
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
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
              {job.companyLogo ? (
                <img
                  src={job.companyLogo}
                  alt={job.companyName ?? "Company"}
                  className="h-10 w-10 rounded object-contain"
                />
              ) : (
                <Building2 className="h-7 w-7 text-muted-foreground" />
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
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    {job.companyUrl ? (
                      <a
                        href={job.companyUrl}
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
                    <MapPin className="h-4 w-4" />
                    {location}
                  </span>
                )}

                {postedAgo && (
                  <span className="inline-flex items-center gap-1.5">
                    <Clock className="h-4 w-4" />
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
                    <DollarSign className="h-3 w-3" />
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
            <a href={applyLink} target="_blank" rel="noopener noreferrer">
              <Button size="lg">
                Apply on{" "}
                <span className="capitalize">{job.site}</span>
                <ExternalLink className="ml-1 h-4 w-4" />
              </Button>
            </a>
          )}
          <Link href={`/chat?job=${job.id}`}>
            <Button variant="outline" size="lg">
              <FileText className="mr-1 h-4 w-4" />
              Generate Cover Letter
            </Button>
          </Link>
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
                      <Briefcase className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
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
                      <GraduationCap className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
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
                      <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
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
                      <Users className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
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
                      <Briefcase className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
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
                      <Briefcase className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
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
                      <DollarSign className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
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
                      <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
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
                      <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
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
                  <Globe className="h-4 w-4 text-muted-foreground" />
                  <Badge variant="outline" className="capitalize">
                    {job.site}
                  </Badge>
                </div>
                {job.jobUrl && (
                  <a
                    href={job.jobUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    View original listing
                    <ExternalLink className="h-3 w-3" />
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
                          {job.companyLogo ? (
                            <img
                              src={job.companyLogo}
                              alt={job.companyName}
                              className="h-8 w-8 rounded object-contain"
                            />
                          ) : (
                            <Building2 className="h-5 w-5 text-muted-foreground" />
                          )}
                        </div>
                        <div>
                          <p className="text-sm font-medium">
                            {job.companyUrl ? (
                              <a
                                href={job.companyUrl}
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
                        <Users className="h-4 w-4" />
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
              <a
                href={applyLink}
                target="_blank"
                rel="noopener noreferrer"
                className="block"
              >
                <Button className="w-full" size="lg">
                  Apply Now
                  <ExternalLink className="ml-1 h-4 w-4" />
                </Button>
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
    </>
  );
}
