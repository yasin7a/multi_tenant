#!/bin/bash
set -e

DIR="$(cd "$(dirname "$0")/.." && pwd)"
CERT="/etc/letsencrypt/live/multi.takitahmid.com/fullchain.pem"

if ! command -v caddy >/dev/null; then
  apt-get update
  apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    | tee /etc/apt/sources.list.d/caddy-stable.list
  apt-get update && apt-get install -y caddy
fi

[ -f "$CERT" ] || { echo "Cert missing. See README.md"; exit 1; }

cp "$DIR/caddy/Caddyfile" /etc/caddy/Caddyfile
caddy validate --config /etc/caddy/Caddyfile
systemctl enable caddy
systemctl restart caddy

echo "Done: https://multi.takitahmid.com"
