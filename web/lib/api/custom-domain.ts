import { getClientApiBase } from "@/lib/api-origin";
import type { DomainVerify } from "@/types";

export async function verifyCustomDomain(domain: string) {
  const res = await fetch(
    `${getClientApiBase()}/api/custom-domain/verify?domain=${encodeURIComponent(domain)}`,
    {
      headers: { accept: "application/json" },
      credentials: "include",
    },
  );
  if (!res.ok) return null;
  return (await res.json()) as DomainVerify;
}

export async function removeCustomDomain(): Promise<boolean> {
  const res = await fetch(`${getClientApiBase()}/api/custom-domain/remove`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) return false;
  const data = await res.json().catch(() => ({}));
  return data?.removed === true;
}

export function dnsHostHint(domain: string) {
  if (!domain || !domain.includes(".")) return "@ (or your domain root)";
  const parts = domain.split(".");
  if (parts.length <= 2) return "@ (or your domain root)";
  return `${parts[0]} (subdomain)`;
}
