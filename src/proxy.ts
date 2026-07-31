import { type NextRequest, NextResponse } from "next/server";

import { SESSION_COOKIE, verifySession } from "@/lib/session";

/**
 * Edge-safe gate. It only verifies the JWT signature — the authoritative
 * check (is the account still active? still a member of this project?) runs
 * in `getCurrentUser()` on the server for every page.
 *
 * Next 16 renamed this file convention from `middleware` to `proxy`; the
 * exported function name has to match the filename.
 */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = await verifySession(token);
  const isStaff =
    session?.role === "ADMIN" ||
    session?.role === "MANAGER" ||
    session?.role === "SPECIALIST";

  // Signed-in users never see the login screen.
  if (pathname === "/login" || pathname === "/") {
    if (session) {
      return NextResponse.redirect(
        new URL(isStaff ? "/app" : "/portal", request.url),
      );
    }
    if (pathname === "/") {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    return NextResponse.next();
  }

  // Invite links must work for someone who is not signed in yet.
  if (pathname.startsWith("/invite/")) return NextResponse.next();

  // The forced password screen guards itself and must stay reachable by
  // both actors, so it is not routed by role below.
  if (pathname === "/set-password") {
    if (!session) return NextResponse.redirect(new URL("/login", request.url));
    return NextResponse.next();
  }

  const isProtected = pathname.startsWith("/app") || pathname.startsWith("/portal");
  if (!isProtected) return NextResponse.next();

  if (!session) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(login);
  }

  // Someone on an admin-issued password gets nothing but the password screen.
  // Doing this here, rather than in a layout, is what makes it a real block:
  // Next renders layouts and pages in parallel, so a layout redirect still
  // lets the page run its queries and stream the results.
  if (session.mustChangePassword) {
    return NextResponse.redirect(new URL("/set-password", request.url));
  }

  // Keep the two actors in their own house.
  if (pathname.startsWith("/app") && !isStaff) {
    return NextResponse.redirect(new URL("/portal", request.url));
  }
  if (pathname.startsWith("/portal") && isStaff) {
    return NextResponse.redirect(new URL("/app", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Everything except Next internals, static files and the health check.
     */
    "/((?!api/health|api/cron|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)",
  ],
};
