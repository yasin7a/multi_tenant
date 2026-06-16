"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import styles from "./page.module.css";
import { parseHost } from "./lib/tenant";

type PublicProfile = {
  username: string;
  email: string;
  imageUrl: string | null;
  createdAt: string;
  tenant: { subdomain: string; customDomain: string | null; createdAt: string };
};

export default function Home() {
  const [hostCtx, setHostCtx] = useState(() => parseHost("localhost"));
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  useEffect(() => {
    setHostCtx(parseHost(window.location.hostname));
  }, []);

  useEffect(() => {
    if (hostCtx.type !== "tenant") return;
    let cancelled = false;
    fetch("/api/profile/public", { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json())?.error || "not found");
        return r.json();
      })
      .then((data) => {
        if (!cancelled) setProfile(data);
      })
      .catch(() => {
        if (!cancelled) setProfileError("Site not found");
      });
    return () => {
      cancelled = true;
    };
  }, [hostCtx.type]);

  if (hostCtx.type === "tenant") {
    return (
      <div className={styles.page}>
        <main className={styles.main}>
          {profileError ? (
            <>
              <h1>{profileError}</h1>
              <p>
                The tenant <b>{hostCtx.subdomain}</b> does not exist.
              </p>
              <p>
                <Link href="/login">Login</Link> or <Link href="/register">Register</Link>
              </p>
            </>
          ) : !profile ? (
            <p>Loading…</p>
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
            Create your own profile site on a subdomain. Your public profile lives at <code>username.{process.env.NEXT_PUBLIC_ROOT_DOMAIN || "lvh.me"}</code>.
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
