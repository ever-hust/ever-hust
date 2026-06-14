import { tool } from "ai";
import { z } from "zod";
import { db, jobs } from "@ever-hust/db";
import { and, ilike, or } from "drizzle-orm";
import { escapeIlike } from "@ever-hust/db";
import { annualise, median } from "./salary-helpers";

/**
 * Market-insights tool (spec #1 — Harvest the Ever Jobs backend).
 *
 * Hust under-uses the corpus it already syncs from the Ever Jobs API. This read-only tool
 * harvests that corpus into a market signal for a role/market: demand, remote share, the most
 * in-demand skills, the salary spread, and the top hiring locations & companies. Complements
 * `salaryInsights` (pay-only) with a broader "what does this market look like" view.
 */

export interface MarketJob {
  skills: string[] | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryInterval: string | null;
  isRemote: boolean | null;
  locationCity: string | null;
  locationState: string | null;
  jobLevel: string | null;
  companyName: string | null;
}

export interface MarketInsights {
  demandCount: number;
  remotePct: number | null;
  salary: { median: number; p25: number; p75: number; sampleSize: number } | null;
  topSkills: { skill: string; count: number }[];
  topLocations: { location: string; count: number }[];
  topCompanies: { company: string; count: number }[];
  levelMix: { level: string; count: number }[];
}

function topCounts(
  pairs: Iterable<string>,
  limit: number,
): { key: string; count: number }[] {
  const map = new Map<string, number>();
  for (const raw of pairs) {
    const k = raw.trim();
    if (!k) continue;
    map.set(k, (map.get(k) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

/** Pure aggregation core — unit-tested without the database. */
export function computeMarketInsights(rows: MarketJob[]): MarketInsights {
  const demandCount = rows.length;

  // Remote share (only over rows where work-mode is known).
  let remoteKnown = 0;
  let remoteYes = 0;
  for (const r of rows) {
    if (r.isRemote === true) {
      remoteKnown++;
      remoteYes++;
    } else if (r.isRemote === false) {
      remoteKnown++;
    }
  }
  const remotePct = remoteKnown > 0 ? Math.round((remoteYes / remoteKnown) * 100) : null;

  // Salary spread over annualised midpoints.
  const midpoints: number[] = [];
  for (const r of rows) {
    const min = r.salaryMin != null && Number.isFinite(r.salaryMin) ? r.salaryMin : null;
    const max = r.salaryMax != null && Number.isFinite(r.salaryMax) ? r.salaryMax : null;
    if (min == null && max == null) continue;
    const annMin = min != null ? annualise(min, r.salaryInterval) : null;
    const annMax = max != null ? annualise(max, r.salaryInterval) : null;
    const mid =
      annMin != null && annMax != null
        ? (annMin + annMax) / 2
        : (annMin ?? annMax)!;
    midpoints.push(mid);
  }
  midpoints.sort((a, b) => a - b);
  const salary =
    midpoints.length > 0
      ? {
          median: Math.round(median(midpoints)),
          p25: Math.round(midpoints[Math.floor((midpoints.length - 1) * 0.25)]!),
          p75: Math.round(midpoints[Math.ceil((midpoints.length - 1) * 0.75)]!),
          sampleSize: midpoints.length,
        }
      : null;

  const skills: string[] = [];
  for (const r of rows) {
    if (Array.isArray(r.skills)) {
      for (const s of r.skills) if (typeof s === "string") skills.push(s);
    }
  }

  const locations: string[] = [];
  for (const r of rows) {
    const loc = [r.locationCity, r.locationState].filter(Boolean).join(", ");
    if (loc) locations.push(loc);
  }

  const companies = rows
    .map((r) => r.companyName)
    .filter((c): c is string => typeof c === "string" && c.length > 0);

  const levels = rows
    .map((r) => r.jobLevel)
    .filter((l): l is string => typeof l === "string" && l.length > 0)
    .map((l) => l.toLowerCase());

  return {
    demandCount,
    remotePct,
    salary,
    topSkills: topCounts(skills, 12).map((x) => ({ skill: x.key, count: x.count })),
    topLocations: topCounts(locations, 8).map((x) => ({ location: x.key, count: x.count })),
    topCompanies: topCounts(companies, 8).map((x) => ({ company: x.key, count: x.count })),
    levelMix: topCounts(levels, 8).map((x) => ({ level: x.key, count: x.count })),
  };
}

export const marketInsightsTool = tool({
  description:
    "Get a market overview for a role from the synced job corpus: demand (how many openings), " +
    "remote share, the most in-demand skills, the salary spread (p25/median/p75), and the top " +
    "hiring locations & companies. Use when the user asks 'what's the market like for X', 'what " +
    "skills are in demand', or 'how hot is this role'. For pay-only questions prefer salaryInsights.",
  inputSchema: z.object({
    role: z
      .string()
      .max(200)
      .describe("Role / job-title keyword to analyse (e.g. 'Product Manager')."),
    location: z
      .string()
      .max(200)
      .optional()
      .describe("Optional location filter (city, state, or country)."),
  }),
  execute: async ({ role, location }) => {
    try {
      const conditions = [ilike(jobs.title, `%${escapeIlike(role)}%`)];
      if (location) {
        const loc = `%${escapeIlike(location)}%`;
        conditions.push(
          or(
            ilike(jobs.locationCity, loc),
            ilike(jobs.locationState, loc),
            ilike(jobs.locationCountry, loc),
          )!,
        );
      }

      const rows = await db
        .select({
          skills: jobs.skills,
          salaryMin: jobs.salaryMin,
          salaryMax: jobs.salaryMax,
          salaryInterval: jobs.salaryInterval,
          isRemote: jobs.isRemote,
          locationCity: jobs.locationCity,
          locationState: jobs.locationState,
          jobLevel: jobs.jobLevel,
          companyName: jobs.companyName,
        })
        .from(jobs)
        .where(and(...conditions))
        .limit(800);

      if (rows.length === 0) {
        return {
          role,
          location: location ?? null,
          demandCount: 0,
          error: `No openings found for "${role}"${location ? ` in ${location}` : ""}. Try a broader title or drop the location.`,
        };
      }

      const insights = computeMarketInsights(
        rows.map((r) => ({
          skills: r.skills ?? null,
          salaryMin: r.salaryMin != null ? Number(r.salaryMin) : null,
          salaryMax: r.salaryMax != null ? Number(r.salaryMax) : null,
          salaryInterval: r.salaryInterval,
          isRemote: r.isRemote,
          locationCity: r.locationCity,
          locationState: r.locationState,
          jobLevel: r.jobLevel,
          companyName: r.companyName,
        })),
      );

      return { role, location: location ?? null, ...insights };
    } catch (err) {
      console.error(
        "[market-insights] execute failed:",
        err instanceof Error ? err.message : err,
      );
      return {
        role,
        location: location ?? null,
        demandCount: 0,
        error: "Something went wrong while analysing the market. Please try again.",
      };
    }
  },
});
