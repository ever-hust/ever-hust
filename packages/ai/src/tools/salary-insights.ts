import { tool } from "ai";
import { z } from "zod";
import { db } from "@repo/db";
import { jobs } from "@repo/db";
import { and, ilike, isNotNull, sql, eq, or } from "drizzle-orm";
import { annualise, median } from "./salary-helpers";
import { escapeIlike } from "@repo/db";

export const salaryInsightsTool = tool({
  description:
    "Analyse salary data for a given job title across the database. Returns aggregated salary statistics including median, average, min/max ranges, breakdowns by job level and remote vs on-site, and top-paying companies. Use when the user asks about salary expectations, pay ranges, or compensation for a role.",
  inputSchema: z.object({
    jobTitle: z
      .string()
      .max(200)
      .describe(
        "The job title to analyse salary data for (e.g. 'Software Engineer', 'Product Manager')"
      ),
    location: z
      .string()
      .max(200)
      .optional()
      .describe(
        "Optional location to filter by (city, state, or country)"
      ),
    jobLevel: z
      .string()
      .max(50)
      .optional()
      .describe(
        "Optional job level filter (e.g. 'entry', 'mid', 'senior', 'lead', 'manager', 'director', 'executive')"
      ),
  }),
  execute: async ({ jobTitle, location, jobLevel }) => {
    try {
      const titlePattern = `%${escapeIlike(jobTitle)}%`;

      // Build filter conditions
      const conditions = [
        ilike(jobs.title, titlePattern),
        // Must have at least one salary value
        or(isNotNull(jobs.salaryMin), isNotNull(jobs.salaryMax)),
      ];

      if (location) {
        const locPattern = `%${escapeIlike(location)}%`;
        conditions.push(
          or(
            ilike(jobs.locationCity, locPattern),
            ilike(jobs.locationState, locPattern),
            ilike(jobs.locationCountry, locPattern)
          )
        );
      }

      if (jobLevel) {
        conditions.push(ilike(jobs.jobLevel, `%${escapeIlike(jobLevel)}%`));
      }

      // Fetch all matching jobs with salary data
      const matchingJobs = await db
        .select({
          id: jobs.id,
          title: jobs.title,
          companyName: jobs.companyName,
          locationCity: jobs.locationCity,
          locationState: jobs.locationState,
          locationCountry: jobs.locationCountry,
          isRemote: jobs.isRemote,
          jobLevel: jobs.jobLevel,
          salaryMin: jobs.salaryMin,
          salaryMax: jobs.salaryMax,
          salaryCurrency: jobs.salaryCurrency,
          salaryInterval: jobs.salaryInterval,
        })
        .from(jobs)
        .where(and(...conditions))
        .limit(500);

      if (matchingJobs.length === 0) {
        return {
          error: `No salary data found for "${jobTitle}"${location ? ` in ${location}` : ""}${jobLevel ? ` at ${jobLevel} level` : ""}. Try broadening your search with a more general title or removing location/level filters.`,
          jobTitle,
          location: location ?? null,
          jobLevel: jobLevel ?? null,
          sampleSize: 0,
        };
      }

      // Normalise all salaries to annual figures
      interface NormalisedJob {
        annualMin: number | null;
        annualMax: number | null;
        annualMid: number;
        companyName: string | null;
        jobLevel: string | null;
        isRemote: boolean | null;
        locationCity: string | null;
        locationState: string | null;
        locationCountry: string | null;
        currency: string | null;
      }

      const normalised: NormalisedJob[] = [];

      for (const job of matchingJobs) {
        const rawMin = job.salaryMin ? Number(job.salaryMin) : null;
        const rawMax = job.salaryMax ? Number(job.salaryMax) : null;

        // Skip if both are null/NaN/Infinity (shouldn't happen due to query filter, but be safe)
        if (rawMin == null && rawMax == null) continue;
        if ((rawMin != null && !Number.isFinite(rawMin)) || (rawMax != null && !Number.isFinite(rawMax))) continue;

        const annMin = rawMin != null ? annualise(rawMin, job.salaryInterval) : null;
        const annMax = rawMax != null ? annualise(rawMax, job.salaryInterval) : null;

        // Compute a midpoint for aggregation: prefer average of min+max, fall back to whichever is available
        let annMid: number;
        if (annMin != null && annMax != null) {
          annMid = (annMin + annMax) / 2;
        } else if (annMin != null) {
          annMid = annMin;
        } else {
          annMid = annMax!;
        }

        normalised.push({
          annualMin: annMin,
          annualMax: annMax,
          annualMid: annMid,
          companyName: job.companyName,
          jobLevel: job.jobLevel,
          isRemote: job.isRemote,
          locationCity: job.locationCity,
          locationState: job.locationState,
          locationCountry: job.locationCountry,
          currency: job.salaryCurrency,
        });
      }

      if (normalised.length === 0) {
        return {
          error: `Found jobs matching "${jobTitle}" but could not parse any salary figures. The salary data may be in an unexpected format.`,
          jobTitle,
          location: location ?? null,
          jobLevel: jobLevel ?? null,
          sampleSize: 0,
        };
      }

      // Overall statistics using midpoint salaries
      const midpoints = normalised
        .map((j) => j.annualMid)
        .sort((a, b) => a - b);
      const allMins = normalised
        .filter((j) => j.annualMin != null)
        .map((j) => j.annualMin!)
        .sort((a, b) => a - b);
      const allMaxes = normalised
        .filter((j) => j.annualMax != null)
        .map((j) => j.annualMax!)
        .sort((a, b) => a - b);

      const sum = midpoints.reduce((a, b) => a + b, 0);
      const average = Math.round(sum / midpoints.length);
      const medianSalary = Math.round(median(midpoints));
      const overallMin = allMins.length > 0 ? allMins[0]! : midpoints[0]!;
      const overallMax =
        allMaxes.length > 0
          ? allMaxes[allMaxes.length - 1]!
          : midpoints[midpoints.length - 1]!;

      // Percentiles (25th / 75th) using standard nearest-rank on (N-1) scale
      const p25Index = Math.floor((midpoints.length - 1) * 0.25);
      const p75Index = Math.min(
        Math.ceil((midpoints.length - 1) * 0.75),
        midpoints.length - 1
      );
      const p25 = Math.round(midpoints[p25Index]!);
      const p75 = Math.round(midpoints[p75Index]!);

      // Determine the dominant currency
      const currencyCounts = new Map<string, number>();
      for (const j of normalised) {
        const cur = j.currency?.toUpperCase() ?? "USD";
        currencyCounts.set(cur, (currencyCounts.get(cur) ?? 0) + 1);
      }
      let dominantCurrency = "USD";
      let maxCurrencyCount = 0;
      for (const [cur, count] of currencyCounts) {
        if (count > maxCurrencyCount) {
          dominantCurrency = cur;
          maxCurrencyCount = count;
        }
      }

      // Breakdown by job level
      const levelMap = new Map<
        string,
        { midpoints: number[]; count: number }
      >();
      for (const j of normalised) {
        const level = j.jobLevel?.toLowerCase() ?? "unspecified";
        const entry = levelMap.get(level);
        if (entry) {
          entry.midpoints.push(j.annualMid);
          entry.count++;
        } else {
          levelMap.set(level, { midpoints: [j.annualMid], count: 1 });
        }
      }

      const byLevel = [...levelMap.entries()]
        .map(([level, data]) => {
          const sorted = data.midpoints.sort((a, b) => a - b);
          return {
            level,
            count: data.count,
            median: Math.round(median(sorted)),
            min: Math.round(sorted[0]!),
            max: Math.round(sorted[sorted.length - 1]!),
          };
        })
        .sort((a, b) => b.median - a.median);

      // Breakdown by remote vs on-site
      let remoteCount = 0;
      const remoteMidpoints: number[] = [];
      let onsiteCount = 0;
      const onsiteMidpoints: number[] = [];

      for (const j of normalised) {
        if (j.isRemote) {
          remoteCount++;
          remoteMidpoints.push(j.annualMid);
        } else {
          onsiteCount++;
          onsiteMidpoints.push(j.annualMid);
        }
      }

      remoteMidpoints.sort((a, b) => a - b);
      onsiteMidpoints.sort((a, b) => a - b);

      const byWorkMode = {
        remote: {
          count: remoteCount,
          median: Math.round(median(remoteMidpoints)),
          min:
            remoteMidpoints.length > 0
              ? Math.round(remoteMidpoints[0]!)
              : null,
          max:
            remoteMidpoints.length > 0
              ? Math.round(remoteMidpoints[remoteMidpoints.length - 1]!)
              : null,
        },
        onSite: {
          count: onsiteCount,
          median: Math.round(median(onsiteMidpoints)),
          min:
            onsiteMidpoints.length > 0
              ? Math.round(onsiteMidpoints[0]!)
              : null,
          max:
            onsiteMidpoints.length > 0
              ? Math.round(onsiteMidpoints[onsiteMidpoints.length - 1]!)
              : null,
        },
      };

      // Top paying companies
      const companyMap = new Map<string, { midpoints: number[]; count: number }>();
      for (const j of normalised) {
        const name = j.companyName ?? "Unknown";
        const entry = companyMap.get(name);
        if (entry) {
          entry.midpoints.push(j.annualMid);
          entry.count++;
        } else {
          companyMap.set(name, { midpoints: [j.annualMid], count: 1 });
        }
      }

      const topCompanies = [...companyMap.entries()]
        .map(([name, data]) => {
          const sorted = data.midpoints.sort((a, b) => a - b);
          return {
            company: name,
            medianSalary: Math.round(median(sorted)),
            jobCount: data.count,
          };
        })
        .sort((a, b) => b.medianSalary - a.medianSalary)
        .slice(0, 10);

      return {
        jobTitle,
        location: location ?? null,
        jobLevel: jobLevel ?? null,
        sampleSize: normalised.length,
        currency: dominantCurrency,
        overall: {
          median: medianSalary,
          average,
          min: Math.round(overallMin),
          max: Math.round(overallMax),
          p25,
          p75,
        },
        byLevel,
        byWorkMode,
        topCompanies,
      };
    } catch (err) {
      console.error(
        "[salary-insights] execute failed:",
        err instanceof Error ? err.message : err
      );
      return {
        error:
          "Something went wrong while analysing salary data. Please try again.",
        jobTitle,
        sampleSize: 0,
      };
    }
  },
});
