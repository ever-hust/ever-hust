// Sentry configuration for the Next.js app
// This file is auto-imported by @sentry/nextjs
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Performance Monitoring
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,

  // Session Replay — only in production
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,

  // Set environment
  environment: process.env.NODE_ENV || "development",

  // Enable debug in development
  debug: process.env.NODE_ENV === "development",

  // Release tracking
  release: process.env.NEXT_PUBLIC_APP_VERSION || "dev",

  // Filter out known non-actionable errors
  beforeSend(event) {
    // Ignore ResizeObserver loop errors (browser noise)
    if (event.message?.includes("ResizeObserver loop")) {
      return null;
    }
    return event;
  },

  // Integrations
  integrations: [
    Sentry.replayIntegration({
      maskAllText: false,
      blockAllMedia: false,
    }),
  ],
});
