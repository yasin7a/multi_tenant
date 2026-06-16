import { Router } from "express";
import { getRequestRootDomain } from "../config.js";
import { resolveHost } from "../lib/hosts.js";
import { getRequestHostname } from "../lib/request-host.js";

const router = Router();

router.get("/site", async (req, res) => {
  const host = getRequestHostname(req);
  const ctx = await resolveHost(host);
  return res.json({ ...ctx, rootDomain: getRequestRootDomain(host) });
});

export default router;
