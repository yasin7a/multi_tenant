"use client";

import { useState } from "react";
import Link from "next/link";
import styles from "../auth.module.css";
import { getClientApiBase } from "@/lib/api-origin";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [redirectUrl, setRedirectUrl] = useState<string | null>(null);
  const [redirectSeconds, setRedirectSeconds] = useState<number>(0);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setRedirectUrl(null);
    setRedirectSeconds(0);
    setLoading(true);
    try {
      const r = await fetch(`${getClientApiBase()}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        // Wrong tenant: show warning and redirect after 5s (old behavior)
        if (r.status === 403 && data?.redirectUrl) {
          setError(
            data?.message ||
              "This site belongs to someone else. Redirecting you…",
          );
          setRedirectUrl(String(data.redirectUrl));
          setRedirectSeconds(5);
          for (let i = 4; i >= 0; i -= 1) {
            window.setTimeout(() => setRedirectSeconds(i), (5 - i) * 1000);
          }
          window.setTimeout(() => {
            window.location.href = String(data.redirectUrl);
          }, 5000);
          return;
        }

        throw new Error(data?.message || data?.error || "Login failed");
      }

      if (data?.redirectUrl) {
        window.location.href = data.redirectUrl;
        return;
      }

      window.location.href = "/edit";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>Login</h1>
        <p className={styles.muted}>Login on your tenant domain/subdomain.</p>
        {error ? (
          <div className={styles.error}>
            {error}
            {redirectUrl ? (
              <div style={{ marginTop: 8 }}>
                Redirecting in <b>{redirectSeconds}</b>s —{" "}
                <a className={styles.link} href={redirectUrl}>
                  go now
                </a>
              </div>
            ) : null}
          </div>
        ) : null}
        <form className={styles.form} onSubmit={onSubmit} aria-busy={loading}>
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
            Password
            <input
              className={styles.input}
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
            />
          </label>
          <div className={styles.actions}>
            <button
              type="submit"
              className={`${styles.button} ${styles.buttonPrimary}`}
              disabled={loading}
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
            <Link className={styles.link} href="/register">
              Create account
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
