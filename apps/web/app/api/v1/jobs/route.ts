import { db, escapeIlike } from "@repo/db";
import { jobs } from "@repo/db";
import { and, eq, ilike, or, desc, sql } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { validateApiKey } from "../../../../lib/api-key-auth";
import { getSessionUser } from "../../../../lib/get-session-user";
import { checkApiRateLimit } from "../../../../lib/rate-limit";
import { jobsApiQuerySchema } from "../../../../lib/api-schemas";
import {
  apiSuccess,
  apiBadRequest,
  apiUnauthorized,
  apiRateLimited,
  apiError,
} from "../../../../lib/api-response";

// GET /api/v1/jobs - Search jobs (API key or session auth)
export async function GET(req: NextRequest) {
  // Authenticate via API key or session
  let rateLimitKey: string;
  let rateLimitMax: number;

  const apiKeyUser = await validateApiKey(req);
  if (apiKeyUser) {
    rateLimitKey = `api-key:${apiKeyUser.keyId}`;
    rateLimitMax = apiKeyUser.rateLimit;

    // Check scope
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
    rateLimitMax = 100; // default for session users
  }

  // Rate limit
  const rlResult = checkApiRateLimit(rateLimitKey, rateLimitMax, 3_600_000); // per hour
  if (!rlResult.allowed) {
    const retryAfter = Math.ceil((rlResult.resetAt - Date.now()) / 1000);
    return apiRateLimited(retryAfter);
  }

  // Parse query params
  const searchParams = Object.fromEntries(req.nextUrl.searchParams.entries());
  const parsed = jobsApiQuerySchema.safeParse(searchParams);
  if (!parsed.success) {
    const messages = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    return apiBadRequest(messages);
  }
  const { q, location, remote, salaryMin, salaryMax, skills, limit, offset } =
    parsed.data;

  try {
    const conditions = [];

    if (q) {
      const kw = `%${escapeIlike(q)}%`;
      conditions.push(or(ilike(jobs.title, kw), ilike(jobs.description, kw)));
    }

    if (location) {
      const loc = `%${escapeIlike(location)}%`;
      conditions.push(
        or(
          ilike(jobs.locationCity, loc),
          ilike(jobs.locationState, loc),
          ilike(jobs.locationCountry, loc)
        )
      );
    }

    if (remote !== undefined) {
      conditions.push(eq(jobs.isRemote, remote));
    }

    if (salaryMin !== undefined) {
      conditions.push(sql`${jobs.salaryMin}::numeric >= ${salaryMin}`);
    }

    if (salaryMax !== undefined) {
      conditions.push(sql`${jobs.salaryMax}::numeric <= ${salaryMax}`);
    }

    if (skills) {
      const skillList = skills
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (skillList.length > 0) {
        const skillConditions = skillList.map(
          (skill) =>
            sql`${jobs.skills}::jsonb @> ${JSON.stringify([skill])}::jsonb`
        );
        conditions.push(or(...skillConditions));
      }
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    // Run search and count queries in parallel
    const [results, countResult] = await Promise.all([
      db
        .select({
          id: jobs.id,
          externalId: jobs.externalId,
          title: jobs.title,
          companyName: jobs.companyName,
          companyLogo: jobs.companyLogo,
          companyUrl: jobs.companyUrl,
          companyIndustry: jobs.companyIndustry,
          jobUrl: jobs.jobUrl,
          applyUrl: jobs.applyUrl,
          locationCity: jobs.locationCity,
          locationState: jobs.locationState,
          locationCountry: jobs.locationCountry,
          isRemote: jobs.isRemote,
          jobType: jobs.jobType,
          description: jobs.description,
          skills: jobs.skills,
          department: jobs.department,
          employmentType: jobs.employmentType,
          jobLevel: jobs.jobLevel,
          jobFunction: jobs.jobFunction,
          salaryMin: jobs.salaryMin,
          salaryMax: jobs.salaryMax,
          salaryCurrency: jobs.salaryCurrency,
          salaryInterval: jobs.salaryInterval,
          datePosted: jobs.datePosted,
          createdAt: jobs.createdAt,
        })
        .from(jobs)
        .where(where)
        .orderBy(desc(jobs.datePosted))
        .limit(limit)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)` })
        .from(jobs)
        .where(where),
    ]);

    const total = Number(countResult[0]?.count ?? 0);

    return apiSuccess(
      {
        jobs: results,
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      },
      {
        cacheSeconds: 60,
        headers: {
          "X-RateLimit-Limit": String(rateLimitMax),
          "X-RateLimit-Remaining": String(rlResult.remaining),
        },
      }
    );
  } catch (err) {
    console.error(
      "[api/v1/jobs] GET failed:",
      err instanceof Error ? err.message : err
    );
    return apiError("Failed to search jobs");
  }
}
