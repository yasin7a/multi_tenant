/** Forward tenant host to the API (Node fetch forbids setting `Host`). */
export function tenantHostHeaders(host: string, extra?: Record<string, string>) {
  return {
    "x-forwarded-host": host,
    accept: "application/json",
    ...extra,
  };
}
