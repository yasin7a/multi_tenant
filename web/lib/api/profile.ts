import type { Me, PublicProfile } from "@/types";
import { tenantHostHeaders } from "@/lib/api-headers";
import { getApiOrigin } from "@/lib/api-origin";

export async function getPublicProfile(host: string) {
  const res = await fetch(`${getApiOrigin()}/api/profile/public`, {
    headers: tenantHostHeaders(host),
    cache: "no-store",
  });
  if (!res.ok) return null;
  return (await res.json()) as PublicProfile;
}

export async function getMe(host: string, cookie?: string | null) {
  if (!cookie) return null;
  const res = await fetch(`${getApiOrigin()}/api/profile/me`, {
    headers: tenantHostHeaders(host, { cookie }),
    cache: "no-store",
  });
  if (!res.ok) return null;
  return (await res.json()) as Me;
}
