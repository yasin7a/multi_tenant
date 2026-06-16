import { Router } from "express";
import { ROOT_DOMAIN } from "../config.js";
import { prisma } from "../lib/prisma.js";
import { isValidCustomDomain, normalizeCustomDomain } from "../lib/domains.js";

const router = Router();

router.get("/caddy-ask", async (req, res) => {
  const domain = normalizeCustomDomain(req.query.domain);
  if (!domain || !isValidCustomDomain(domain)) return res.status(403).send();
  if (domain === ROOT_DOMAIN || domain.endsWith(`.${ROOT_DOMAIN}`))
    return res.status(403).send();

  const tenant = await prisma.tenant.findFirst({
    where: { customDomain: domain, customDomainEnabled: true },
    select: { id: true },
  });

  return tenant ? res.status(200).send("ok") : res.status(403).send();
});

export default router;
