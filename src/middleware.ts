import NextAuth from "next-auth";
import { NextResponse } from "next/server";

import { authConfig } from "@/auth.config";

/**
 * Server-side enforcement of the forced password change. The client `ForcePasswordGate`
 * is only UX — this middleware is the real boundary: a signed-in user whose account is
 * flagged `must_change_password` (temp password from an admin-created account) is blocked
 * from every route except the change-password flow until they set their own password.
 *
 * Edge-safe: it only decodes the JWT cookie (via the no-DB `authConfig`) and reads the
 * `mustChangePassword` claim stamped at sign-in; it never touches the database. It does
 * NOT add authn for other routes — those still self-guard — it only adds this one gate.
 */
const { auth } = NextAuth(authConfig);

// Paths a must-change user may still reach: the change-password page + its APIs, the
// password-status check, NextAuth (sign-out/session), and the login page.
const ALLOWED = [
  /^\/account\/change-password/,
  /^\/api\/account\/change-password$/,
  /^\/api\/account\/password-status$/,
  /^\/api\/auth\//,
  /^\/login/,
];

export default auth((req) => {
  if (req.auth?.mustChangePassword !== true) return NextResponse.next();

  const { pathname } = req.nextUrl;
  if (ALLOWED.some((re) => re.test(pathname))) return NextResponse.next();

  // API calls are refused outright; page requests are sent to the change-password screen.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "password_change_required" }, { status: 403 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/account/change-password";
  url.search = "";
  return NextResponse.redirect(url);
});

export const config = {
  // Run on app pages + API routes; skip Next internals, the service worker, and any
  // static file (a path segment ending in a .extension).
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|sw.js|manifest.webmanifest|.*\\.[\\w]+$).*)",
  ],
};
