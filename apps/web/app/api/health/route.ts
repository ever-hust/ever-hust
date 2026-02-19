import { timingSafeEqual } from "crypto";
import { db } from "@repo/db";
import { sql } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { applyRateLimit } from "../../../lib/rate-limit";
import { apiSuccess } from "../../../lib/api-response";

/**
 * Health check endpoint for monitoring, uptime checks, and load balancers.
 *
 * GET  /api/health — Returns JSON health status
 * HEAD /api/health — Returns 200/503 with no body (for load balancer pings)
 *
 * Public consumers get a basic response (status, timestamp, version, uptime).
 * Internal callers that provide a valid `x-health-token` header also get
 * memory usage and detailed dependency check info.
 *
 * Returns:
 * - 200 if the service is healthy (DB connection works)
 * - 503 if any critical dependency is down
 */

/** Server start time — used to calculate uptime. */
const startedAt = Date.now();

/** Timeout for the database connectivity check (ms). */
const DB_CHECK_TIMEOUT_MS = 3_000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function checkDatabase(): Promise<{
  status: "ok" | "error";
  latencyMs: number;
  error?: string;
}> {
  const start = Date.now();
  try {
    // Race the DB query against a timeout so a hung connection doesn't
    // block the entire health check response.
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Database check timed out")), DB_CHECK_TIMEOUT_MS),
    );
    await Promise.race([db.execute(sql`SELECT 1`), timeout]);
    return { status: "ok", latencyMs: Date.now() - start };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[api/health] Database check failed:", message);
    return { status: "error", latencyMs: Date.now() - start, error: message };
  }
}

function checkEnvironment(): { status: "ok" | "error"; missingCount?: number } {
  const requiredEnvVars = ["DATABASE_URL", "BETTER_AUTH_SECRET"];
  const missingCount = requiredEnvVars.filter((key) => !process.env[key]).length;
  return missingCount > 0
    ? { status: "error", missingCount }
    : { status: "ok" };
}

function isInternalCaller(req: NextRequest): boolean {
  const healthToken = req.headers.get("x-health-token");
  const configuredToken = process.env.HEALTH_CHECK_TOKEN;
  if (!healthToken || !configuredToken) return false;
  if (healthToken.length !== configuredToken.length) return false;
  return timingSafeEqual(Buffer.from(healthToken), Buffer.from(configuredToken));
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  // Rate limit by IP to prevent abuse of system info endpoint
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rateLimited = applyRateLimit(ip, "public");
  if (rateLimited) return rateLimited;

  // Run dependency checks in parallel
  const [dbCheck, envCheck] = await Promise.all([
    checkDatabase(),
    Promise.resolve(checkEnvironment()),
  ]);

  const checks = { database: dbCheck, environment: envCheck };
  const isHealthy = Object.values(checks).every((c) => c.status === "ok");

  // Build response body — public fields always included
  const body: Record<string, unknown> = {
    status: isHealthy ? "healthy" : "unhealthy",
    timestamp: new Date().toISOString(),
    version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local",
    uptime: Math.round((Date.now() - startedAt) / 1000),
  };

  // Internal callers get detailed telemetry
  if (isInternalCaller(req)) {
    const mem = process.memoryUsage();
    body.checks = checks;
    body.memory = {
      heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
      heapTotalMB: Math.round(mem.heapTotal / 1024 / 1024),
      rssMB: Math.round(mem.rss / 1024 / 1024),
    };
  }

  return apiSuccess(body, { status: isHealthy ? 200 : 503, cacheSeconds: 0 });
}

/**
 * HEAD handler — lightweight ping for load balancers and uptime monitors.
 * Runs the same checks but returns no body (Next.js strips it automatically).
 */
export async function HEAD() {
  // Lightweight — skip rate limiting for HEAD (load balancers may ping frequently)
  const dbCheck = await checkDatabase();
  const envCheck = checkEnvironment();
  const isHealthy = dbCheck.status === "ok" && envCheck.status === "ok";

  return new NextResponse(null, {
    status: isHealthy ? 200 : 503,
    headers: {
      "Cache-Control": "no-cache, no-store, must-revalidate",
    },
  });
}
