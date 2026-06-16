import { PUBLIC_URL, ROOT_DOMAIN, WEB_PORT } from "../config.js";

export function getPublicProtocol() {
  if (PUBLIC_URL?.startsWith("https")) return "https";
  if (PUBLIC_URL?.startsWith("http")) return "http";
  return "http";
}

export function getSiteUrl(subdomain) {
  if (PUBLIC_URL) return `${getPublicProtocol()}://${subdomain}.${ROOT_DOMAIN}`;
  return `http://${subdomain}.${ROOT_DOMAIN}:${WEB_PORT}`;
}

export function isCustomDomainActive(tenant) {
  return Boolean(tenant?.customDomain && tenant.customDomainEnabled !== false);
}

export function getTenantBaseUrl(tenant) {
  if (isCustomDomainActive(tenant))
    return `${getPublicProtocol()}://${tenant.customDomain}`;
  return getSiteUrl(tenant.subdomain);
}
