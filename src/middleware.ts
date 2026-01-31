import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Paths that trial-expired (and not paid) users may access.
 * Any other route redirects to /pricing?reason=trial_expired.
 * To extend the allowlist later: add entries to TRIAL_ALLOWLIST_PREFIXES (e.g. "/help")
 * or add a custom check in isTrialAllowlisted (e.g. pathname.startsWith("/new-area")).
 */
const TRIAL_ALLOWLIST_PREFIXES = [
  "/",
  "/login",
  "/dashboard",
  "/invoices",
  "/settings",
  "/pricing",
  "/onboarding",
  "/business-profile",
] as const;

function isTrialAllowlisted(pathname: string): boolean {
  if (pathname === "/") return true;
  return TRIAL_ALLOWLIST_PREFIXES.some((p) => p !== "/" && (pathname === p || pathname.startsWith(p + "/")));
}

/** Paths unauthenticated users may access (others redirect to login). */
const UNAUTH_PUBLIC_PREFIXES = ["/", "/login", "/forgot-password", "/pricing", "/terms", "/privacy"] as const;

function isUnauthPublic(pathname: string): boolean {
  if (pathname === "/") return true;
  return UNAUTH_PUBLIC_PREFIXES.some((p) => p !== "/" && (pathname === p || pathname.startsWith(p + "/")));
}

export async function middleware(request: NextRequest) {
  // Kill-switch: 404 all /api/dev when DISABLE_DEV_ENDPOINTS=true
  if (request.nextUrl.pathname.startsWith("/api/dev") && process.env.DISABLE_DEV_ENDPOINTS === "true") {
    return new NextResponse(null, { status: 404 });
  }

  // API routes pass through (they handle auth internally; /api/auth/trial-status is called by middleware only)
  if (request.nextUrl.pathname.startsWith("/api")) {
    return NextResponse.next();
  }

  const sessionCookie = request.cookies.get("invoicechaser_session");
  const legacyCookie = request.cookies.get("invoicechaser_auth");
  const hasAuth = !!(sessionCookie?.value || legacyCookie?.value);
  const pathname = request.nextUrl.pathname;

  // Unauthenticated: only allow public paths, else redirect to login
  if (!hasAuth) {
    if (pathname === "/login") return NextResponse.next();
    if (isUnauthPublic(pathname)) return NextResponse.next();
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Authenticated on login page -> send home
  if (pathname === "/login") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  // Terms acceptance gate: authenticated users must have accepted current terms
  const TERMS_ALLOWLIST = ["/accept-terms", "/terms", "/privacy"] as const;
  const isTermsAllowlisted = TERMS_ALLOWLIST.some((p) => pathname === p || pathname.startsWith(p + "/"));
  if (!isTermsAllowlisted) {
    try {
      const termsStatusUrl = new URL("/api/auth/terms-status", request.url);
      const termsRes = await fetch(termsStatusUrl.toString(), {
        headers: { Cookie: request.headers.get("cookie") ?? "" },
        cache: "no-store",
      });
      const termsData = (await termsRes.json()) as { accepted?: boolean };
      if (!termsData.accepted) {
        return NextResponse.redirect(new URL("/accept-terms", request.url));
      }
    } catch {
      // On failure, allow through to avoid blocking
    }
  }

  // Trial-expired paywall: if path is allowlisted, continue; else check trial and redirect if expired+not paid
  if (isTrialAllowlisted(pathname)) {
    return NextResponse.next();
  }

  // Call server-side trial-status (same origin; cookies forwarded)
  const trialStatusUrl = new URL("/api/auth/trial-status", request.url);
  try {
    const res = await fetch(trialStatusUrl.toString(), {
      headers: { Cookie: request.headers.get("cookie") ?? "" },
      cache: "no-store",
    });
    const data = (await res.json()) as { trialExpired?: boolean; isPaid?: boolean };
    if (data.trialExpired && !data.isPaid) {
      return NextResponse.redirect(new URL("/pricing?reason=trial_expired", request.url));
    }
  } catch {
    // On failure, allow through to avoid blocking
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
    "/api/dev",
    "/api/dev/:path*",
  ],
};
