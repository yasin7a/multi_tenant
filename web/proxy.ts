import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

function isLoggedIn(request: NextRequest) {
  // API sets this cookie (httpOnly). Proxy can still read it for redirects.
  return Boolean(request.cookies.get("userId")?.value);
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const loggedIn = isLoggedIn(request);

  // Protect edit page
  if (pathname.startsWith("/edit")) {
    if (!loggedIn) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }
  }

  // If already logged in, avoid auth pages
  if (pathname.startsWith("/login") || pathname.startsWith("/register")) {
    if (loggedIn) {
      const url = request.nextUrl.clone();
      url.pathname = "/edit";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/edit/:path*", "/login", "/register"],
};

