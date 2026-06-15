#!/bin/bash
set -e

DIR="$(cd "$(dirname "$0")/.." && pwd)"
CERT="/etc/letsencrypt/live/multi.takitahmid.com/fullchain.pem"

if ! command -v caddy >/dev/null; then
  apt-get update
  apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl acl
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    | tee /etc/apt/sources.list.d/caddy-stable.list
  apt-get update && apt-get install -y caddy acl
fi

[ -f "$CERT" ] || { echo "Cert missing. Run certbot first (see README.md)"; exit 1; }

# Old nginx / stale override can block ports or break caddy
systemctl stop nginx 2>/dev/null || true
systemctl disable nginx 2>/dev/null || true
rm -f /etc/systemd/system/caddy.service.d/override.conf
systemctl daemon-reload

# caddy user must read letsencrypt files (validate as root can hide this)
setfacl -R -m u:caddy:rx /etc/letsencrypt/live /etc/letsencrypt/archive 2>/dev/null \
  || usermod -aG ssl-cert caddy 2>/dev/null || true

cp "$DIR/caddy/Caddyfile" /etc/caddy/Caddyfile
caddy validate --config /etc/caddy/Caddyfile

systemctl enable caddy
systemctl restart caddy
sleep 1

if ! systemctl is-active --quiet caddy; then
  echo "Caddy failed to start:"
  journalctl -u caddy -n 20 --no-pager
  exit 1
fi

if ! ss -tln | grep -q ':443'; then
  echo "Caddy running but not on port 443:"
  journalctl -u caddy -n 20 --no-pager
  exit 1
fi

echo "OK: https://multi.takitahmid.com"
