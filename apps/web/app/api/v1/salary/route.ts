import { db, escapeIlike } from "@ever-hust/db";
import { jobs } from "@ever-hust/db";
import { and, ilike, isNotNull, or } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { validateApiKey } from "../../../../lib/api-key-auth";
import { getSessionUser } from "../../../../lib/get-session-user";
import { checkApiRateLimit } from "../../../../lib/rate-limit";
import { salaryApiQuerySchema } from "../../../../lib/api-schemas";
import {
  apiSuccess,
  apiBadRequest,
  apiUnauthorized,
  apiRateLimited,
  apiError,
} from "../../../../lib/api-response";
import { annualise, median } from "@ever-hust/ai/tools/salary-helpers";

// GET /api/v1/salary - Salary insights (API key or session auth)
export async function GET(req: NextRequest) {
  // Authenticate via API key or session
  let rateLimitKey: string;
  let rateLimitMax: number;

  const apiKeyUser = await validateApiKey(req);
  if (apiKeyUser) {
    rateLimitKey = `api-key:${apiKeyUser.keyId}`;
    rateLimitMax = apiKeyUser.rateLimit;

    if (!apiKeyUser.scopes.includes("read")) {
      return apiUnauthorized("API key does not have 'read' scope");
    }
  } else {
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return apiUnauthorized(
        "Provide a valid API key via Authorization header or sign in"
      );
    }
    rateLimitKey = `v1-session:${sessionUser.id}`;
    rateLimitMax = 100;
  }

  // Rate limit
  const rlResult = checkApiRateLimit(rateLimitKey, rateLimitMax, 3_600_000);
  if (!rlResult.allowed) {
    const retryAfter = Math.ceil((rlResult.resetAt - Date.now()) / 1000);
    return apiRateLimited(retryAfter);
  }

  // Parse query params
  const searchParams = Object.fromEntries(req.nextUrl.searchParams.entries());
  const parsed = salaryApiQuerySchema.safeParse(searchParams);
  if (!parsed.success) {
    const messages = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    return apiBadRequest(messages);
  }
  const { title, location, level } = parsed.data;

  try {
    const titlePattern = `%${escapeIlike(title)}%`;

    const conditions = [
      ilike(jobs.title, titlePattern),
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

    if (level) {
      conditions.push(ilike(jobs.jobLevel, `%${escapeIlike(level)}%`));
    }

    const matchingJobs = await db
      .select({
        salaryMin: jobs.salaryMin,
        salaryMax: jobs.salaryMax,
        salaryCurrency: jobs.salaryCurrency,
        salaryInterval: jobs.salaryInterval,
        jobLevel: jobs.jobLevel,
        isRemote: jobs.isRemote,
        companyName: jobs.companyName,
      })
      .from(jobs)
      .where(and(...conditions))
      .limit(500);

    if (matchingJobs.length === 0) {
      return apiSuccess({
        title,
        location: location ?? null,
        level: level ?? null,
        sampleSize: 0,
        message: `No salary data found for "${title}"${location ? ` in ${location}` : ""}${level ? ` at ${level} level` : ""}. Try broadening your search.`,
      });
    }

    // Normalise all salaries to annual figures
    interface NormalisedEntry {
      annualMin: number | null;
      annualMax: number | null;
      annualMid: number;
      currency: string | null;
      jobLevel: string | null;
      isRemote: boolean | null;
      companyName: string | null;
    }

    const normalised: NormalisedEntry[] = [];

    for (const job of matchingJobs) {
      const rawMin = job.salaryMin ? Number(job.salaryMin) : null;
      const rawMax = job.salaryMax ? Number(job.salaryMax) : null;

      if (rawMin == null && rawMax == null) continue;
      if ((rawMin != null && isNaN(rawMin)) || (rawMax != null && isNaN(rawMax)))
        continue;

      const annMin =
        rawMin != null ? annualise(rawMin, job.salaryInterval) : null;
      const annMax =
        rawMax != null ? annualise(rawMax, job.salaryInterval) : null;

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
        currency: job.salaryCurrency,
        jobLevel: job.jobLevel,
        isRemote: job.isRemote,
        companyName: job.companyName,
      });
    }

    if (normalised.length === 0) {
      return apiSuccess({
        title,
        location: location ?? null,
        level: level ?? null,
        sampleSize: 0,
        message:
          "Found matching jobs but could not parse salary data.",
      });
    }

    // Compute statistics
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

    const p25Index = Math.floor(midpoints.length * 0.25);
    const p75Index = Math.floor(midpoints.length * 0.75);
    const p25 = Math.round(midpoints[p25Index]!);
    const p75 = Math.round(
      midpoints[Math.min(p75Index, midpoints.length - 1)]!
    );

    // Determine dominant currency
    const currencyCounts = new Map<string, number>();
    for (const j of normalised) {
      const cur = j.currency?.toUpperCase() ?? "USD";
      currencyCounts.set(cur, (currencyCounts.get(cur) ?? 0) + 1);
    }
    let dominantCurrency = "USD";
    let maxCurrencyCount = 0;
    for (const [cur, cnt] of currencyCounts) {
      if (cnt > maxCurrencyCount) {
        dominantCurrency = cur;
        maxCurrencyCount = cnt;
      }
    }

    // Breakdown by level
    const levelMap = new Map<
      string,
      { midpoints: number[]; count: number }
    >();
    for (const j of normalised) {
      const lvl = j.jobLevel?.toLowerCase() ?? "unspecified";
      const entry = levelMap.get(lvl);
      if (entry) {
        entry.midpoints.push(j.annualMid);
        entry.count++;
      } else {
        levelMap.set(lvl, { midpoints: [j.annualMid], count: 1 });
      }
    }

    const byLevel = [...levelMap.entries()]
      .map(([lvl, data]) => {
        const sorted = data.midpoints.sort((a, b) => a - b);
        return {
          level: lvl,
          count: data.count,
          median: Math.round(median(sorted)),
          min: Math.round(sorted[0]!),
          max: Math.round(sorted[sorted.length - 1]!),
        };
      })
      .sort((a, b) => b.median - a.median);

    return apiSuccess(
      {
        title,
        location: location ?? null,
        level: level ?? null,
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
      },
      {
        cacheSeconds: 300,
        headers: {
          "X-RateLimit-Limit": String(rateLimitMax),
          "X-RateLimit-Remaining": String(rlResult.remaining),
        },
      }
    );
  } catch (err) {
    console.error(
      "[api/v1/salary] GET failed:",
      err instanceof Error ? err.message : err
    );
    return apiError("Failed to compute salary insights");
  }
}
