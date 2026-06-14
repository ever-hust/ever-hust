import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const protectedRoutes = ["/chat", "/dashboard", "/jobs", "/profile", "/settings", "/applications", "/favorites", "/admin", "/organizations"];

// ---------------------------------------------------------------------------
// Security headers applied to all responses
// ---------------------------------------------------------------------------

function applySecurityHeaders(response: NextResponse): NextResponse {
  // Prevent MIME-type sniffing
  response.headers.set("X-Content-Type-Options", "nosniff");

  // Prevent clickjacking
  response.headers.set("X-Frame-Options", "DENY");

  // Enable XSS protection (legacy but still useful)
  response.headers.set("X-XSS-Protection", "1; mode=block");

  // Control referrer information
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

  // Permissions policy (opt-out of unused browser features)
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), interest-cohort=()"
  );

  // Content Security Policy
  // Next.js requires 'unsafe-inline' for styles and 'unsafe-eval' in dev.
  // In production, we use a stricter policy.
  const isProd = process.env.NODE_ENV === "production";
  const cspDirectives = [
    "default-src 'self'",
    // Scripts: self + Next.js inline scripts (nonce not feasible with App Router streaming)
    // Stripe.js is loaded inside the Stripe checkout iframe (frame-src allows it)
    `script-src 'self' 'unsafe-inline' https://js.stripe.com https://va.vercel-scripts.com https://maps.googleapis.com${isProd ? "" : " 'unsafe-eval'"}`,
    // Styles: self + inline for Next.js CSS-in-JS / Tailwind
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    // Images: self + company logos from external sources + data URIs for placeholders
    `img-src 'self' data: blob: https: https://maps.gstatic.com https://maps.googleapis.com${isProd ? "" : " http:"}`,
    // Fonts: self + Google Fonts CDN (fallback; next/font/google self-hosts)
    "font-src 'self' https://fonts.gstatic.com",
    // Connect: self + Stripe + Supabase Realtime (browser-initiated connections only)
    `connect-src 'self' https://api.stripe.com https://*.supabase.co wss://*.supabase.co https://va.vercel-scripts.com https://maps.googleapis.com${isProd ? "" : " ws://localhost:* http://localhost:*"}`,
    // Frames: Stripe checkout + portal
    "frame-src 'self' https://js.stripe.com https://hooks.stripe.com",
    // Block all plugins (Flash, Java applets, etc.)
    "object-src 'none'",
    // Form targets
    "form-action 'self'",
    // Base URI restriction
    "base-uri 'self'",
    // Prevent embedding
    "frame-ancestors 'none'",
    // Upgrade HTTP requests to HTTPS in production
    ...(isProd ? ["upgrade-insecure-requests"] : []),
  ];

  response.headers.set(
    "Content-Security-Policy",
    cspDirectives.join("; ")
  );

  // Strict transport security (only in production)
  if (isProd) {
    response.headers.set(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains; preload"
    );
  }

  return response;
}

// ---------------------------------------------------------------------------
// Proxy (formerly middleware — renamed per Next.js 16.1 convention)
// ---------------------------------------------------------------------------

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // If user visits root "/" and has a session → redirect to dashboard
  if (pathname === "/") {
    const sessionToken =
      request.cookies.get("__Secure-better-auth.session_token")?.value ??
      request.cookies.get("better-auth.session_token")?.value;
    if (sessionToken) {
      const dashboardUrl = new URL("/dashboard", request.url);
      return NextResponse.redirect(dashboardUrl);
    }
    return applySecurityHeaders(NextResponse.next());
  }

  // Check if it's a protected route
  const isProtected = protectedRoutes.some((route) =>
    pathname.startsWith(route)
  );

  if (!isProtected) {
    return applySecurityHeaders(NextResponse.next());
  }

  // Check for BetterAuth session cookie.
  // In production with HTTPS, Better Auth prefixes cookies with "__Secure-".
  // Check both variants to handle all environments correctly.
  const sessionToken =
    request.cookies.get("__Secure-better-auth.session_token")?.value ??
    request.cookies.get("better-auth.session_token")?.value;

  if (!sessionToken) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return applySecurityHeaders(NextResponse.next());
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
