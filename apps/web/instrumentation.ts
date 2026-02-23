/**
 * Next.js Instrumentation — Startup Checks & Langfuse Tracing
 *
 * This file is automatically loaded by Next.js on server startup.
 *
 * 1. Runs startup validation checks (env vars, cross-field rules).
 * 2. Sets up the OpenTelemetry SDK with the Langfuse span processor,
 *    which sends all AI SDK traces to Langfuse Cloud for observability.
 *
 * Environment variables required for tracing:
 *   LANGFUSE_PUBLIC_KEY   - Langfuse project public key
 *   LANGFUSE_SECRET_KEY   - Langfuse project secret key
 *   LANGFUSE_BASE_URL     - Langfuse host (default: https://cloud.langfuse.com)
 *
 * When tracing vars are not set, tracing is silently disabled.
 *
 * @see https://langfuse.com/docs/observability/sdk/typescript/instrumentation
 * @see https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */
export async function register() {
  // Only run on the server (Node.js runtime)
  if (typeof window !== "undefined") return;

  // -------------------------------------------------------------------------
  // 1. Startup validation — validate env vars, log warnings for missing ones.
  //    Critical missing vars will throw and prevent the server from starting.
  // -------------------------------------------------------------------------
  const { runStartupChecks } = await import("./lib/startup-checks");
  runStartupChecks();

  // -------------------------------------------------------------------------
  // 1b. Ensure DB schema is up-to-date (idempotent ALTER TABLE IF NOT EXISTS)
  // -------------------------------------------------------------------------
  if (process.env.DATABASE_URL) {
    try {
      const { ensureJobsColumns } = await import("@ever-hust/db/ensure-columns");
      await ensureJobsColumns(process.env.DATABASE_URL);
    } catch (error) {
      console.warn(
        "[db] Schema migration failed (non-fatal):",
        error instanceof Error ? error.message : error,
      );
    }
  }

  // -------------------------------------------------------------------------
  // 2. Langfuse / OpenTelemetry tracing
  // -------------------------------------------------------------------------
  const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
  const secretKey = process.env.LANGFUSE_SECRET_KEY;

  if (!publicKey || !secretKey) {
    console.log("[langfuse] Tracing disabled — LANGFUSE keys not configured");
    return;
  }

  try {
    // Dynamic imports to avoid bundling OTEL in the client
    const { NodeSDK } = await import("@opentelemetry/sdk-node");
    const { LangfuseSpanProcessor } = await import("@langfuse/otel");

    const sdk = new NodeSDK({
      spanProcessors: [new LangfuseSpanProcessor()],
    });

    sdk.start();

    console.log("[langfuse] OpenTelemetry tracing initialized");
  } catch (error) {
    console.warn(
      "[langfuse] Failed to initialize tracing:",
      error instanceof Error ? error.message : error,
    );
  }
}
