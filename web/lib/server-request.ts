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
  const host = await getRequestHostHeader();
  return host.replace(/:\d+$/, "");
}

export async function getRequestProtocol() {
  const h = await headers();
  const proto = h.get("x-forwarded-proto") || "http";
  return proto.split(",")[0].trim();
}

export async function getRequestOrigin() {
  const [proto, hostHeader] = await Promise.all([getRequestProtocol(), getRequestHostHeader()]);
  return `${proto}://${hostHeader}`;
}

export async function getServerFetchOrigin() {
  if (process.env.NODE_ENV !== "production") {
    const hostHeader = await getRequestHostHeader();
    const portMatch = hostHeader.match(/:(\d+)$/);
    const port = portMatch?.[1] || "3000";
    return `http://127.0.0.1:${port}`;
  }
  return getRequestOrigin();
}

export async function getRequestCookieHeader() {
  const h = await headers();
  return h.get("cookie") || "";
}

export function getApiOrigin() {
  return process.env.API_ORIGIN || "http://localhost:9097";
}
