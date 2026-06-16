import { getServerRootDomain, inferRootDomainFromHost } from "@/lib/root-domain";
import type { HostContext } from "@/types";

const DEV_ROOT = "lvh.me";

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
  if (hostname === DEV_ROOT || hostname.endsWith(`.${DEV_ROOT}`)) {
    if (hostname === DEV_ROOT) return { type: "main" };
    return {
      type: "tenant",
      subdomain: hostname.slice(0, -(DEV_ROOT.length + 1)),
      isCustomDomain: false,
    };
  }

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
  const port = getWebPort();
  const protocol = typeof window !== "undefined" ? window.location.protocol : "http:";
  const root =
    typeof window !== "undefined"
      ? inferRootDomainFromHost(window.location.hostname)
      : getRootDomain();
  const host = `${subdomain}.${root}`;
  // Only add port in dev (lvh.me)
  if (root === DEV_ROOT) {
    return `${protocol}//${host}:${port}`;
  }
  return `${protocol}//${host}`;
}
