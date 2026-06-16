/**
 * Caddy admin API helpers — localhost:2019
 * Used to manage SSL certs when domains are added/removed.
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const CADDY_ADMIN = "http://127.0.0.1:2019";

/**
 * Purge a cached on_demand_tls certificate so Caddy is forced to
 * re-ask the caddy-ask endpoint (which will return 403 for removed
 * domains, causing the browser to see a TLS / connection error).
 *
 * Tries, in order:
 *  1) Caddy admin API  DELETE /certificates/:domain   (Caddy ≥2.5)
 *  2) Delete cert files from Caddy's on-disk data directory
 *  3) Config reload (last resort — won't clear on_demand cache alone)
 */
export async function removeCaddyCertificate(domain) {
  if (!domain) return { ok: false, reason: "no domain" };

  // ── 1) Admin API cert deletion (Caddy ≥2.5) ──
  try {
    const delRes = await fetch(
      `${CADDY_ADMIN}/certificates/${encodeURIComponent(domain)}`,
      { method: "DELETE" },
    );
    if (delRes.ok) {
      await reloadCaddyConfig();
      return { ok: true, method: "api" };
    }
  } catch {
    // not available — try next method
  }

  // ── 2) Delete cert files from Caddy's data directory ──
  const deleted = await deleteCaddyCertFiles(domain);
  if (deleted) {
    await reloadCaddyConfig();
    return { ok: true, method: "files" };
  }

  // ── 3) Config reload as last resort ──
  try {
    await reloadCaddyConfig();
    return { ok: true, method: "reload-only" };
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : "unknown",
    };
  }
}

// ── helpers ──

async function reloadCaddyConfig() {
  const configRes = await fetch(`${CADDY_ADMIN}/config/`, {
    headers: { accept: "application/json" },
  });
  if (!configRes.ok) {
    throw new Error(`caddy config fetch failed: ${configRes.status}`);
  }
  const config = await configRes.json();
  const reloadRes = await fetch(`${CADDY_ADMIN}/load`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(config),
  });
  if (!reloadRes.ok) {
    throw new Error(`caddy reload failed: ${reloadRes.status}`);
  }
}

/**
 * Try to find and delete Caddy's on-disk certificate files for a domain.
 * Caddy stores on_demand_tls certs under its data directory as:
 *   {dataDir}/certificates/{domain}/{domain}.crt
 *   {dataDir}/certificates/{domain}/{domain}.key
 *   {dataDir}/certificates/{domain}/{domain}.json
 */
async function deleteCaddyCertFiles(domain) {
  const dataDirs = getCaddyDataDirCandidates();

  for (const dataDir of dataDirs) {
    const certDir = path.join(dataDir, "certificates", domain);
    try {
      await fs.access(certDir);
      // Directory exists — delete all files inside then the directory itself
      const entries = await fs.readdir(certDir);
      for (const entry of entries) {
        await fs.unlink(path.join(certDir, entry));
      }
      await fs.rm(certDir, { recursive: true, force: true });
      console.log(`[caddy] deleted cert files for ${domain} at ${certDir}`);
      return true;
    } catch {
      // directory doesn't exist — try next candidate
    }
  }

  return false;
}

/** Build a list of likely Caddy data-directory paths to probe. */
function getCaddyDataDirCandidates() {
  const candidates = [];

  // Explicit env var
  if (process.env.CADDYPATH) {
    candidates.push(process.env.CADDYPATH);
  }
  if (process.env.XDG_DATA_HOME) {
    candidates.push(path.join(process.env.XDG_DATA_HOME, "caddy"));
  }

  // Linux (systemd package)
  candidates.push("/var/lib/caddy/.local/share/caddy");

  // Linux / macOS (user)
  const home = os.homedir();
  if (home) {
    candidates.push(path.join(home, ".local", "share", "caddy"));
    candidates.push(path.join(home, "Library", "Application Support", "Caddy"));
  }

  // Snaps
  candidates.push(
    path.join(
      os.homedir(),
      "snap",
      "caddy",
      "current",
      ".local",
      "share",
      "caddy",
    ),
  );

  return candidates;
}
