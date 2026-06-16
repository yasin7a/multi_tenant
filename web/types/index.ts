export type TenantInfo = {
  subdomain: string;
  customDomain: string | null;
  customDomainEnabled?: boolean;
  createdAt?: string;
};

export type PublicProfile = {
  username: string;
  email: string;
  imageUrl: string | null;
  createdAt: string;
  tenant: TenantInfo & { createdAt: string };
};

export type Me = {
  id: string;
  username: string;
  email: string;
  imageUrl: string | null;
  rootDomain?: string;
  tenant: TenantInfo;
};

export type DomainVerify = {
  domain: string | null;
  verified: boolean;
  expectedIp: string | null;
  addresses: string[];
  status: "none" | "valid" | "pending" | "disabled";
};

export type HostContext =
  | { type: "main" }
  | {
      type: "tenant";
      subdomain: string;
      isCustomDomain: boolean;
      customDomainActive?: boolean;
    }
  | { type: "unknown"; host: string };
