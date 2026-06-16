import { ROOT_DOMAIN } from "../config.js";
import { prisma } from "./prisma.js";

export function isPlatformHost(host) {
  return (
    host === "localhost" ||
    host === ROOT_DOMAIN ||
    host.endsWith(`.${ROOT_DOMAIN}`)
  );
}

export async function resolveHost(hostname) {
  const host = hostname;
  if (host === "localhost" || host === ROOT_DOMAIN) return { type: "main" };

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
    where: { customDomain: host, customDomainEnabled: true },
    select: { subdomain: true },
  });

  if (tenant) {
    return {
      type: "tenant",
      subdomain: tenant.subdomain,
      isCustomDomain: true,
    };
  }

  return { type: "unknown", host };
}
