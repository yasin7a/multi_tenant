"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import styles from "@/app/auth.module.css";
import {
  dnsHostHint,
  removeCustomDomain,
  verifyCustomDomain,
} from "@/lib/api/custom-domain";
import type { DomainVerify } from "@/types";

type Props = {
  customDomain: string;
  customDomainDisabled: boolean;
  loading: boolean;
  onCustomDomainChange: (value: string) => void;
  onDisabledChange: (disabled: boolean) => void;
};

const VERIFY_INTERVAL_MS = 5000;

export default function CustomDomainSection({
  customDomain,
  customDomainDisabled,
  loading,
  onCustomDomainChange,
  onDisabledChange,
}: Props) {
  const [domainStatus, setDomainStatus] = useState<DomainVerify | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [showInput, setShowInput] = useState(false);
  const verifyTimer = useRef<number | null>(null);

  const hasDomain = Boolean(customDomain.trim());
  const domainActive = hasDomain && !customDomainDisabled;

  // Ref so runVerify stays stable across keystrokes
  const customDomainRef = useRef(customDomain);
  customDomainRef.current = customDomain;

  const runVerify = useCallback(async (domain?: string) => {
    const value = (domain ?? customDomainRef.current).trim().toLowerCase();
    if (!value) {
      setDomainStatus(null);
      return;
    }
    setVerifying(true);
    try {
      const result = await verifyCustomDomain(value);
      if (result) setDomainStatus(result);
    } finally {
      setVerifying(false);
    }
  }, []);

  function scheduleVerify(nextValue: string) {
    if (verifyTimer.current) window.clearTimeout(verifyTimer.current);
    verifyTimer.current = window.setTimeout(() => runVerify(nextValue), 400);
  }

  useEffect(() => {
    if (!customDomain.trim() || customDomainDisabled) return;
    const immediate = window.setTimeout(() => void runVerify(customDomain), 0);
    const t = window.setInterval(
      () => void runVerify(customDomain),
      VERIFY_INTERVAL_MS,
    );
    return () => {
      window.clearTimeout(immediate);
      window.clearInterval(t);
    };
  }, [customDomain, customDomainDisabled]);

  async function handleRemove() {
    if (removing) return;
    setRemoving(true);
    try {
      const ok = await removeCustomDomain();
      if (ok) {
        onCustomDomainChange("");
        onDisabledChange(true);
        setDomainStatus(null);
        setShowInput(false);
      }
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div className={styles.panel} style={{ marginTop: 0 }}>
      {/* ── Section header ── */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontWeight: 800, fontSize: 15 }}>Custom Domain</div>
        <div className={styles.hint} style={{ margin: "4px 0 0" }}>
          Use your own domain (e.g. mysite.com) instead of the default
          subdomain.
        </div>
      </div>

      {/* ── Has domain set ── */}
      {hasDomain ? (
        <>
          {/* Domain display + actions */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            <span
              className={styles.mono}
              style={{ fontSize: 15, fontWeight: 700 }}
            >
              {customDomain}
            </span>
            <span
              className={[
                styles.badge,
                domainActive ? styles.badgeValid : styles.badgePending,
              ].join(" ")}
            >
              {domainActive ? "Active" : "Disabled"}
            </span>
          </div>

          {/* Enable toggle */}
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginTop: 10,
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              name="customDomainEnabled"
              checked={!customDomainDisabled}
              onChange={(e) => {
                onDisabledChange(!e.target.checked);
                if (!e.target.checked) setDomainStatus(null);
                else scheduleVerify(customDomain);
              }}
              disabled={loading}
            />
            Enable custom domain
          </label>

          <div className={styles.hint}>
            {customDomainDisabled
              ? "Off — visitors use your subdomain only."
              : "On — visitors can use this domain after DNS is set up."}
          </div>

          {/* DNS status (only when enabled) */}
          {domainActive && domainStatus?.domain ? (
            <div
              style={{
                marginTop: 10,
                padding: 10,
                borderRadius: 8,
                border: "1px solid #ebebeb",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                }}
              >
                <span className={styles.mono}>{domainStatus.domain}</span>
                <span
                  className={[
                    styles.badge,
                    domainStatus.verified
                      ? styles.badgeValid
                      : styles.badgePending,
                  ].join(" ")}
                >
                  {domainStatus.verified ? "✓ DNS OK" : "Pending DNS"}
                </span>
              </div>
              <div className={styles.hint}>
                {domainStatus.verified
                  ? "DNS is pointing to this server. HTTPS issues automatically on first visit."
                  : domainStatus.expectedIp
                    ? `Add an A record pointing to ${domainStatus.expectedIp}.`
                    : "Configure DNS at your domain provider."}
                {domainStatus.expectedIp ? (
                  <>
                    <br />
                    <span className={styles.mono}>
                      A {dnsHostHint(domainStatus.domain)} →{" "}
                      {domainStatus.expectedIp}
                    </span>
                  </>
                ) : null}
                <br />
                {verifying ? "Checking DNS…" : "Rechecking every 5 seconds…"}
              </div>
            </div>
          ) : null}

          {/* Remove button */}
          <button
            type="button"
            className={styles.button}
            onClick={handleRemove}
            disabled={loading || removing}
            style={{
              marginTop: 12,
              color: "#c00",
              borderColor: "#fcc",
              background: "#fff5f5",
            }}
          >
            {removing ? "Removing…" : "Remove domain"}
          </button>
        </>
      ) : showInput ? (
        /* ── Add domain input ── */
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <input
            className={styles.input}
            name="customDomain"
            autoComplete="url"
            placeholder="mysite.com"
            value={customDomain}
            onChange={(e) => {
              onCustomDomainChange(e.target.value);
              scheduleVerify(e.target.value);
            }}
            disabled={loading}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              className={styles.button}
              onClick={() => {
                onCustomDomainChange("");
                setShowInput(false);
              }}
              disabled={loading}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        /* ── No domain — add button ── */
        <button
          type="button"
          className={`${styles.button} ${styles.buttonPrimary}`}
          onClick={() => setShowInput(true)}
          disabled={loading}
        >
          + Add custom domain
        </button>
      )}
    </div>
  );
}
