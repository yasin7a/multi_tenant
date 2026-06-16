import { ROOT_DOMAIN } from "../config.js";
import { isPlatformHost } from "./hosts.js";

export function authCookieOptions(req) {
  const secure = (req.headers["x-forwarded-proto"] || req.protocol) === "https";
  const options = {
    path: "/",
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 7 * 1000,
    secure,
    sameSite: "lax",
  };

  const hostname = req.hostname;
  if (isPlatformHost(hostname)) {
    if (hostname !== "localhost" && !hostname.endsWith(".localhost")) {
      options.domain = `.${ROOT_DOMAIN}`;
    }
  }

  return options;
}

export function setAuthCookie(res, req, userId) {
  res.cookie("userId", userId, authCookieOptions(req));
}

export function clearAuthCookie(res, req) {
  const opts = { ...authCookieOptions(req), maxAge: 0 };
  res.clearCookie("userId", opts);
}
