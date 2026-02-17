import { timingSafeEqual } from "crypto";
import { db } from "@repo/db";
import { sql } from "drizzle-orm";
import { type NextRequest } from "next/server";
import { applyRateLimit } from "../../../lib/rate-limit";
import { apiSuccess } from "../../../lib/api-response";

/**
 * Health check endpoint for monitoring and uptime checks.
 *
 * GET /api/health
 *
 * Returns:
 * - 200 if the service is healthy (DB connection works)
 * - 503 if any critical dependency is down
 */
export async function GET(req: NextRequest) {
  // Rate limit by IP to prevent abuse of system info endpoint
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rateLimited = applyRateLimit(ip, "public");
  if (rateLimited) return rateLimited;

  const checks: Record<string, { status: "ok" | "error"; latencyMs?: number; error?: string }> = {};

  // Check database connectivity
  const dbStart = Date.now();
  try {
    await db.execute(sql`SELECT 1`);
    checks.database = { status: "ok", latencyMs: Date.now() - dbStart };
  } catch (error) {
    console.error("[api/health] Database check failed:", error instanceof Error ? error.message : error);
    checks.database = {
      status: "error",
      latencyMs: Date.now() - dbStart,
    };
  }

  // Check environment variables (don't leak names in response)
  const requiredEnvVars = [
    "DATABASE_URL",
    "BETTER_AUTH_SECRET",
  ];

  const missingCount = requiredEnvVars.filter((key) => !process.env[key]).length;
  if (missingCount > 0) {
    checks.environment = { status: "error" };
  } else {
    checks.environment = { status: "ok" };
  }

  // Overall status
  const isHealthy = Object.values(checks).every((c) => c.status === "ok");

  // Only expose detailed telemetry to internal callers that provide the health
  // token. Public consumers get a minimal status-only response.
  const healthToken = req.headers.get("x-health-token");
  const configuredToken = process.env.HEALTH_CHECK_TOKEN;
  const isInternal =
    !!healthToken &&
    !!configuredToken &&
    healthToken.length === configuredToken.length &&
    timingSafeEqual(Buffer.from(healthToken), Buffer.from(configuredToken));

  const body: Record<string, unknown> = {
    status: isHealthy ? "healthy" : "unhealthy",
    timestamp: new Date().toISOString(),
    checks,
  };

  if (isInternal) {
    const mem = process.memoryUsage();
    body.version = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "dev";
    body.uptime = Math.round(process.uptime());
    body.memory = {
      heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
      heapTotalMB: Math.round(mem.heapTotal / 1024 / 1024),
      rssMB: Math.round(mem.rss / 1024 / 1024),
    };
  }

  return apiSuccess(body, { status: isHealthy ? 200 : 503, cacheSeconds: 0 });
}
