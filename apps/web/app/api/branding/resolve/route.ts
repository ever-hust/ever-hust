import { db } from "@repo/db";
import { brandingConfigs } from "@repo/db/schema";
import { eq, isNull, and } from "drizzle-orm";
import { apiSuccess, apiError } from "../../../../lib/api-response";
import { applyRateLimit } from "../../../../lib/rate-limit";

/** Default branding when no config is found in the database. */
const DEFAULT_BRANDING = {
  name: "Ever Jobs",
  logoUrl: null,
  faviconUrl: null,
  primaryColor: "#3b82f6",
  accentColor: "#8b5cf6",
  tagline: "AI-Powered Job Search",
  customFooterHtml: null,
  hideEverJobsBranding: false,
  isCustom: false,
};

/**
 * GET /api/branding/resolve
 * Public endpoint (no auth required) that resolves branding based on the
 * request's host header. First checks for a custom domain match, then
 * falls back to the platform default branding config.
 */
export async function GET(req: Request) {
  // Rate limit by IP for public endpoint (100 req/min)
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rateLimited = applyRateLimit(ip, "publicHighThroughput");
  if (rateLimited) return rateLimited;

  try {
    const forwardedHost = req.headers.get("x-forwarded-host");
    const host = forwardedHost ?? req.headers.get("host");

    // 1. Try to resolve by custom domain
    if (host) {
      const [domainConfig] = await db
        .select()
        .from(brandingConfigs)
        .where(
          and(
            eq(brandingConfigs.customDomain, host),
            eq(brandingConfigs.isActive, true),
          ),
        )
        .limit(1);

      if (domainConfig) {
        return apiSuccess(
          {
            name: domainConfig.name,
            logoUrl: domainConfig.logoUrl,
            faviconUrl: domainConfig.faviconUrl,
            primaryColor: domainConfig.primaryColor ?? DEFAULT_BRANDING.primaryColor,
            accentColor: domainConfig.accentColor ?? DEFAULT_BRANDING.accentColor,
            tagline: domainConfig.tagline ?? DEFAULT_BRANDING.tagline,
            customFooterHtml: domainConfig.customFooterHtml,
            hideEverJobsBranding: domainConfig.hideEverJobsBranding,
            isCustom: true,
          },
          { cacheSeconds: 300 },
        );
      }
    }

    // 2. Fall back to the platform default config (organizationId IS NULL)
    const [platformConfig] = await db
      .select()
      .from(brandingConfigs)
      .where(
        and(
          isNull(brandingConfigs.organizationId),
          eq(brandingConfigs.isActive, true),
        ),
      )
      .limit(1);

    if (platformConfig) {
      return apiSuccess(
        {
          name: platformConfig.name,
          logoUrl: platformConfig.logoUrl,
          faviconUrl: platformConfig.faviconUrl,
          primaryColor: platformConfig.primaryColor ?? DEFAULT_BRANDING.primaryColor,
          accentColor: platformConfig.accentColor ?? DEFAULT_BRANDING.accentColor,
          tagline: platformConfig.tagline ?? DEFAULT_BRANDING.tagline,
          customFooterHtml: platformConfig.customFooterHtml,
          hideEverJobsBranding: platformConfig.hideEverJobsBranding,
          isCustom: true,
        },
        { cacheSeconds: 300 },
      );
    }

    // 3. No config in DB at all — return hardcoded defaults
    return apiSuccess(DEFAULT_BRANDING, { cacheSeconds: 300 });
  } catch (err) {
    console.error(
      "[api/branding/resolve] GET failed:",
      err instanceof Error ? err.message : err,
    );
    return apiError("Failed to resolve branding");
  }
}
