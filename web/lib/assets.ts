/** Normalize legacy /uploads/... paths and prefix with origin.
 *  In production uses root domain so images load from custom domains too.
 */
export function resolveImageSrc(
  imageUrl: string | null | undefined,
  origin?: string,
): string | null {
  if (!imageUrl) return null;

  let path = imageUrl.trim();
  if (!path) return null;

  if (path.startsWith("http://") || path.startsWith("https://")) return path;

  if (path.startsWith("/uploads/") && !path.startsWith("/api/uploads/")) {
    path = `/api${path}`;
  }

  const base = origin?.replace(/\/$/, "") ?? getImageBase();
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Absolute base for image URLs — uses root domain even in prod
 *  so images load from subdomains & custom domains. */
function getImageBase(): string {
  if (typeof window !== "undefined") {
    // Client-side: use current origin (works for all domains via Caddy)
    return window.location.origin;
  }
  // SSR: use root domain
  const root = process.env.NEXT_PUBLIC_ROOT_DOMAIN || "lvh.me";
  if (root === "lvh.me") {
    return `http://lvh.me:${process.env.NEXT_PUBLIC_WEB_PORT || "3000"}`;
  }
  return `https://${root}`;
}
