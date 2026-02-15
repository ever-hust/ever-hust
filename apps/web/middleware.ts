import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const protectedRoutes = ["/dashboard", "/chat", "/jobs", "/profile", "/settings"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Check if it's a protected route
  const isProtected = protectedRoutes.some((route) =>
    pathname.startsWith(route)
  );

  // Redirect /dashboard to /dashboard/chat
  if (pathname === "/dashboard") {
    const chatUrl = new URL("/dashboard/chat", request.url);
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
