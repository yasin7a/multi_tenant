import Link from "next/link";
import styles from "./SiteHeader.module.css";
import LogoutButton from "./LogoutButton";
import { getRequestCookieHeader, getRequestHost, getRequestOrigin } from "../lib/server-request";

type Me = {
  id: string;
  username: string;
  email: string;
  tenant: { subdomain: string; customDomain: string | null };
};

async function getMe() {
  const [origin, host, cookie] = await Promise.all([
    getRequestOrigin(),
    getRequestHost(),
    getRequestCookieHeader(),
  ]);
  if (!cookie) return null;

  const res = await fetch(`${origin}/api/profile/me`, {
    headers: { host, cookie, accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) return null;
  return (await res.json()) as Me;
}

export default async function SiteHeader() {
  const me = await getMe();

  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link className={styles.brand} href="/">
          Multi Tenant App
        </Link>

        <nav className={styles.nav}>
          {me ? (
            <>
              <Link className={`${styles.pill}`} href="/edit">
                Edit profile
              </Link>
              <LogoutButton className={`${styles.pill} ${styles.buttonLike}`}>
                Logout
              </LogoutButton>
            </>
          ) : (
            <>
              <Link className={`${styles.pill}`} href="/login">
                Sign in
              </Link>
              <Link className={`${styles.pill} ${styles.primary}`} href="/register">
                Register
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

