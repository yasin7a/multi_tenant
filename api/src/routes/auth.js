import { Router } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma.js";
import { getAuthUser, isWrongTenantLogin } from "../lib/auth.js";
import { setAuthCookie, clearAuthCookie } from "../lib/auth-cookies.js";
import { createAuthHandoff, consumeAuthHandoff } from "../lib/auth-handoff.js";
import { resolveHost } from "../lib/hosts.js";
import { getRequestHostname } from "../lib/request-host.js";
import { getTenantBaseUrl, isCustomDomainActive } from "../lib/urls.js";

const router = Router();

router.get("/continue", async (req, res) => {
  const userId = consumeAuthHandoff(req.query.token);
  const nextPath =
    typeof req.query.next === "string" && req.query.next.startsWith("/")
      ? req.query.next
      : "/edit";

  if (!userId) return res.redirect("/login");
  setAuthCookie(res, req, userId);
  return res.redirect(nextPath);
});

router.post("/register", async (req, res) => {
  const { username, email, password } = req.body || {};
  if (!username || !email || !password)
    return res
      .status(400)
      .json({ error: "username, email, and password are required" });

  const existing = await prisma.user.findFirst({
    where: { OR: [{ username }, { email }] },
  });
  if (existing)
    return res.status(409).json({ error: "username or email already exists" });

  const subdomain = String(username).toLowerCase();
  const existingTenant = await prisma.tenant.findUnique({
    where: { subdomain },
    select: { id: true },
  });
  if (existingTenant)
    return res.status(409).json({ error: "subdomain already taken" });

  const hashedPassword = await bcrypt.hash(password, 10);

  const user = await prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.create({ data: { subdomain } });
    return tx.user.create({
      data: { username, email, password: hashedPassword, tenantId: tenant.id },
      select: { id: true },
    });
  });

  setAuthCookie(res, req, user.id);
  return res.status(201).json({ isLoggedIn: true, userId: user.id, subdomain });
});

router.post("/login", async (req, res) => {
  const host = getRequestHostname(req);
  const hostCtx = await resolveHost(host);
  const { email, password } = req.body || {};
  if (!email || !password)
    return res.status(400).json({ error: "email and password are required" });

  const user = await prisma.user.findUnique({
    where: { email },
    include: {
      tenant: {
        select: {
          subdomain: true,
          customDomain: true,
          customDomainEnabled: true,
        },
      },
    },
  });
  if (!user) return res.status(401).json({ error: "invalid credentials" });

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return res.status(401).json({ error: "invalid credentials" });

  if (isWrongTenantLogin(req, hostCtx, user)) {
    return res.status(403).json({
      error: "wrong tenant",
      message: "This site belongs to someone else.",
      redirectUrl: `${getTenantBaseUrl(user.tenant)}/login`,
    });
  }

  setAuthCookie(res, req, user.id);

  if (isCustomDomainActive(user.tenant) && host !== user.tenant.customDomain) {
    const token = createAuthHandoff(user.id);
    return res.json({
      isLoggedIn: true,
      userId: user.id,
      redirectUrl: `${getTenantBaseUrl(user.tenant)}/api/auth/continue?token=${token}&next=${encodeURIComponent("/edit")}`,
    });
  }

  return res.json({ isLoggedIn: true, userId: user.id });
});

router.post("/logout", async (req, res) => {
  clearAuthCookie(res, req);
  return res.json({ ok: true });
});

router.get("/logout", async (req, res) => {
  clearAuthCookie(res, req);
  return res.redirect("/login");
});

export default router;
