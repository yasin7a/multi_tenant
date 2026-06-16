import { Router } from "express";
import { SERVER_IP } from "../config.js";
import { getAuthUser } from "../lib/auth.js";
import {
  isValidCustomDomain,
  normalizeCustomDomain,
  verifyCustomDomainDns,
} from "../lib/domains.js";
import { isCustomDomainActive } from "../lib/urls.js";

const router = Router();

router.get("/verify", async (req, res) => {
  const authUser = await getAuthUser(req.cookies.userId);
  if (!authUser) return res.status(401).json({ error: "not authenticated" });

  const domain =
    normalizeCustomDomain(req.query.domain) || authUser.tenant.customDomain;
  if (!domain)
    return res.json({ domain: null, verified: false, status: "none" });
  if (!isValidCustomDomain(domain))
    return res.status(400).json({ error: "invalid domain" });
  if (!isCustomDomainActive(authUser.tenant))
    return res.json({
      domain,
      verified: false,
      expectedIp: SERVER_IP || null,
      addresses: [],
      status: "disabled",
    });

  const dnsCheck = await verifyCustomDomainDns(domain);
  return res.json({
    domain,
    verified: dnsCheck.verified,
    expectedIp: SERVER_IP || null,
    addresses: dnsCheck.addresses,
    status: dnsCheck.verified ? "valid" : "pending",
  });
});

export default router;
