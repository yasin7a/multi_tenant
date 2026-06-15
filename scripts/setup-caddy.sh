#!/bin/bash
set -e

DIR="$(cd "$(dirname "$0")/.." && pwd)"
ROOT_DOMAIN="${ROOT_DOMAIN:-$(grep -E '^ROOT_DOMAIN=' "$DIR/.env" 2>/dev/null | cut -d= -f2- | tr -d '"' | tr -d "'")}"
ROOT_DOMAIN="${ROOT_DOMAIN:-multi.takitahmid.com}"
CERT="/etc/letsencrypt/live/${ROOT_DOMAIN}/fullchain.pem"

if ! command -v caddy >/dev/null; then
  apt-get update
  apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
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

setfacl -R -m u:caddy:rx /etc/letsencrypt/live /etc/letsencrypt/archive 2>/dev/null \
  || usermod -aG ssl-cert caddy 2>/dev/null || true

sed "s/__ROOT_DOMAIN__/${ROOT_DOMAIN}/g" "$DIR/caddy/Caddyfile" > /etc/caddy/Caddyfile
caddy validate --config /etc/caddy/Caddyfile

systemctl enable caddy
systemctl restart caddy

echo "OK: Platform subdomains use wildcard SSL; custom domains use on-demand TLS."
