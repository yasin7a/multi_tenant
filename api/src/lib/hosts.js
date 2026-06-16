import { ROOT_DOMAIN } from "../config.js";
import { prisma } from "./prisma.js";

const DEV_ROOT_DOMAIN = "lvh.me";
const isProd = process.env.NODE_ENV === "production";

export function isLvhHost(host) {
  return host === DEV_ROOT_DOMAIN || host.endsWith(`.${DEV_ROOT_DOMAIN}`);
}

export function isPlatformHost(host) {
  if (!isProd && isLvhHost(host)) return true;
  return (
    host === "localhost" ||
    host === ROOT_DOMAIN ||
    host.endsWith(`.${ROOT_DOMAIN}`)
  );
}

export async function resolveHost(hostname) {
  const host = hostname;
  if (host === "localhost" || host === ROOT_DOMAIN) return { type: "main" };

  if (!isProd) {
    if (host === DEV_ROOT_DOMAIN) return { type: "main" };
    if (host.endsWith(`.${DEV_ROOT_DOMAIN}`)) {
      return {
        type: "tenant",
        subdomain: host.slice(0, -(DEV_ROOT_DOMAIN.length + 1)),
        isCustomDomain: false,
      };
    }
  }

  if (host.endsWith(".localhost")) {
    return {
      type: "tenant",
      subdomain: host.slice(0, -".localhost".length),
      isCustomDomain: false,
    };
  }

  if (host.endsWith(`.${ROOT_DOMAIN}`)) {
    return {
      type: "tenant",
      subdomain: host.slice(0, -(ROOT_DOMAIN.length + 1)),
      isCustomDomain: false,
    };
  }

  const tenant = await prisma.tenant.findFirst({
    where: { customDomain: host },
    select: { subdomain: true, customDomainEnabled: true },
  });

  if (tenant) {
    return {
      type: "tenant",
      subdomain: tenant.subdomain,
      isCustomDomain: true,
      customDomainActive: tenant.customDomainEnabled !== false,
    };
  }

  return { type: "unknown", host };
}
