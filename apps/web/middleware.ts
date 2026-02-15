import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Route group (dashboard) does NOT add a URL segment.
// Actual URLs: /chat, /jobs, /jobs/[id], /profile, /settings
const protectedRoutes = ["/chat", "/jobs", "/profile", "/settings"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Check if it's a protected route
  const isProtected = protectedRoutes.some((route) =>
    pathname.startsWith(route)
  );

  // Legacy redirect: /dashboard → /chat
  if (pathname === "/dashboard" || pathname.startsWith("/dashboard/")) {
    const chatUrl = new URL("/chat", request.url);
    return NextResponse.redirect(chatUrl);
  }

  if (!isProtected) {
    return NextResponse.next();
  }

  // Check for BetterAuth session cookie
  const sessionToken =
    request.cookies.get("better-auth.session_token")?.value;

  if (!sessionToken) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
