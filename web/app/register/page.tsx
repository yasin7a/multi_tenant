"use client";

import { useState } from "react";
import Link from "next/link";
import styles from "../auth.module.css";
import { getTenantWebUrl } from "../lib/tenant";

export default function RegisterPage() {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const r = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ username, email, password }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error || "Register failed");

      if (data?.subdomain) {
        window.location.href = `${getTenantWebUrl(data.subdomain)}/edit`;
        return;
      }

      window.location.href = "/edit";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Register failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>Register</h1>
        <p className={styles.muted}>
          Your public profile will be available on <b>{username || "username"}</b>.
        </p>
        {error ? <div className={styles.error}>{error}</div> : null}
        <form className={styles.form} onSubmit={onSubmit}>
          <label className={styles.label}>
            Username
            <input className={styles.input} value={username} onChange={(e) => setUsername(e.target.value)} />
          </label>
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
              {loading ? "Creating…" : "Create account"}
            </button>
            <Link className={styles.link} href="/login">
              Login
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}

