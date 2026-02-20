// ILIKE search on the jobs table may be slow on large datasets — allow up to 30s
export const maxDuration = 30;

import { db, escapeIlike } from "@repo/db";
import { jobs } from "@repo/db/schema";
import { count, desc, ilike, or } from "drizzle-orm";
import type { NextResponse } from "next/server";
import { requireRole } from "../../../../lib/auth-roles";
import { applyRateLimit } from "../../../../lib/rate-limit";
import { adminJobsQuerySchema } from "../../../../lib/api-schemas";
import { apiSuccess, apiBadRequest, apiError } from "../../../../lib/api-response";

export async function GET(req: Request) {
  let admin;
  try {
    admin = await requireRole("admin");
  } catch (response) {
    return response as NextResponse;
  }

  const rateLimited = applyRateLimit(admin.id, "admin");
  if (rateLimited) return rateLimited;

  try {
    const url = new URL(req.url);
    const rawParams = {
      page: url.searchParams.get("page") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
      q: url.searchParams.get("q") ?? undefined,
    };

    const validation = adminJobsQuerySchema.safeParse(rawParams);
    if (!validation.success) {
      const messages = validation.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ");
      return apiBadRequest(messages);
    }

    const { page, limit, q } = validation.data;
    const offset = (page - 1) * limit;

    // Build search condition
    const searchCondition = q
      ? or(
          ilike(jobs.title, `%${escapeIlike(q)}%`),
          ilike(jobs.companyName, `%${escapeIlike(q)}%`),
        )
      : undefined;

    // Run count and data queries in parallel
    const [totalResult, jobList] = await Promise.all([
      db
        .select({ value: count() })
        .from(jobs)
        .where(searchCondition),
      db
        .select({
          id: jobs.id,
          title: jobs.title,
          companyName: jobs.companyName,
          locationCity: jobs.locationCity,
          locationState: jobs.locationState,
          locationCountry: jobs.locationCountry,
          isRemote: jobs.isRemote,
          jobLevel: jobs.jobLevel,
          site: jobs.site,
          datePosted: jobs.datePosted,
          createdAt: jobs.createdAt,
        })
        .from(jobs)
        .where(searchCondition)
        .orderBy(desc(jobs.createdAt))
        .limit(limit)
        .offset(offset),
    ]);

    const total = totalResult[0]?.value ?? 0;
    const totalPages = Math.ceil(total / limit);

    return apiSuccess({
      jobs: jobList,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    });
  } catch (err) {
    console.error(
      "[api/admin/jobs] GET failed:",
      err instanceof Error ? err.message : err,
    );
    return apiError("Failed to fetch jobs");
  }
}
