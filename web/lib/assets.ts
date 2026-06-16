/** Normalize legacy /uploads/... paths and optionally prefix with site origin. */
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

  if (origin) {
    return `${origin.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
  }

  return path;
}
