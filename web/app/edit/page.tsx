"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import styles from "../auth.module.css";

type Me = {
  id: string;
  username: string;
  email: string;
  imageUrl: string | null;
  tenant: { subdomain: string; customDomain: string | null };
};

export default function EditPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [customDomain, setCustomDomain] = useState("");
  const [image, setImage] = useState<File | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/profile/me", { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json())?.error || "not authenticated");
        return r.json();
      })
      .then((data) => {
        if (cancelled) return;
        setMe(data);
        setUsername(data.username || "");
        setEmail(data.email || "");
        setCustomDomain(data.tenant?.customDomain || "");
      })
      .catch(() => {
        if (!cancelled) window.location.href = "/login";
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);
    try {
      const form = new FormData();
      form.set("username", username);
      form.set("email", email);
      form.set("customDomain", customDomain);
      if (image) form.set("image", image);

      const r = await fetch("/api/profile", {
        method: "POST",
        credentials: "include",
        body: form,
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error || "Update failed");

      if (data?.redirectUrl) {
        window.location.href = data.redirectUrl;
        return;
      }

      setMe(data);
      setSuccess("Profile updated.");
      setImage(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>Edit profile</h1>
        <p className={styles.muted}>Update your public profile. If you set a custom domain, you may need DNS.</p>
        {error ? <div className={styles.error}>{error}</div> : null}
        {success ? <div className={styles.success}>{success}</div> : null}

        {me?.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={me.imageUrl} alt="Current avatar" style={{ width: 96, height: 96, borderRadius: 999, objectFit: "cover", marginBottom: 12 }} />
        ) : null}

        <form className={styles.form} onSubmit={onSubmit} aria-busy={loading}>
          <label className={styles.label}>
            Username
            <input
              className={styles.input}
              name="username"
              autoComplete="username"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={loading}
            />
          </label>
          <label className={styles.label}>
            Email
            <input
              className={styles.input}
              name="email"
              type="email"
              autoComplete="email"
              inputMode="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
            />
          </label>
          <label className={styles.label}>
            Custom domain (optional)
            <input
              className={styles.input}
              name="customDomain"
              autoComplete="url"
              value={customDomain}
              onChange={(e) => setCustomDomain(e.target.value)}
              placeholder="mysite.com"
              disabled={loading}
            />
          </label>
          <label className={styles.label}>
            Profile image (optional)
            <input
              className={styles.input}
              name="image"
              type="file"
              accept="image/*"
              onChange={(e) => setImage(e.target.files?.[0] || null)}
              disabled={loading}
            />
          </label>
          <div className={styles.actions}>
            <button type="submit" className={`${styles.button} ${styles.buttonPrimary}`} disabled={loading}>
              {loading ? "Saving…" : "Save"}
            </button>
            <Link className={styles.link} href="/">
              View public profile
            </Link>
            <Link className={styles.link} href="/logout">
              Logout
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}

