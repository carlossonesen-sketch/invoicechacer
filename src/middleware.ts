import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  // Check for session cookie (new Firebase auth) or legacy auth cookie (for migration)
  const sessionCookie = request.cookies.get("invoicechaser_session");
  const legacyCookie = request.cookies.get("invoicechaser_auth");
  const hasAuth = !!(sessionCookie?.value || legacyCookie?.value);
  
  const isLoginPage = request.nextUrl.pathname === "/login";
  const isApiRoute = request.nextUrl.pathname.startsWith("/api");

  // Allow API routes to pass through (they handle auth internally)
  if (isApiRoute) {
    return NextResponse.next();
  }

  // If user is trying to access login page and is already authenticated, redirect to home
  if (isLoginPage && hasAuth) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  // If user is not authenticated and trying to access protected routes, redirect to login
  if (!isLoginPage && !hasAuth) {
    const loginUrl = new URL("/login", request.url);
    // Preserve the original URL to redirect back after login
    loginUrl.searchParams.set("redirect", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (images, etc.)
     */
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
