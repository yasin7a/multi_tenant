import Link from "next/link";
import styles from "@/app/page.module.css";

type Props = {
  rootDomain: string;
};

export default function LandingCard({ rootDomain }: Props) {
  return (
    <div className={styles.card}>
      <h1>Multi Tenant App</h1>
      <p className={styles.muted}>
        Create your own profile site on a subdomain. Your public profile lives at{" "}
        <code>username.{rootDomain}</code>.
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
  );
}
