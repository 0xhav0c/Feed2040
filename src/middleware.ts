import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/register", "/setup", "/api/auth", "/api/setup", "/api/telegram", "/api/cron", "/api/internal", "/api/fever"];

const CSRF_EXEMPT_PREFIXES = ["/api/auth", "/api/setup", "/api/telegram/webhook", "/api/cron", "/api/internal", "/api/fever"];

function isValidOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  const referer = req.headers.get("referer");

  const appUrl = process.env.NEXTAUTH_URL || `http://localhost:${process.env.PORT || 3000}`;
  let expectedHost: string;
  try {
    expectedHost = new URL(appUrl).host;
  } catch {
    expectedHost = "localhost:3000";
  }

  if (origin) {
    try {
      return new URL(origin).host === expectedHost;
    } catch {
      return false;
    }
  }

  if (referer) {
    try {
      return new URL(referer).host === expectedHost;
    } catch {
      return false;
    }
  }

  // No origin/referer — allow same-origin requests (non-browser clients)
  return true;
}

export function middleware(req: NextRequest): NextResponse {
  const { pathname } = req.nextUrl;

  const isPublicPath = PUBLIC_PATHS.some((path) => pathname.startsWith(path));

  // CSRF protection for state-changing methods
  const method = req.method;
  if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
    const isCsrfExempt = CSRF_EXEMPT_PREFIXES.some((p) => pathname.startsWith(p));
    if (!isCsrfExempt && !isValidOrigin(req)) {
      return NextResponse.json({ error: "CSRF validation failed" }, { status: 403 });
    }
  }

  if (isPublicPath) {
    return NextResponse.next();
  }

  const sessionToken =
    req.cookies.get("authjs.session-token")?.value ||
    req.cookies.get("__Secure-authjs.session-token")?.value;

  if (!sessionToken) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|public/).*)"],
};
