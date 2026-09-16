import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "./auth.config";

/**
 * Optimistic route protection: only checks the session cookie (JWT), no
 * database access. Data access is protected again in the data-access layer.
 */
const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const { pathname } = req.nextUrl;
  // The console is checked again in its layout, against the database: this is
  // only the cheap first pass that keeps a signed-out visitor out.
  const isApp = pathname.startsWith("/app") || pathname.startsWith("/admin");
  if (isApp && !req.auth?.user) {
    const url = new URL("/login", req.nextUrl);
    url.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(url);
  }
  if (pathname === "/login" && req.auth?.user) return NextResponse.redirect(new URL("/app", req.nextUrl));
  return NextResponse.next();
});

export const config = {
  matcher: ["/app/:path*", "/admin/:path*", "/login"],
};
