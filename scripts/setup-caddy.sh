#!/bin/bash
set -e

DIR="$(cd "$(dirname "$0")/.." && pwd)"
API_DIR="$DIR/api"

read_env() {
  # read_env <file> <KEY>
  # Strips surrounding single/double quotes safely.
  local file="$1"
  local key="$2"
  [ -f "$file" ] || return 1
  sed -nE "s/^${key}=(.*)$/\\1/p" "$file" | head -n 1 | sed -E "s/^['\\\"]?(.*?)['\\\"]?$/\\1/"
}

ROOT_DOMAIN="${ROOT_DOMAIN:-$(read_env "$API_DIR/.env" ROOT_DOMAIN 2>/dev/null || true)}"
ROOT_DOMAIN="${ROOT_DOMAIN:-$(read_env "$DIR/.env" ROOT_DOMAIN 2>/dev/null || true)}"
ROOT_DOMAIN="${ROOT_DOMAIN:-multi.takitahmid.com}"

API_PORT="${API_PORT:-$(read_env "$API_DIR/.env" API_PORT 2>/dev/null || true)}"
API_PORT="${API_PORT:-$(read_env "$API_DIR/.env" PORT 2>/dev/null || true)}"
API_PORT="${API_PORT:-$(read_env "$DIR/.env" PORT 2>/dev/null || true)}"
API_PORT="${API_PORT:-9097}"

WEB_PORT="${WEB_PORT:-$(read_env "$API_DIR/.env" WEB_PORT 2>/dev/null || true)}"
WEB_PORT="${WEB_PORT:-3000}"
LE_CERT="/etc/letsencrypt/live/${ROOT_DOMAIN}/fullchain.pem"
CADDY_CERT_DIR="/etc/caddy/certs"

if ! command -v caddy >/dev/null; then
  apt-get update
  apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    | tee /etc/apt/sources.list.d/caddy-stable.list
  apt-get update && apt-get install -y caddy
fi

if [ ! -f "$LE_CERT" ]; then
  echo "Wildcard cert missing at $LE_CERT"
  echo "Issue once: certbot certonly --manual --preferred-challenges dns -d ${ROOT_DOMAIN} -d *.${ROOT_DOMAIN}"
  exit 1
fi

install_caddy_certs() {
  mkdir -p "$CADDY_CERT_DIR"
  cp -L "/etc/letsencrypt/live/${ROOT_DOMAIN}/fullchain.pem" "$CADDY_CERT_DIR/fullchain.pem"
  cp -L "/etc/letsencrypt/live/${ROOT_DOMAIN}/privkey.pem" "$CADDY_CERT_DIR/privkey.pem"
  chown caddy:caddy "$CADDY_CERT_DIR"/*.pem
  chmod 644 "$CADDY_CERT_DIR/fullchain.pem"
  chmod 600 "$CADDY_CERT_DIR/privkey.pem"
}

install_caddy_certs

HOOK_DIR="/etc/letsencrypt/renewal-hooks/deploy"
mkdir -p "$HOOK_DIR"
cat > "$HOOK_DIR/copy-for-caddy.sh" <<'HOOK'
#!/bin/bash
set -e
CADDY_CERT_DIR="/etc/caddy/certs"
ROOT_DOMAIN="ROOT_DOMAIN_PLACEHOLDER"
mkdir -p "$CADDY_CERT_DIR"
cp -L "/etc/letsencrypt/live/${ROOT_DOMAIN}/fullchain.pem" "$CADDY_CERT_DIR/fullchain.pem"
cp -L "/etc/letsencrypt/live/${ROOT_DOMAIN}/privkey.pem" "$CADDY_CERT_DIR/privkey.pem"
chown caddy:caddy "$CADDY_CERT_DIR"/*.pem
chmod 644 "$CADDY_CERT_DIR/fullchain.pem"
chmod 600 "$CADDY_CERT_DIR/privkey.pem"
systemctl reload caddy
HOOK
sed -i "s/ROOT_DOMAIN_PLACEHOLDER/${ROOT_DOMAIN}/g" "$HOOK_DIR/copy-for-caddy.sh"
chmod +x "$HOOK_DIR/copy-for-caddy.sh"

systemctl stop nginx 2>/dev/null || true
systemctl disable nginx 2>/dev/null || true

if command -v ufw >/dev/null && ufw status 2>/dev/null | grep -q 'Status: active'; then
  ufw allow 80/tcp
  ufw allow 443/tcp
fi

if ! curl -sf --max-time 2 "http://127.0.0.1:${API_PORT}/api/health" >/dev/null; then
  echo "WARNING: API is not responding on :${API_PORT}. Start it first (api)."
fi

sed -e "s/__ROOT_DOMAIN__/${ROOT_DOMAIN}/g" -e "s/__API_PORT__/${API_PORT}/g" -e "s/__WEB_PORT__/${WEB_PORT}/g" "$DIR/caddy/Caddyfile" > /etc/caddy/Caddyfile
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

echo "OK: https://${ROOT_DOMAIN} (web->:${WEB_PORT}, api->:${API_PORT})"
