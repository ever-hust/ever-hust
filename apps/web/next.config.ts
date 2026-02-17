import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Instrumentation (apps/web/instrumentation.ts) is auto-detected by Next.js 16+
  transpilePackages: ["@repo/ui", "@repo/auth", "@repo/db", "@repo/utils", "@repo/cv-parser"],

  // Enable response compression (gzip/brotli)
  compress: true,

  // Remove the X-Powered-By header to reduce fingerprinting surface
  poweredByHeader: false,

  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "media.licdn.com",
      },
      {
        protocol: "https",
        hostname: "*.supabase.co",
      },
      {
        protocol: "https",
        hostname: "logo.clearbit.com",
      },
    ],
  },

  // Security headers are applied by middleware.ts which provides
  // environment-aware CSP, HSTS, and auth redirects for all matched routes.
  // No headers() config here to avoid duplication / mismatched values.
};

export default nextConfig;
