import { headers } from "next/headers";

function normalizeForwardedHeader(value: string | null) {
  return (value || "").split(",")[0].trim();
}

export async function getRequestHostHeader() {
  const h = await headers();
  return (
    normalizeForwardedHeader(h.get("x-forwarded-host")) ||
    normalizeForwardedHeader(h.get("host")) ||
    "localhost"
  );
}

export async function getRequestHost() {
  const h = await headers();
  const host = normalizeForwardedHeader(h.get("x-forwarded-host")) || normalizeForwardedHeader(h.get("host")) || "localhost";
  // Strip port for hostname parsing (e.g. "tenant.lvh.me:3000" -> "tenant.lvh.me")
  return host.replace(/:\d+$/, "");
}

export async function getRequestProtocol() {
  const h = await headers();
  const proto = h.get("x-forwarded-proto") || "http";
  return proto.split(",")[0].trim();
}

export async function getRequestOrigin() {
  // IMPORTANT: keep port (e.g. :3000) for dev so same-origin /api rewrites work.
  const [proto, hostHeader] = await Promise.all([getRequestProtocol(), getRequestHostHeader()]);
  return `${proto}://${hostHeader}`;
}

export async function getRequestCookieHeader() {
  const h = await headers();
  return h.get("cookie") || "";
}

export function getApiOrigin() {
  return process.env.API_ORIGIN || "http://localhost:9097";
}

