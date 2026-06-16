import { headers } from "next/headers";

export async function getRequestHost() {
  const h = await headers();
  const host = h.get("x-forwarded-host") || h.get("host") || "localhost";
  return host.split(",")[0].trim();
}

export async function getRequestProtocol() {
  const h = await headers();
  const proto = h.get("x-forwarded-proto") || "http";
  return proto.split(",")[0].trim();
}

export async function getRequestOrigin() {
  const [proto, host] = await Promise.all([getRequestProtocol(), getRequestHost()]);
  return `${proto}://${host}`;
}

export function getApiOrigin() {
  return process.env.API_ORIGIN || "http://localhost:9097";
}

