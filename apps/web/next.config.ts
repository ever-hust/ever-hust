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

  // Security headers applied via middleware (middleware.ts) which supports
  // environment-aware CSP, HSTS, and auth redirects. Only non-CSP headers
  // that should apply to static assets (not matched by middleware) are here.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
