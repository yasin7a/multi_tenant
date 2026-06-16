import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getServerRootDomain } from "@/lib/root-domain";
import { getApiOrigin } from "@/lib/api-origin";

function isLoggedIn(request: NextRequest) {
  // API sets this cookie (httpOnly). Proxy can still read it for redirects.
  return Boolean(request.cookies.get("userId")?.value);
}

async function getCustomDomainIfAny(request: NextRequest) {
  const hostHeader =
    request.headers.get("x-forwarded-host") ||
    request.headers.get("host") ||
    "";
  const host = hostHeader.split(",")[0].trim().replace(/:\d+$/, "");
  const root = getServerRootDomain();

  // Only canonicalize platform subdomains (custom domains are already canonical).
  if (!host.endsWith(`.${root}`)) return null;

  const res = await fetch(`${getApiOrigin()}/api/profile/public`, {
    headers: {
      "x-forwarded-host": host,
      accept: "application/json",
    },
    cache: "no-store",
  });
  if (!res.ok) return null;

  const data = (await res.json()) as {
    tenant?: { customDomain?: string | null; customDomainEnabled?: boolean };
  };
  const tenant = data?.tenant;
  if (!tenant?.customDomain || tenant.customDomainEnabled === false)
    return null;
  const custom = String(tenant.customDomain);
  if (custom === host) return null;
  return custom;
}

// This function can be marked `async` if using `await` inside
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const loggedIn = isLoggedIn(request);

  // Canonicalize custom domain in production only (dev stays on subdomain/localhost).
  if (
    process.env.NODE_ENV === "production" &&
    !pathname.startsWith("/api") &&
    !pathname.startsWith("/_next")
  ) {
    try {
      const custom = await getCustomDomainIfAny(request);
      if (custom) {
        const url = request.nextUrl.clone();
        url.hostname = custom;
        url.protocol = "https:";
        // keep pathname + search
        return NextResponse.redirect(url);
      }
    } catch {
      // ignore and continue (never block page load on proxy errors)
    }
  }

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
  matcher: ["/:path*"],
};
