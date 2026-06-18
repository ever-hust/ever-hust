import type { NextConfig } from "next";
import { join } from "node:path";
import withBundleAnalyzer from "@next/bundle-analyzer";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  // Self-contained server bundle for the container image (DOKS/k8s deploy). Vercel ignores this.
  output: "standalone",
  // In a pnpm/Turborepo monorepo, trace workspace deps from the repo root so the standalone
  // bundle includes the @ever-hust/* packages, not just apps/web.
  outputFileTracingRoot: join(import.meta.dirname, "../../"),

  // Instrumentation (apps/web/instrumentation.ts) is auto-detected by Next.js 16+
  transpilePackages: ["@ever-hust/ui", "@ever-hust/auth", "@ever-hust/db", "@ever-hust/utils", "@ever-hust/cv-parser", "@ever-hust/supabase"],

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

  // The public marketing pages moved to the website (hust.so) and docs (docs.hust.so).
  // Redirect the old in-app paths to their new homes so existing links don't 404.
  async redirects() {
    const marketing = process.env.NEXT_PUBLIC_MARKETING_URL || "https://hust.so";
    const docs = process.env.NEXT_PUBLIC_DOCS_URL || "https://docs.hust.so";
    return [
      { source: "/pricing", destination: `${marketing}/pricing`, permanent: false },
      { source: "/privacy", destination: `${marketing}/privacy`, permanent: false },
      // The website uses /tos for terms of service.
      { source: "/terms", destination: `${marketing}/tos`, permanent: false },
      { source: "/docs/api", destination: docs, permanent: false },
      // No dedicated about/contact page on the website yet — send to the home page.
      { source: "/about", destination: marketing, permanent: false },
      { source: "/contact", destination: marketing, permanent: false },
    ];
  },
};

const analyzer = withBundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

export default withNextIntl(analyzer(nextConfig));
