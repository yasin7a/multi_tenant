/** Hostname for tenant routing (custom domain, subdomain, etc.). */
export function getRequestHostname(req) {
  const forwarded = req.headers["x-forwarded-host"];
  const raw =
    (typeof forwarded === "string" ? forwarded : forwarded?.[0]) || req.hostname;
  return String(raw).split(",")[0].trim().replace(/:\d+$/, "");
}
