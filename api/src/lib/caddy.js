/**
 * Caddy admin API helpers — localhost:2019
 * Used to manage SSL certs when domains are added/removed.
 */

const CADDY_ADMIN = "http://127.0.0.1:2019";

/** Attempt to remove a cached certificate for the given domain.
 *  Caddy v2 on_demand_tls auto-manages certs — this just
 *  triggers a config reload so Caddy re-evaluates active domains.
 */
export async function removeCaddyCertificate(domain) {
  if (!domain) return { ok: false, reason: "no domain" };

  try {
    // Caddy v2 admin API — GET current config then POST it back
    // This triggers a graceful reload, clearing stale cert cache entries
    const configRes = await fetch(`${CADDY_ADMIN}/config/`, {
      headers: { accept: "application/json" },
    });

    if (!configRes.ok) {
      return {
        ok: false,
        reason: `caddy config fetch failed: ${configRes.status}`,
      };
    }

    const config = await configRes.json();

    // Re-post the same config to trigger reload (clears cert cache)
    const reloadRes = await fetch(`${CADDY_ADMIN}/load`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(config),
    });

    if (!reloadRes.ok) {
      return { ok: false, reason: `caddy reload failed: ${reloadRes.status}` };
    }

    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : "unknown",
    };
  }
}
