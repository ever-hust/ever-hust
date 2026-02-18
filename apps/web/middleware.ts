import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const protectedRoutes = ["/chat", "/jobs", "/profile", "/settings", "/applications", "/favorites"];

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
    `script-src 'self' 'unsafe-inline'${isProd ? "" : " 'unsafe-eval'"}`,
    // Styles: self + inline for Next.js CSS-in-JS / Tailwind
    "style-src 'self' 'unsafe-inline'",
    // Images: self + company logos from external sources + data URIs for placeholders
    `img-src 'self' data: blob: https:${isProd ? "" : " http:"}`,
    // Fonts: self + Google Fonts CDN
    "font-src 'self' https://fonts.gstatic.com",
    // Connect: self + Stripe + Supabase + API domains
    `connect-src 'self' https://api.stripe.com https://*.supabase.co wss://*.supabase.co https://api.resend.com`,
    // Frames: Stripe checkout + portal
    "frame-src 'self' https://js.stripe.com https://hooks.stripe.com",
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
// Middleware
// ---------------------------------------------------------------------------

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Check if it's a protected route
  const isProtected = protectedRoutes.some((route) =>
    pathname.startsWith(route)
  );

  // Redirect /dashboard to /chat
  if (pathname === "/dashboard") {
    const chatUrl = new URL("/chat", request.url);
    return NextResponse.redirect(chatUrl);
  }

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
