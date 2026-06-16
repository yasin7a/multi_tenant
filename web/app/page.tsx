import type { Metadata } from "next";
import { redirect } from "next/navigation";
import styles from "./page.module.css";
import LandingCard from "@/components/landing/LandingCard";
import PublicProfileCard from "@/components/profile/PublicProfileCard";
import { getMe, getPublicProfile } from "@/lib/api/profile";
import { resolveImageSrc } from "@/lib/assets";
import { getServerRootDomain } from "@/lib/root-domain";
import {
  getRequestCookieHeader,
  getRequestHost,
  getRequestOrigin,
} from "@/lib/server-request";
import { parseHost } from "@/lib/tenant";
import {
  resolveHostViaApi,
  shouldRedirectToCustomDomain,
} from "@/lib/tenant-host";
import type { HostContext } from "@/types";

export async function generateMetadata(): Promise<Metadata> {
  const host = await getRequestHost();
  const origin = await getRequestOrigin();
  let hostCtx = parseHost(host) as HostContext;
  if (hostCtx.type === "unknown") hostCtx = await resolveHostViaApi(host);

  const profile = await getPublicProfile(host);
  if (!profile) {
    const tenantName =
      hostCtx.type === "tenant"
        ? hostCtx.subdomain
        : hostCtx.type === "unknown"
          ? hostCtx.host
          : host;
    return {
      title: "Site not found",
      description: `The tenant ${tenantName} does not exist.`,
      alternates: { canonical: origin },
    };
  }

  const rootDomain = getServerRootDomain();
  const title = `${profile.username}'s profile`;
  const description =
    profile.tenant.customDomain && profile.tenant.customDomainEnabled !== false
      ? `Public profile of ${profile.username} at ${profile.tenant.customDomain}`
      : `Public profile of ${profile.username} at ${profile.tenant.subdomain}.${rootDomain}`;
  const image = resolveImageSrc(profile.imageUrl, origin) ?? undefined;
  const canonicalHost = shouldRedirectToCustomDomain(host, profile) || host;
  const canonical = `${origin.startsWith("https:") ? "https" : "http"}://${canonicalHost}`;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      type: "profile",
      title,
      description,
      url: canonical,
      images: image ? [{ url: image }] : undefined,
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title,
      description,
      images: image ? [image] : undefined,
    },
  };
}

export default async function Home() {
  const host = await getRequestHost();
  const origin = await getRequestOrigin();
  const rootDomain = getServerRootDomain();
  const cookie = await getRequestCookieHeader();

  let hostCtx = parseHost(host) as HostContext;
  if (hostCtx.type === "unknown") {
    hostCtx = await resolveHostViaApi(host);
  }

  // Redirect disabled custom domain → subdomain
  if (
    hostCtx.type === "tenant" &&
    hostCtx.isCustomDomain &&
    hostCtx.customDomainActive === false
  ) {
    redirect(`https://${hostCtx.subdomain}.${rootDomain}`);
  }

  const profile = await getPublicProfile(host);
  if (profile) {
    const canonicalCustom =
      process.env.NODE_ENV === "production"
        ? shouldRedirectToCustomDomain(host, profile)
        : null;
    if (canonicalCustom) redirect(`https://${canonicalCustom}`);

    const me = await getMe(host, cookie);

    return (
      <div className={styles.page}>
        <main className={styles.main}>
          <PublicProfileCard
            profile={profile}
            me={me}
            rootDomain={rootDomain}
            origin={origin}
          />
        </main>
      </div>
    );
  }

  // Show landing page only on the platform root domain.
  // Unknown hosts (stale custom domains, random domains) get a "not found" page.
  if (hostCtx.type === "unknown") {
    return (
      <div className={styles.page}>
        <main className={styles.main}>
          <div style={{ textAlign: "center", padding: "4rem 1rem" }}>
            <h1 style={{ fontSize: "1.5rem", fontWeight: 800 }}>
              Site not found
            </h1>
            <p style={{ color: "#666", marginTop: "0.5rem" }}>
              There is no site configured at <code>{hostCtx.host || host}</code>
              .
            </p>
          </div>
        </main>
      </div>
    );
  }

  const landingRootDomain = host === "localhost" ? rootDomain : host;

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <LandingCard rootDomain={landingRootDomain} />
      </main>
    </div>
  );
}
