import type { Metadata } from "next";
import Link from "next/link";
import styles from "./page.module.css";
import { parseHost } from "./lib/tenant";
import { getRequestHost, getRequestOrigin } from "./lib/server-request";

type PublicProfile = {
  username: string;
  email: string;
  imageUrl: string | null;
  createdAt: string;
  tenant: { subdomain: string; customDomain: string | null; createdAt: string };
};

async function getTenantPublicProfile(origin: string, host: string) {
  // Use the same origin so this works robustly with Caddy + custom domains.
  // (Next rewrites /api/* to the API server in dev; in prod Caddy routes /api/* to the API.)
  const res = await fetch(`${origin}/api/profile/public`, {
    headers: { host },
    cache: "no-store",
  });
  if (!res.ok) return null;
  return (await res.json()) as PublicProfile;
}

export async function generateMetadata(): Promise<Metadata> {
  const host = await getRequestHost();
  const hostCtx = parseHost(host);
  const origin = await getRequestOrigin();

  if (hostCtx.type === "tenant") {
    const profile = await getTenantPublicProfile(origin, host);
    if (!profile) {
      return {
        title: "Site not found",
        description: `The tenant ${hostCtx.subdomain} does not exist.`,
        alternates: { canonical: origin },
      };
    }

    const title = `${profile.username}'s profile`;
    const description = profile.tenant.customDomain
      ? `Public profile of ${profile.username} at ${profile.tenant.customDomain}`
      : `Public profile of ${profile.username} at ${profile.tenant.subdomain}.${process.env.NEXT_PUBLIC_ROOT_DOMAIN || "lvh.me"}`;
    const image = profile.imageUrl ? `${origin}${profile.imageUrl}` : undefined;

    return {
      title,
      description,
      alternates: { canonical: origin },
      openGraph: {
        type: "profile",
        title,
        description,
        url: origin,
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

  return {
    title: "Multi Tenant App",
    description: "Create a profile site on a subdomain or custom domain.",
    alternates: { canonical: origin },
  };
}

export default async function Home() {
  const host = await getRequestHost();
  const hostCtx = parseHost(host);

  if (hostCtx.type === "tenant") {
    const origin = await getRequestOrigin();
    const profile = await getTenantPublicProfile(origin, host);

    return (
      <div className={styles.page}>
        <main className={styles.main}>
          {!profile ? (
            <>
              <h1>Site not found</h1>
              <p>
                The tenant <b>{hostCtx.subdomain}</b> does not exist.
              </p>
              <p>
                <Link href="/login">Login</Link> or <Link href="/register">Register</Link>
              </p>
            </>
          ) : (
            <div className={styles.card}>
              <h1>{profile.username}</h1>
              <p className={styles.muted}>{profile.email}</p>
              {profile.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className={styles.avatar} src={profile.imageUrl} alt={`${profile.username} avatar`} />
              ) : null}
              <div className={styles.row}>
                <Link className={styles.link} href="/edit">
                  Edit profile
                </Link>
                <Link className={styles.link} href="/logout">
                  Logout
                </Link>
              </div>
            </div>
          )}
        </main>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <div className={styles.card}>
          <h1>Multi Tenant App</h1>
          <p className={styles.muted}>
            Create your own profile site on a subdomain. Your public profile lives at{" "}
            <code>username.{process.env.NEXT_PUBLIC_ROOT_DOMAIN || "lvh.me"}</code>.
          </p>
          <div className={styles.row}>
            <Link className={styles.link} href="/register">
              Register
            </Link>
            <Link className={styles.link} href="/login">
              Login
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}

