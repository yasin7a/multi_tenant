import { tenantHostHeaders } from "@/lib/api-headers";
import { getApiOrigin } from "@/lib/api-origin";
import type { HostContext, PublicProfile } from "@/types";

export function shouldRedirectToCustomDomain(currentHost: string, profile: PublicProfile) {
  const custom = profile.tenant.customDomain;
  if (!custom || profile.tenant.customDomainEnabled === false) return null;
  if (currentHost === custom) return null;
  return custom;
}

export async function resolveHostViaApi(host: string): Promise<HostContext> {
  const res = await fetch(`${getApiOrigin()}/api/site`, {
    headers: tenantHostHeaders(host),
    cache: "no-store",
  });
  if (!res.ok) return { type: "unknown", host };
  return (await res.json()) as HostContext;
}

export function normalizeRequestHost(hostHeader: string) {
  return hostHeader.split(",")[0].trim().replace(/:\d+$/, "");
}
