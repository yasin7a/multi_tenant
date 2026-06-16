"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import styles from "@/app/auth.module.css";
import CustomDomainSection from "@/components/edit/CustomDomainSection";
import { updateProfile } from "@/lib/api/profile";
import type { Me } from "@/types";

export default function EditPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [customDomain, setCustomDomain] = useState("");
  const [savedCustomDomain, setSavedCustomDomain] = useState("");
  const [editingCustomDomain, setEditingCustomDomain] = useState(false);
  const [customDomainDisabled, setCustomDomainDisabled] = useState(false);
  const [image, setImage] = useState<File | null>(null);
  const [rootDomain, setRootDomain] = useState("lvh.me");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/profile/me", { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json())?.error || "not authenticated");
        return r.json();
      })
      .then((data: Me) => {
        if (cancelled) return;
        const saved = data.tenant?.customDomain || "";
        setMe(data);
        setUsername(data.username || "");
        setEmail(data.email || "");
        setCustomDomain(saved);
        setSavedCustomDomain(saved);
        setEditingCustomDomain(!saved);
        setCustomDomainDisabled(data.tenant?.customDomainEnabled === false);
        if (data.rootDomain) setRootDomain(data.rootDomain);
      })
      .catch(() => {
        if (!cancelled) window.location.href = "/login";
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function removeCustomDomain() {
    setCustomDomain("");
    setEditingCustomDomain(true);
    setError(null);
    setSuccess("Domain cleared. Click Save to apply.");
  }

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
      form.set("customDomainEnabled", customDomainDisabled ? "false" : "true");
      if (image) form.set("image", image);

      const data = await updateProfile(form);

      if (data?.redirectUrl) {
        window.location.href = data.redirectUrl;
        return;
      }

      const saved = data.tenant?.customDomain || "";
      setMe(data);
      setSavedCustomDomain(saved);
      setCustomDomain(saved);
      setEditingCustomDomain(!saved);
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
        <p className={styles.muted}>
          Update your public profile. If you set a custom domain, you may need DNS.
        </p>
        {error ? <div className={styles.error}>{error}</div> : null}
        {success ? <div className={styles.success}>{success}</div> : null}

        {me ? (
          <div className={styles.panel}>
            <div className={styles.panelRow}>
              <div>
                <div style={{ fontWeight: 800 }}>Your site</div>
                <div className={styles.mono}>
                  {username.toLowerCase()}.{rootDomain}
                </div>
              </div>
              <Link className={styles.link} href="/">
                Public page
              </Link>
            </div>
          </div>
        ) : null}

        {me?.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={me.imageUrl}
            alt="Current avatar"
            style={{
              width: 96,
              height: 96,
              borderRadius: 999,
              objectFit: "cover",
              marginBottom: 12,
            }}
          />
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

          <CustomDomainSection
            customDomain={customDomain}
            savedCustomDomain={savedCustomDomain}
            editingCustomDomain={editingCustomDomain}
            customDomainDisabled={customDomainDisabled}
            loading={loading}
            onCustomDomainChange={setCustomDomain}
            onEditingChange={setEditingCustomDomain}
            onDisabledChange={setCustomDomainDisabled}
            onRemove={removeCustomDomain}
            onMessage={setSuccess}
          />

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
            <button
              type="submit"
              className={`${styles.button} ${styles.buttonPrimary}`}
              disabled={loading}
            >
              {loading ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
