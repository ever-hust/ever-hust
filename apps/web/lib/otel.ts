import { DiagConsoleLogger, DiagLogLevel, diag } from "@opentelemetry/api";

/**
 * OpenTelemetry initialization for the Next.js app.
 *
 * This sets up a diagnostic console logger for OpenTelemetry,
 * which is the foundation for distributed tracing. The actual
 * SDK setup (NodeSDK, SpanExporter, etc.) should be configured
 * in instrumentation.ts for the Node runtime.
 *
 * This file is imported early to ensure the diag is available.
 */

if (process.env.NODE_ENV === "development") {
  diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.INFO);
}

export { diag };
