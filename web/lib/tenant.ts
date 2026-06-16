import { getServerRootDomain } from "@/lib/root-domain";
import type { HostContext } from "@/types";

export function getRootDomain() {
  return getServerRootDomain();
}

export function getWebPort(): string {
  return process.env.NEXT_PUBLIC_WEB_PORT || "3000";
}

export function isLocalhostHost(hostname: string) {
  return hostname === "localhost" || hostname.endsWith(".localhost");
}

export function parseHost(hostname: string): HostContext {
  const root = getRootDomain();

  if (hostname === "localhost" || hostname === root) {
    return { type: "main" };
  }

  if (hostname.endsWith(".localhost")) {
    const subdomain = hostname.slice(0, -".localhost".length);
    return { type: "tenant", subdomain, isCustomDomain: false };
  }

  if (hostname.endsWith(`.${root}`)) {
    const subdomain = hostname.slice(0, -(root.length + 1));
    return { type: "tenant", subdomain, isCustomDomain: false };
  }

  return { type: "unknown", host: hostname };
}

export function getTenantWebUrl(subdomain: string) {
  const root = getRootDomain();
  const port = getWebPort();
  const protocol = typeof window !== "undefined" ? window.location.protocol : "http:";
  const host = `${subdomain}.${root}`;
  const isDev = port && port !== "80" && port !== "443";
  return `${protocol}//${host}${isDev ? `:${port}` : ""}`;
}
