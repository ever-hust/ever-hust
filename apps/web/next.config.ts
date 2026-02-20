import type { NextConfig } from "next";
import withBundleAnalyzer from "@next/bundle-analyzer";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  // Instrumentation (apps/web/instrumentation.ts) is auto-detected by Next.js 16+
  transpilePackages: ["@repo/ui", "@repo/auth", "@repo/db", "@repo/utils", "@repo/cv-parser", "@repo/supabase"],

  // Enable response compression (gzip/brotli)
  compress: true,

  // Tree-shake barrel exports for icon and UI libraries
  experimental: {
    optimizePackageImports: ["lucide-react", "recharts"],
  },

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

  // Security headers are applied by proxy.ts (Next.js 16.1 proxy, formerly middleware)
  // which provides environment-aware CSP, HSTS, and auth redirects for all matched routes.
  // No headers() config here to avoid duplication / mismatched values.
};

const analyzer = withBundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

export default withNextIntl(analyzer(nextConfig));
