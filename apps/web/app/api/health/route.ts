import { db } from "@repo/db";
import { sql } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { applyRateLimit } from "../../../lib/rate-limit";

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
    checks.database = {
      status: "error",
      latencyMs: Date.now() - dbStart,
      error: error instanceof Error ? error.message : "Unknown DB error",
    };
  }

  // Check environment variables
  const requiredEnvVars = [
    "DATABASE_URL",
    "BETTER_AUTH_SECRET",
  ];

  const missingEnv = requiredEnvVars.filter((key) => !process.env[key]);
  if (missingEnv.length > 0) {
    checks.environment = {
      status: "error",
      error: `Missing: ${missingEnv.join(", ")}`,
    };
  } else {
    checks.environment = { status: "ok" };
  }

  // Overall status
  const isHealthy = Object.values(checks).every((c) => c.status === "ok");

  // Memory usage
  const mem = process.memoryUsage();

  return NextResponse.json(
    {
      status: isHealthy ? "healthy" : "unhealthy",
      timestamp: new Date().toISOString(),
      version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "dev",
      uptime: Math.round(process.uptime()),
      memory: {
        heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
        heapTotalMB: Math.round(mem.heapTotal / 1024 / 1024),
        rssMB: Math.round(mem.rss / 1024 / 1024),
      },
      checks,
    },
    {
      status: isHealthy ? 200 : 503,
      headers: { "Cache-Control": "no-cache, no-store, must-revalidate" },
    }
  );
}
