import { prisma } from "./prisma.js";
import { authUserSelect } from "./selects.js";

export async function getAuthUser(userId) {
  if (!userId) return null;
  return prisma.user.findUnique({
    where: { id: userId },
    select: authUserSelect,
  });
}

export function isWrongTenantLogin(req, hostCtx, user) {
  if (hostCtx.type !== "tenant") return false;
  if (hostCtx.isCustomDomain) return user.tenant.customDomain !== req.hostname;
  return user.tenant.subdomain !== hostCtx.subdomain;
}
