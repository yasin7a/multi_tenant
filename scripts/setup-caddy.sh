#!/usr/bin/env bash
set -euo pipefail

# Run on Ubuntu/Debian server as root or with sudo.
# Usage: sudo ACME_EMAIL=you@email.com bash scripts/setup-caddy.sh

APP_DIR="${APP_DIR:-/var/www/multi_tenant}"
ACME_EMAIL="${ACME_EMAIL:-admin@takitahmid.com}"

echo "==> Installing Caddy..."
if ! command -v caddy >/dev/null 2>&1; then
  apt-get update
  apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    | tee /etc/apt/sources.list.d/caddy-stable.list
  apt-get update
  apt-get install -y caddy
fi

echo "==> Copying Caddyfile (email: $ACME_EMAIL)..."
sed "s/ACME_EMAIL_PLACEHOLDER/$ACME_EMAIL/" "$APP_DIR/caddy/Caddyfile" > /etc/caddy/Caddyfile

echo "==> Validating Caddyfile..."
caddy validate --config /etc/caddy/Caddyfile

echo "==> Stopping nginx (Caddy uses ports 80 and 443)..."
if systemctl is-active --quiet nginx; then
  systemctl stop nginx
  systemctl disable nginx
fi

echo "==> Starting Caddy..."
systemctl daemon-reload
systemctl enable caddy
systemctl restart caddy

echo "==> Done. Status:"
systemctl status caddy --no-pager || true
echo ""
echo "If failed, run: journalctl -xeu caddy.service --no-pager | tail -30"
echo "App must be running: pm2 start server.js --name multi-tenant"
