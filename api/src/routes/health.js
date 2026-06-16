import { Router } from "express";
import { getRequestRootDomain } from "../config.js";

const router = Router();

router.get("/health", (_req, res) => res.json({ ok: true }));
router.get("/config", (req, res) =>
  res.json({ rootDomain: getRequestRootDomain(req.hostname) }),
);

export default router;
