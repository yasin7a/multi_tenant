import styles from "@/app/auth.module.css";

export default function EditPageSkeleton() {
  return (
    <div className={styles.page} aria-busy="true" aria-label="Loading profile">
      <div className={styles.card}>
        <div className={`${styles.skeleton} ${styles.skeletonTitle}`} />
        <div className={`${styles.skeleton} ${styles.skeletonLine}`} />
        <div className={`${styles.skeleton} ${styles.skeletonLineShort}`} />

        <div className={styles.panel}>
          <div className={styles.panelRow}>
            <div style={{ flex: 1 }}>
              <div className={`${styles.skeleton} ${styles.skeletonLabel}`} />
              <div className={`${styles.skeleton} ${styles.skeletonMono}`} />
            </div>
            <div className={`${styles.skeleton} ${styles.skeletonLink}`} />
          </div>
        </div>

        <div className={`${styles.skeleton} ${styles.skeletonAvatar}`} />

        <div className={styles.form}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className={styles.label}>
              <div className={`${styles.skeleton} ${styles.skeletonLabel}`} />
              <div className={`${styles.skeleton} ${styles.skeletonInput}`} />
            </div>
          ))}
          <div className={`${styles.skeleton} ${styles.skeletonButton}`} />
        </div>
      </div>
    </div>
  );
}
