import cors from "cors";
import { PUBLIC_URL, ROOT_DOMAIN, WEB_PORT } from "../config.js";

export function createCors() {
  const allowedOrigins = new Set();
  if (PUBLIC_URL) {
    try {
      allowedOrigins.add(new URL(PUBLIC_URL).origin);
    } catch {
      // ignore
    }
  }
  allowedOrigins.add(`http://${ROOT_DOMAIN}:${WEB_PORT}`);

  return cors({
    credentials: true,
    origin(origin, cb) {
      if (!origin) return cb(null, true);
      if (allowedOrigins.has(origin)) return cb(null, true);
      try {
        const url = new URL(origin);
        const isDevSubdomain =
          url.hostname === ROOT_DOMAIN || url.hostname.endsWith(`.${ROOT_DOMAIN}`);
        const isDevPort = String(url.port || "") === String(WEB_PORT);
        if (
          isDevSubdomain &&
          isDevPort &&
          (url.protocol === "http:" || url.protocol === "https:")
        ) {
          return cb(null, true);
        }
      } catch {
        // ignore
      }
      return cb(null, false);
    },
  });
}
