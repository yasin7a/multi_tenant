import { Router } from "express";
import { ROOT_DOMAIN } from "../config.js";
import { resolveHost } from "../lib/hosts.js";

const router = Router();

router.get("/site", async (req, res) => {
  const ctx = await resolveHost(req.hostname);
  return res.json({ ...ctx, rootDomain: ROOT_DOMAIN });
});

export default router;
