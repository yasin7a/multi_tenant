import styles from "@/app/page.module.css";
import { resolveImageSrc } from "@/lib/assets";
import { formatDate } from "@/lib/format";
import type { Me, PublicProfile } from "@/types";

type Props = {
  profile: PublicProfile;
  me: Me | null;
  rootDomain: string;
  origin: string;
};

export default function PublicProfileCard({ profile, me, rootDomain, origin }: Props) {
  const siteLabel =
    profile.tenant.customDomain && profile.tenant.customDomainEnabled !== false
      ? profile.tenant.customDomain
      : `${profile.tenant.subdomain}.${rootDomain}`;

  const avatarSrc = resolveImageSrc(profile.imageUrl, origin);

  return (
    <div className={styles.card}>
      <h1>{profile.username}</h1>
      <div className={styles.subTitle}>
        <span className={styles.pill}>{siteLabel}</span>
        <span className={styles.mono}>
          {me?.tenant?.subdomain === profile.tenant.subdomain ? "Signed in" : "Public profile"}
        </span>
      </div>

      {avatarSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className={styles.avatar}
          src={avatarSrc}
          alt={`${profile.username} avatar`}
        />
      ) : (
        <div className={styles.avatarFallback} aria-label="Avatar">
          {profile.username?.slice(0, 1)?.toUpperCase()}
        </div>
      )}

      <div className={styles.infoGrid}>
        <div className={styles.infoItem}>
          <span className={styles.infoLabel}>Username</span>
          <span>{profile.username}</span>
        </div>
        <div className={styles.infoItem}>
          <span className={styles.infoLabel}>Email</span>
          <span>{profile.email}</span>
        </div>
        <div className={styles.infoItem}>
          <span className={styles.infoLabel}>Member since</span>
          <span>{formatDate(profile.createdAt)}</span>
        </div>
        <div className={styles.infoItem}>
          <span className={styles.infoLabel}>Site created</span>
          <span>{formatDate(profile.tenant.createdAt)}</span>
        </div>
      </div>
    </div>
  );
}
