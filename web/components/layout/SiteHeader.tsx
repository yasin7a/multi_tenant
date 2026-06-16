import Link from "next/link";
import styles from "./SiteHeader.module.css";
import LogoutButton from "./LogoutButton";
import { getMe } from "@/lib/api/profile";
import {
  getRequestCookieHeader,
  getRequestHost,
} from "@/lib/server-request";

export default async function SiteHeader() {
  const [host, cookie] = await Promise.all([getRequestHost(), getRequestCookieHeader()]);
  const me = await getMe(host, cookie);

  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link className={styles.brand} href="/">
          Multi Tenant App
        </Link>

        <nav className={styles.nav}>
          {me ? (
            <>
              <Link className={styles.pill} href="/edit">
                Edit profile
              </Link>
              <LogoutButton className={`${styles.pill} ${styles.buttonLike}`}>
                Logout
              </LogoutButton>
            </>
          ) : (
            <>
              <Link className={styles.pill} href="/login">
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
