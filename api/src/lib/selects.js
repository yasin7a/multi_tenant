export const tenantSelect = {
  id: true,
  subdomain: true,
  customDomain: true,
  customDomainEnabled: true,
  createdAt: true,
};

export const authUserSelect = {
  id: true,
  username: true,
  email: true,
  imageUrl: true,
  createdAt: true,
  tenantId: true,
  tenant: { select: tenantSelect },
};

export const publicProfileSelect = {
  username: true,
  email: true,
  imageUrl: true,
  createdAt: true,
  tenantId: true,
  tenant: { select: tenantSelect },
};
