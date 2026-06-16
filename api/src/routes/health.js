import { Router } from "express";
import { ROOT_DOMAIN } from "../config.js";

const router = Router();

router.get("/health", (_req, res) => res.json({ ok: true }));
router.get("/config", (_req, res) => res.json({ rootDomain: ROOT_DOMAIN }));

export default router;
