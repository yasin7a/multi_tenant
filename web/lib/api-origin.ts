function resolveRootDomain() {
  return (
    process.env.NEXT_PUBLIC_ROOT_DOMAIN || process.env.ROOT_DOMAIN || "lvh.me"
  );
}

function isDev() {
  return resolveRootDomain() === "lvh.me";
}

/** Server-side API origin — bypasses Caddy so x-forwarded-host is preserved.
 *  Dev:  http://localhost:9097
 *  Prod: http://127.0.0.1:9097            (direct, no Caddy header overwrite)
 */
export function getApiOrigin() {
  if (process.env.API_ORIGIN) return process.env.API_ORIGIN;
  if (isDev()) return "http://localhost:9097";
  return "http://127.0.0.1:9097";
}

/** Client-safe API base URL — uses NEXT_PUBLIC_ROOT_DOMAIN from env.
 *  Dev (lvh.me): http://lvh.me:3000  → Next.js proxies /api/* to backend
 *  Prod:         "" (relative)       → Caddy routes /api/* on same domain, no CORS
 */
export function getClientApiBase() {
  const root = resolveRootDomain();
  if (isDev()) {
    const port = process.env.NEXT_PUBLIC_WEB_PORT || "3000";
    return `http://${root}:${port}`;
  }
  // Production: relative URLs — browser uses current origin.
  // Works for main domain, subdomains, AND custom domains via Caddy.
  return "";
}
