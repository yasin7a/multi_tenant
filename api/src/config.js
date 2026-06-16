import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const API_PORT = Number(process.env.API_PORT || process.env.PORT) || 9097;
export const ROOT_DOMAIN = process.env.ROOT_DOMAIN || "lvh.me";
export const PUBLIC_URL = process.env.PUBLIC_URL?.replace(/\/$/, "");
export const SERVER_IP = process.env.SERVER_IP || "";
export const WEB_PORT = process.env.WEB_PORT || 3000;
export const UPLOADS_DIR = path.join(__dirname, "..", "public", "uploads");

export const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);

const DEV_ROOT_DOMAIN = "lvh.me";
const isProd = process.env.NODE_ENV === "production";

/** Root domain for API responses — lvh.me in local dev, ROOT_DOMAIN in production. */
export function getRequestRootDomain(hostname) {
  const host = String(hostname || "").replace(/:\d+$/, "");
  if (!isProd) {
    if (host === DEV_ROOT_DOMAIN || host.endsWith(`.${DEV_ROOT_DOMAIN}`)) return DEV_ROOT_DOMAIN;
    if (host === "localhost" || host === "127.0.0.1") return DEV_ROOT_DOMAIN;
  }
  return ROOT_DOMAIN;
}
