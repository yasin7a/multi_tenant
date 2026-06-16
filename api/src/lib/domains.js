import dns from "node:dns/promises";
import { ROOT_DOMAIN, SERVER_IP } from "../config.js";

export function normalizeCustomDomain(value) {
  if (!value) return null;
  let domain = String(value).trim().toLowerCase();
  domain = domain.replace(/^https?:\/\//, "");
  domain = domain.split("/")[0].split(":")[0].replace(/\.$/, "");
  return domain || null;
}

export function isValidCustomDomain(domain) {
  if (!domain || domain.length > 253) return false;
  if (domain === ROOT_DOMAIN || domain.endsWith(`.${ROOT_DOMAIN}`)) return false;
  if (domain === "localhost" || domain.endsWith(".localhost")) return false;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(domain)) return false;
  return /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/.test(domain);
}

export async function verifyCustomDomainDns(domain) {
  if (!domain || !SERVER_IP) return { verified: false, addresses: [] };
  try {
    const addresses = await dns.resolve4(domain);
    return { verified: addresses.includes(SERVER_IP), addresses };
  } catch {
    return { verified: false, addresses: [] };
  }
}
