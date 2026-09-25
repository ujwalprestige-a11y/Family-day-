import { NextRequest, NextResponse } from "next/server";
import { APP_SESSION_COOKIE, verifyAppSessionToken } from "@/lib/app-session";

/**
 * Whole-app gate. Every request needs a valid `fd_app` cookie, which is issued
 * by POST /api/login after a correct static username + password.
 *
 * This runs before any page renders, so an unauthenticated visitor never
 * receives kiosk markup or employee data — unlike the /admin dashboard, which
 * renders first and hides itself once /api/admin/stats returns 401.
 *
 * Next.js 16 renamed the `middleware` file convention to `proxy`; the exported
 * function must be the default export and named `proxy`.
 */

/** Reachable without a session, otherwise nobody could ever sign in. */
const PUBLIC_PATHS = new Set(["/login", "/api/login", "/api/logout"]);

export default async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PATHS.has(pathname)) return NextResponse.next();

  // A thrown error here (e.g. SESSION_SECRET unset) must not 500 every route,
  // so treat any failure as "not signed in".
  let signedIn = false;
  try {
    signedIn = await verifyAppSessionToken(req.cookies.get(APP_SESSION_COOKIE)?.value);
  } catch {
    signedIn = false;
  }
  if (signedIn) return NextResponse.next();

  // API callers get JSON so fetch() error handling stays predictable; an HTML
  // redirect would otherwise surface as a confusing JSON parse failure.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  const next = pathname + req.nextUrl.search;
  if (next !== "/") url.searchParams.set("next", next);
  return NextResponse.redirect(url);
}

export const config = {
  // Everything except Next's build output and the images the login page needs.
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|prestige-logo\\.png|skyline\\.svg).*)",
  ],
};
