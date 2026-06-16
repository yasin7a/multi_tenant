"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import styles from "@/app/auth.module.css";
import { dnsHostHint, verifyCustomDomain } from "@/lib/api/custom-domain";
import type { DomainVerify } from "@/types";

type Props = {
  customDomain: string;
  savedCustomDomain: string;
  editingCustomDomain: boolean;
  customDomainDisabled: boolean;
  loading: boolean;
  onCustomDomainChange: (value: string) => void;
  onEditingChange: (editing: boolean) => void;
  onDisabledChange: (disabled: boolean) => void;
  onRemove: () => void;
  onMessage: (message: string | null) => void;
};

const VERIFY_INTERVAL_MS = 5000;

export default function CustomDomainSection({
  customDomain,
  savedCustomDomain,
  editingCustomDomain,
  customDomainDisabled,
  loading,
  onCustomDomainChange,
  onEditingChange,
  onDisabledChange,
  onRemove,
  onMessage,
}: Props) {
  const [domainStatus, setDomainStatus] = useState<DomainVerify | null>(null);
  const [verifying, setVerifying] = useState(false);
  const verifyTimer = useRef<number | null>(null);

  const runVerify = useCallback(async (domain?: string) => {
    const value = (domain ?? customDomain).trim().toLowerCase();
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
  }, [customDomain]);

  function scheduleVerify(nextValue: string) {
    if (verifyTimer.current) window.clearTimeout(verifyTimer.current);
    verifyTimer.current = window.setTimeout(() => runVerify(nextValue), 400);
  }

  useEffect(() => {
    if (!customDomain.trim() || customDomainDisabled) return;
    const immediate = window.setTimeout(() => void runVerify(customDomain), 0);
    const t = window.setInterval(() => void runVerify(customDomain), VERIFY_INTERVAL_MS);
    return () => {
      window.clearTimeout(immediate);
      window.clearInterval(t);
    };
  }, [customDomain, customDomainDisabled, runVerify]);

  function startChange() {
    onEditingChange(true);
    onMessage(null);
  }

  function cancelChange() {
    onCustomDomainChange(savedCustomDomain);
    onEditingChange(!savedCustomDomain);
    setDomainStatus(null);
    if (savedCustomDomain && !customDomainDisabled) runVerify(savedCustomDomain);
  }

  function statusPanel(showWhileEditing: boolean) {
    if (!domainStatus?.domain || customDomainDisabled) return null;
    if (showWhileEditing !== editingCustomDomain) return null;

    return (
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
                A {dnsHostHint(domainStatus.domain)} → {domainStatus.expectedIp}
              </span>
            </>
          ) : null}
          <br />
          {verifying ? "Checking DNS…" : "Rechecking every 5 seconds…"}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className={styles.label}>
        Custom domain
        {savedCustomDomain && !editingCustomDomain ? (
          <div className={styles.panel}>
            <div className={styles.panelRow}>
              <div className={styles.mono}>{savedCustomDomain}</div>
              {!customDomainDisabled ? (
                <span
                  className={[
                    styles.badge,
                    domainStatus?.verified ? styles.badgeValid : styles.badgePending,
                  ].join(" ")}
                >
                  {domainStatus?.verified ? "✓ Valid" : "Pending DNS"}
                </span>
              ) : (
                <span className={styles.badge}>Disabled</span>
              )}
            </div>
            {!customDomainDisabled && domainStatus?.domain ? (
              <div className={styles.hint}>
                {domainStatus.verified
                  ? "DNS is pointing to this server. HTTPS will be issued on first visit."
                  : domainStatus.expectedIp
                    ? `Add an A record pointing to ${domainStatus.expectedIp}.`
                    : "Configure DNS at your domain provider."}
                {domainStatus.expectedIp ? (
                  <>
                    <br />
                    <span className={styles.mono}>
                      A {dnsHostHint(domainStatus.domain)} → {domainStatus.expectedIp}
                    </span>
                  </>
                ) : null}
                <br />
                {verifying ? "Checking DNS…" : "Rechecking every 5 seconds…"}
              </div>
            ) : customDomainDisabled ? (
              <div className={styles.hint}>
                Custom domain is disabled. Enable it below to use this domain.
              </div>
            ) : null}
            <div className={styles.actions} style={{ marginTop: 10 }}>
              <button type="button" className={styles.button} onClick={startChange} disabled={loading}>
                Change domain
              </button>
              <button type="button" className={styles.button} onClick={onRemove} disabled={loading}>
                Remove domain
              </button>
            </div>
          </div>
        ) : (
          <>
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
            {savedCustomDomain ? (
              <div className={styles.actions}>
                <button type="button" className={styles.button} onClick={cancelChange} disabled={loading}>
                  Cancel
                </button>
              </div>
            ) : null}
          </>
        )}
      </div>

      <label className={styles.label} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <input
          type="checkbox"
          name="customDomainDisabled"
          checked={customDomainDisabled}
          onChange={(e) => {
            onDisabledChange(e.target.checked);
            if (e.target.checked) setDomainStatus(null);
            else if (customDomain.trim()) scheduleVerify(customDomain);
          }}
          disabled={loading}
        />
        Disable custom domain
      </label>

      {customDomainDisabled && customDomain.trim() ? (
        <div className={styles.hint}>
          Custom domain is saved but disabled. Visitors must use your subdomain; DNS and HTTPS for this domain will not work.
        </div>
      ) : null}

      {statusPanel(true)}
    </>
  );
}
