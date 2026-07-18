import { cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db, jobs } from "@ever-hust/db";
import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import { Badge } from "@ever-hust/ui/badge";
import { Card, CardContent } from "@ever-hust/ui/card";
import { Building2, MapPin, Briefcase } from "lucide-react";
import { Breadcrumbs } from "@/components/shared/breadcrumbs";
import { formatSalary, formatLocation, timeAgo } from "@/lib/format-date";
import { safeExternalUrl } from "@/lib/safe-url";

const MAX_JOBS = 60;

/** SQL slug of company_name — must mirror lib/company-slug.ts companySlug(). */
function companySlugSql() {
  return sql`trim(both '-' from regexp_replace(lower(${jobs.companyName}), '[^a-z0-9]+', '-', 'g'))`;
}

const getCompany = cache(async (slug: string) => {
  const slugMatch = and(isNotNull(jobs.companyName), eq(companySlugSql(), slug));

  const [rows, countRows] = await Promise.all([
    db
      .select({
        id: jobs.id,
        title: jobs.title,
        companyName: jobs.companyName,
        companyLogo: jobs.companyLogo,
        companyUrl: jobs.companyUrl,
        companyIndustry: jobs.companyIndustry,
        companyNumEmployees: jobs.companyNumEmployees,
        companyDescription: jobs.companyDescription,
        locationCity: jobs.locationCity,
        locationState: jobs.locationState,
        locationCountry: jobs.locationCountry,
        isRemote: jobs.isRemote,
        salaryMin: jobs.salaryMin,
        salaryMax: jobs.salaryMax,
        salaryCurrency: jobs.salaryCurrency,
        salaryInterval: jobs.salaryInterval,
        datePosted: jobs.datePosted,
      })
      .from(jobs)
      .where(slugMatch)
      .orderBy(desc(jobs.datePosted))
      .limit(MAX_JOBS),
    db.select({ count: sql<number>`count(*)` }).from(jobs).where(slugMatch),
  ]);

  if (rows.length === 0) return null;

  const total = Number(countRows[0]?.count ?? 0);
  // Pick a representative company profile from the most recent posting that has
  // the richest metadata.
  const profile =
    rows.find((r) => r.companyDescription) ??
    rows.find((r) => r.companyIndustry) ??
    rows[0]!;

  return { jobs: rows, total, profile };
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const data = await getCompany(slug);
  if (!data) return { title: "Company not found · Hust" };
  const name = data.profile.companyName ?? "Company";
  return {
    title: `${name} jobs · Hust`,
    description: `Browse ${data.total} open job${data.total === 1 ? "" : "s"} at ${name}.`,
  };
}

export default async function CompanyPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const data = await getCompany(slug);
  if (!data) notFound();

  const { jobs: jobList, total, profile } = data;
  const name = profile.companyName ?? "Company";
  const logo = safeExternalUrl(profile.companyLogo);
  const website = safeExternalUrl(profile.companyUrl);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
      <Breadcrumbs overrideLabel={name} />

      {/* Company header */}
      <div className="mt-4 flex items-start gap-4">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border bg-background">
          {logo ? (
            <img src={logo} alt={name} className="h-11 w-11 rounded object-contain" />
          ) : (
            <Building2 className="h-7 w-7 text-muted-foreground" aria-hidden="true" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold tracking-tight">{name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            {profile.companyIndustry && <span>{profile.companyIndustry}</span>}
            {profile.companyNumEmployees && <span>{profile.companyNumEmployees} employees</span>}
            <span>
              {total} open job{total === 1 ? "" : "s"}
            </span>
          </div>
          {website && (
            <a
              href={website}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-block text-sm text-primary hover:underline"
            >
              {website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
            </a>
          )}
        </div>
      </div>

      {profile.companyDescription && (
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
          {profile.companyDescription}
        </p>
      )}

      {/* Jobs list */}
      <h2 className="mt-8 mb-3 text-lg font-semibold">
        Open positions{total > jobList.length ? ` (showing ${jobList.length} of ${total})` : ""}
      </h2>
      <div className="space-y-2">
        {jobList.map((job) => {
          const location = formatLocation(
            job.locationCity,
            job.locationState,
            job.locationCountry,
            job.isRemote,
          );
          const salary = formatSalary(
            job.salaryMin,
            job.salaryMax,
            job.salaryCurrency,
            job.salaryInterval,
          );
          return (
            <Link key={job.id} href={`/jobs/${job.id}`} className="block">
              <Card className="transition-colors hover:bg-accent/50">
                <CardContent className="flex items-start justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{job.title}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      {location && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-3 w-3" aria-hidden="true" />
                          {location}
                        </span>
                      )}
                      {salary && (
                        <span className="inline-flex items-center gap-1">
                          <Briefcase className="h-3 w-3" aria-hidden="true" />
                          {salary}
                        </span>
                      )}
                    </div>
                  </div>
                  {job.datePosted && (
                    <Badge variant="outline" className="shrink-0 text-[11px]">
                      {timeAgo(job.datePosted)}
                    </Badge>
                  )}
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
