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

/** Pick lvh.me vs production root based on current browser host (client only). */
export function inferRootDomainFromHost(hostname: string): string {
  if (hostname === "lvh.me" || hostname.endsWith(".lvh.me")) return "lvh.me";
  if (hostname === "localhost" || hostname === "127.0.0.1") return "lvh.me";
  return getServerRootDomain();
}
