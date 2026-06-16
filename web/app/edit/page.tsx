"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import styles from "../auth.module.css";
import LogoutButton from "../components/LogoutButton";

type Me = {
  id: string;
  username: string;
  email: string;
  imageUrl: string | null;
  tenant: { subdomain: string; customDomain: string | null };
};

type DomainVerify = {
  domain: string | null;
  verified: boolean;
  expectedIp: string | null;
  addresses: string[];
  status: "none" | "valid" | "pending";
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

  const [domainStatus, setDomainStatus] = useState<DomainVerify | null>(null);
  const verifyTimer = useRef<number | null>(null);

  const rootDomain = useMemo(
    () => process.env.NEXT_PUBLIC_ROOT_DOMAIN || "lvh.me",
    [],
  );

  function dnsHostHint(domain: string) {
    if (!domain || !domain.includes(".")) return "@ (or your domain root)";
    const parts = domain.split(".");
    if (parts.length <= 2) return "@ (or your domain root)";
    return `${parts[0]} (subdomain)`;
  }

  const verifyDomain = useCallback(async (domain?: string) => {
    const value = (domain ?? customDomain).trim().toLowerCase();
    if (!value) {
      setDomainStatus(null);
      return;
    }
    try {
      const res = await fetch(`/api/custom-domain/verify?domain=${encodeURIComponent(value)}`, {
        headers: { accept: "application/json" },
        credentials: "include",
      });
      if (!res.ok) return;
      setDomainStatus((await res.json()) as DomainVerify);
    } catch {
      // ignore
    }
  }, [customDomain]);

  function scheduleVerify(nextValue: string) {
    if (verifyTimer.current) window.clearTimeout(verifyTimer.current);
    verifyTimer.current = window.setTimeout(() => verifyDomain(nextValue), 400);
  }

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
        if (data.tenant?.customDomain) verifyDomain(data.tenant.customDomain);
      })
      .catch(() => {
        if (!cancelled) window.location.href = "/login";
      });
    return () => {
      cancelled = true;
    };
  }, [verifyDomain]);

  useEffect(() => {
    if (!customDomain.trim()) return;
    const t = window.setInterval(() => verifyDomain(customDomain), 15000);
    return () => window.clearInterval(t);
  }, [customDomain, verifyDomain]);

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
      if (customDomain.trim()) verifyDomain(customDomain);
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
              onChange={(e) => {
                setCustomDomain(e.target.value);
                scheduleVerify(e.target.value);
              }}
              placeholder="mysite.com"
              disabled={loading}
            />
          </label>
          {domainStatus?.domain ? (
            <div className={styles.panel}>
              <div className={styles.panelRow}>
                <div className={styles.mono}>{domainStatus.domain}</div>
                <span
                  className={[
                    styles.badge,
                    domainStatus.verified ? styles.badgeValid : styles.badgePending,
                  ].join(" ")}
                >
                  {domainStatus.verified ? "✓ Valid configuration" : "Pending DNS"}
                </span>
              </div>
              <div className={styles.hint}>
                {domainStatus.verified
                  ? "DNS is pointing to this server. HTTPS will be issued automatically on first visit."
                  : domainStatus.expectedIp
                    ? `Add an A record pointing to ${domainStatus.expectedIp}. Checking again…`
                    : "Configure DNS at your domain provider. Checking again…"}
                {domainStatus.expectedIp ? (
                  <>
                    <br />
                    <span className={styles.mono}>
                      A {dnsHostHint(domainStatus.domain)} → {domainStatus.expectedIp}
                    </span>
                  </>
                ) : null}
              </div>
            </div>
          ) : null}
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
            <LogoutButton className={styles.link}>Logout</LogoutButton>
          </div>
        </form>
      </div>
    </div>
  );
}

