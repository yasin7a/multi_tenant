import { Router } from "express";
import { ROOT_DOMAIN } from "../config.js";
import { prisma } from "../lib/prisma.js";
import { getAuthUser } from "../lib/auth.js";
import { createAuthHandoff } from "../lib/auth-handoff.js";
import { normalizeCustomDomain, isValidCustomDomain } from "../lib/domains.js";
import { resolveHost } from "../lib/hosts.js";
import { publicProfileSelect, authUserSelect } from "../lib/selects.js";
import { upload, deleteProfileImage } from "../lib/uploads.js";
import { getTenantBaseUrl, isCustomDomainActive } from "../lib/urls.js";

const router = Router();

router.get("/public", async (req, res) => {
  const hostCtx = await resolveHost(req.hostname);
  if (hostCtx.type !== "tenant")
    return res.status(404).json({ error: "profile not found" });

  const user = await prisma.user.findFirst({
    where: { tenant: { subdomain: hostCtx.subdomain } },
    select: publicProfileSelect,
  });

  if (!user) return res.status(404).json({ error: "profile not found" });
  return res.json(user);
});

router.get("/me", async (req, res) => {
  const authUser = await getAuthUser(req.cookies.userId);
  if (!authUser) return res.status(401).json({ error: "not authenticated" });
  return res.json({ ...authUser, rootDomain: ROOT_DOMAIN });
});

router.post("/", upload.single("image"), async (req, res) => {
  const hostCtx = await resolveHost(req.hostname);
  const authUser = await getAuthUser(req.cookies.userId);
  if (!authUser) return res.status(401).json({ error: "not authenticated" });

  if (hostCtx.type === "tenant") {
    if (hostCtx.isCustomDomain) {
      if (authUser.tenant.customDomain !== req.hostname)
        return res.status(403).json({ error: "wrong tenant host" });
    } else if (authUser.tenant.subdomain !== hostCtx.subdomain) {
      return res.status(403).json({ error: "wrong tenant host" });
    }
  } else {
    return res
      .status(400)
      .json({ error: "open edit on your tenant subdomain/custom domain" });
  }

  const username = req.body?.username;
  const email = req.body?.email;
  const customDomain = normalizeCustomDomain(req.body?.customDomain);
  const customDomainEnabled =
    req.body?.customDomainEnabled !== "false" &&
    req.body?.customDomainEnabled !== false;
  const newSubdomain = username?.toLowerCase().trim();

  if (!username || !email)
    return res.status(400).json({ error: "username and email are required" });
  if (!/^[a-zA-Z0-9-]+$/.test(username))
    return res.status(400).json({
      error: "username can only contain letters, numbers, and hyphens",
    });

  const existing = await prisma.user.findFirst({
    where: { OR: [{ username }, { email }], NOT: { id: authUser.id } },
  });
  if (existing)
    return res.status(409).json({ error: "username or email already exists" });

  if (newSubdomain !== authUser.tenant.subdomain) {
    const existingTenant = await prisma.tenant.findUnique({
      where: { subdomain: newSubdomain },
      select: { id: true },
    });
    if (existingTenant)
      return res.status(409).json({ error: "subdomain already taken" });
  }

  if (customDomain && !isValidCustomDomain(customDomain))
    return res.status(400).json({ error: "invalid custom domain" });
  if (customDomain) {
    const existingDomain = await prisma.tenant.findFirst({
      where: { customDomain, NOT: { id: authUser.tenantId } },
      select: { id: true },
    });
    if (existingDomain)
      return res.status(409).json({ error: "custom domain already taken" });
  }

  const previousImageUrl = authUser.imageUrl;
  const uploadedImageUrl = req.file?.filename
    ? `/api/uploads/${req.file.filename}`
    : null;
  const imageUrl = uploadedImageUrl ?? authUser.imageUrl;

  let updatedUser;
  try {
    updatedUser = await prisma.$transaction(async (tx) => {
      await tx.tenant.update({
        where: { id: authUser.tenantId },
        data: { subdomain: newSubdomain, customDomain, customDomainEnabled },
      });
      return tx.user.update({
        where: { id: authUser.id },
        data: { username, email, imageUrl },
        select: authUserSelect,
      });
    });
  } catch (err) {
    if (uploadedImageUrl) await deleteProfileImage(uploadedImageUrl);
    throw err;
  }

  if (
    uploadedImageUrl &&
    previousImageUrl &&
    previousImageUrl !== uploadedImageUrl
  ) {
    await deleteProfileImage(previousImageUrl);
  }

  if (
    isCustomDomainActive(updatedUser.tenant) &&
    req.hostname !== updatedUser.tenant.customDomain
  ) {
    const token = createAuthHandoff(updatedUser.id);
    return res.json({
      ...updatedUser,
      redirectUrl: `${getTenantBaseUrl(updatedUser.tenant)}/api/auth/continue?token=${token}&next=${encodeURIComponent("/edit")}`,
    });
  }

  return res.json(updatedUser);
});

export default router;
