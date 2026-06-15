#!/bin/bash
set -e

DIR="$(cd "$(dirname "$0")/.." && pwd)"
ROOT_DOMAIN="${ROOT_DOMAIN:-$(grep -E '^ROOT_DOMAIN=' "$DIR/.env" 2>/dev/null | cut -d= -f2- | tr -d '"' | tr -d "'")}"
ROOT_DOMAIN="${ROOT_DOMAIN:-multi.takitahmid.com}"
CERT="/etc/letsencrypt/live/${ROOT_DOMAIN}/fullchain.pem"

if ! command -v caddy >/dev/null; then
  apt-get update
  apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl acl
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    | tee /etc/apt/sources.list.d/caddy-stable.list
  apt-get update && apt-get install -y caddy acl
fi

if [ ! -f "$CERT" ]; then
  echo "Wildcard cert missing at $CERT"
  echo "Issue once: certbot certonly --manual --preferred-challenges dns -d ${ROOT_DOMAIN} -d *.${ROOT_DOMAIN}"
  exit 1
fi

# nginx or another service on :80/:443 prevents Caddy from starting
systemctl stop nginx 2>/dev/null || true
systemctl disable nginx 2>/dev/null || true

if command -v ufw >/dev/null && ufw status 2>/dev/null | grep -q 'Status: active'; then
  ufw allow 80/tcp
  ufw allow 443/tcp
fi

setfacl -R -m u:caddy:rx /etc/letsencrypt/live /etc/letsencrypt/archive 2>/dev/null \
  || usermod -aG ssl-cert caddy 2>/dev/null || true

if ! curl -sf --max-time 2 "http://127.0.0.1:3000/" >/dev/null; then
  echo "WARNING: App is not responding on :3000. Start it first: pm2 restart multi-tenant"
fi

sed "s/__ROOT_DOMAIN__/${ROOT_DOMAIN}/g" "$DIR/caddy/Caddyfile" > /etc/caddy/Caddyfile
caddy validate --config /etc/caddy/Caddyfile

systemctl enable caddy
systemctl restart caddy
sleep 2

if ! systemctl is-active --quiet caddy; then
  echo "Caddy failed to start:"
  journalctl -u caddy -n 30 --no-pager
  exit 1
fi

if ! ss -tln | grep -q ':443'; then
  echo "Caddy is running but nothing is listening on :443:"
  journalctl -u caddy -n 30 --no-pager
  exit 1
fi

echo "OK: https://${ROOT_DOMAIN} (ports 80 and 443 open, proxying to :3000)"
