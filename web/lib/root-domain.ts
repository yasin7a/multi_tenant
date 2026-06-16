/** Server/middleware: read at runtime (not inlined at build). */
export function getServerRootDomain() {
  return (
    process.env.ROOT_DOMAIN ||
    process.env.NEXT_PUBLIC_ROOT_DOMAIN ||
    "lvh.me"
  );
}

/** Client bundles: only NEXT_PUBLIC_* is available unless fetched from API. */
export function getClientRootDomain() {
  return process.env.NEXT_PUBLIC_ROOT_DOMAIN || "lvh.me";
}

export function tenantSiteHost(subdomain: string, rootDomain: string) {
  return `${subdomain}.${rootDomain}`;
}
