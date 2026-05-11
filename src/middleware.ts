import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/register", "/setup", "/api/auth", "/api/setup", "/api/telegram", "/api/cron", "/api/internal", "/api/fever", "/api/health"];

const CSRF_EXEMPT_PREFIXES = ["/api/auth", "/api/setup", "/api/telegram/webhook", "/api/cron", "/api/internal", "/api/fever"];

function isValidOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  const referer = req.headers.get("referer");

  const requestHost = req.headers.get("host") || req.nextUrl.host;

  if (origin) {
    try {
      return new URL(origin).host === requestHost;
    } catch {
      return false;
    }
  }

  if (referer) {
    try {
      return new URL(referer).host === requestHost;
    } catch {
      return false;
    }
  }

  // No Origin or Referer — only allow if the request has a session cookie
  // (authenticated non-browser clients like API tools) or X-Requested-With header
  const hasSession = !!(
    req.cookies.get("authjs.session-token")?.value ||
    req.cookies.get("__Secure-authjs.session-token")?.value
  );
  const hasXhr = !!req.headers.get("x-requested-with");

  return hasSession || hasXhr;
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
