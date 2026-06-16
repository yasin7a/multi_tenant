"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import styles from "@/app/auth.module.css";
import { dnsHostHint, verifyCustomDomain } from "@/lib/api/custom-domain";
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
  const verifyTimer = useRef<number | null>(null);

  // Ref so runVerify stays stable across keystrokes — avoids effect churn
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
  }, []); // stable — reads latest via ref

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
  }, [customDomain, customDomainDisabled]); // runVerify stable — no longer a dep

  return (
    <>
      <label className={styles.label}>
        Custom domain (optional)
        <input
          className={styles.input}
          name="customDomain"
          autoComplete="url"
          value={customDomain}
          onChange={(e) => {
            onCustomDomainChange(e.target.value);
            if (!customDomainDisabled) scheduleVerify(e.target.value);
          }}
          placeholder="mysite.com"
          disabled={loading}
        />
      </label>

      {customDomain.trim() ? (
        <div className={styles.panel}>
          <label
            className={styles.label}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              margin: 0,
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
              ? "Custom domain is off. Visitors use your subdomain only; DNS/HTTPS for this domain will not work."
              : "Custom domain is on. Visitors can use this domain after DNS is configured."}
          </div>
        </div>
      ) : null}

      {domainStatus?.domain && !customDomainDisabled ? (
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
    </>
  );
}
