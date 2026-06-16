"use client";

import { useState } from "react";
import Link from "next/link";
import styles from "../auth.module.css";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.message || data?.error || "Login failed");

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
        {error ? <div className={styles.error}>{error}</div> : null}
        <form className={styles.form} onSubmit={onSubmit}>
          <label className={styles.label}>
            Email
            <input className={styles.input} value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className={styles.label}>
            Password
            <input
              className={styles.input}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <div className={styles.actions}>
            <button className={`${styles.button} ${styles.buttonPrimary}`} disabled={loading}>
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

