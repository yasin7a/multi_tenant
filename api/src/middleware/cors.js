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

  // Dev origins
  allowedOrigins.add(`http://${ROOT_DOMAIN}:${WEB_PORT}`);
  allowedOrigins.add(`http://localhost:${WEB_PORT}`);
  allowedOrigins.add(`http://127.0.0.1:${WEB_PORT}`);
  allowedOrigins.add(`http://lvh.me:${WEB_PORT}`);

  // Prod origins (HTTPS, no custom port — goes through Caddy on 443)
  allowedOrigins.add(`https://${ROOT_DOMAIN}`);

  const isProd = process.env.NODE_ENV === "production";

  return cors({
    credentials: true,
    origin(origin, cb) {
      if (!origin) return cb(null, true);
      if (allowedOrigins.has(origin)) return cb(null, true);
      try {
        const url = new URL(origin);
        const isPlatformHost =
          url.hostname === ROOT_DOMAIN ||
          url.hostname.endsWith(`.${ROOT_DOMAIN}`) ||
          url.hostname === "lvh.me" ||
          url.hostname.endsWith(".lvh.me") ||
          url.hostname === "localhost";

        if (!isPlatformHost) return cb(null, false);

        // Dev: require the web port (e.g. :3000)
        if (!isProd && String(url.port || "") !== String(WEB_PORT)) {
          return cb(null, false);
        }

        // Prod: no port restriction (Caddy on 443/80)
        if (url.protocol === "http:" || url.protocol === "https:") {
          return cb(null, true);
        }

        return cb(null, false);
      } catch {
        // ignore
      }
      return cb(null, false);
    },
  });
}
