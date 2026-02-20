import { db, escapeIlike } from "@repo/db";
import { jobs } from "@repo/db";
import { ilike, sql, isNotNull } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { validateApiKey } from "../../../../lib/api-key-auth";
import { getSessionUser } from "../../../../lib/get-session-user";
import { checkApiRateLimit } from "../../../../lib/rate-limit";
import { companiesApiQuerySchema } from "../../../../lib/api-schemas";
import {
  apiSuccess,
  apiBadRequest,
  apiUnauthorized,
  apiRateLimited,
  apiError,
} from "../../../../lib/api-response";

// GET /api/v1/companies - Search companies (API key or session auth)
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
  const parsed = companiesApiQuerySchema.safeParse(searchParams);
  if (!parsed.success) {
    const messages = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    return apiBadRequest(messages);
  }
  const { q, limit } = parsed.data;

  try {
    // Build conditions: only include jobs that have a company name
    const conditions = [isNotNull(jobs.companyName)];

    if (q) {
      const pattern = `%${escapeIlike(q)}%`;
      conditions.push(ilike(jobs.companyName, pattern));
    }

    // Aggregate company data from the jobs table
    const whereClause = sql.join(
      conditions.map((c, i) => (i === 0 ? c : sql` AND ${c}`)),
      sql``
    );

    const companiesResult = await db.execute(sql`
      SELECT
        ${jobs.companyName} AS "companyName",
        MAX(${jobs.companyUrl}) AS "companyUrl",
        MAX(${jobs.companyLogo}) AS "companyLogo",
        MAX(${jobs.companyIndustry}) AS "companyIndustry",
        MAX(${jobs.companyNumEmployees}) AS "companySize",
        MAX(${jobs.companyDescription}) AS "companyDescription",
        COUNT(*)::int AS "jobCount",
        MIN(${jobs.salaryMin}::numeric)::text AS "salaryMin",
        MAX(${jobs.salaryMax}::numeric)::text AS "salaryMax"
      FROM ${jobs}
      WHERE ${whereClause}
      GROUP BY ${jobs.companyName}
      ORDER BY COUNT(*) DESC
      LIMIT ${limit}
    `);

    // Get total distinct companies count
    const countResult = await db.execute(sql`
      SELECT COUNT(DISTINCT ${jobs.companyName})::int AS total
      FROM ${jobs}
      WHERE ${whereClause}
    `);

    const countRows = countResult as unknown as Array<{ total: number }>;
    const total = Number(countRows[0]?.total ?? 0);

    const companyRows = companiesResult as unknown as Array<Record<string, unknown>>;
    const companies = companyRows.map((row) => ({
      companyName: row.companyName as string,
      companyUrl: (row.companyUrl as string | null) ?? null,
      companyLogo: (row.companyLogo as string | null) ?? null,
      companyIndustry: (row.companyIndustry as string | null) ?? null,
      companySize: (row.companySize as string | null) ?? null,
      companyDescription: (row.companyDescription as string | null)
        ? ((row.companyDescription as string).length > 500
            ? (row.companyDescription as string).substring(0, 500) + "..."
            : (row.companyDescription as string))
        : null,
      jobCount: row.jobCount as number,
      salaryMin: row.salaryMin ? Number(row.salaryMin) : null,
      salaryMax: row.salaryMax ? Number(row.salaryMax) : null,
    }));

    return apiSuccess(
      {
        companies,
        total,
      },
      {
        cacheSeconds: 120,
        headers: {
          "X-RateLimit-Limit": String(rateLimitMax),
          "X-RateLimit-Remaining": String(rlResult.remaining),
        },
      }
    );
  } catch (err) {
    console.error(
      "[api/v1/companies] GET failed:",
      err instanceof Error ? err.message : err
    );
    return apiError("Failed to search companies");
  }
}
