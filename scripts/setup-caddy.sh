#!/usr/bin/env bash
set -euo pipefail

# Run on Ubuntu/Debian server as root or with sudo.
# Usage: sudo bash scripts/setup-caddy.sh

APP_DIR="${APP_DIR:-/var/www/multi_tenant}"
ACME_EMAIL="${ACME_EMAIL:-takitahmid@gmail.com}"

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

echo "==> Copying Caddyfile..."
cp "$APP_DIR/caddy/Caddyfile" /etc/caddy/Caddyfile

echo "==> Setting ACME email for Caddy..."
mkdir -p /etc/systemd/system/caddy.service.d
cat > /etc/systemd/system/caddy.service.d/override.conf <<EOF
[Service]
Environment=ACME_EMAIL=$ACME_EMAIL
EOF

echo "==> Stopping nginx (Caddy uses ports 80 and 443)..."
if systemctl is-active --quiet nginx; then
  systemctl stop nginx
  systemctl disable nginx
fi

echo "==> Starting Caddy..."
systemctl daemon-reload
systemctl enable caddy
systemctl reload caddy

echo "==> Done. Check status:"
systemctl status caddy --no-pager
echo ""
echo "App must be running on 127.0.0.1:3000 (pm2 start server.js --name multi-tenant)"
