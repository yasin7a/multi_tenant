#!/bin/bash
set -e

DIR="$(cd "$(dirname "$0")/.." && pwd)"
API_DIR="$DIR/api"

ROOT_DOMAIN="${ROOT_DOMAIN:-$(grep -E '^ROOT_DOMAIN=' "$API_DIR/.env" 2>/dev/null | cut -d= -f2- | tr -d '\"' | tr -d \"'\")}"
ROOT_DOMAIN="${ROOT_DOMAIN:-$(grep -E '^ROOT_DOMAIN=' "$DIR/.env" 2>/dev/null | cut -d= -f2- | tr -d '\"' | tr -d \"'\")}"
ROOT_DOMAIN="${ROOT_DOMAIN:-multi.takitahmid.com}"

API_PORT="${API_PORT:-$(grep -E '^API_PORT=' "$API_DIR/.env" 2>/dev/null | cut -d= -f2- | tr -d '\"' | tr -d \"'\")}"
API_PORT="${API_PORT:-$(grep -E '^PORT=' "$API_DIR/.env" 2>/dev/null | cut -d= -f2- | tr -d '\"' | tr -d \"'\")}"
API_PORT="${API_PORT:-$(grep -E '^PORT=' "$DIR/.env" 2>/dev/null | cut -d= -f2- | tr -d '\"' | tr -d \"'\")}"
API_PORT="${API_PORT:-9097}"

WEB_PORT="${WEB_PORT:-$(grep -E '^WEB_PORT=' "$API_DIR/.env" 2>/dev/null | cut -d= -f2- | tr -d '\"' | tr -d \"'\")}"
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
  echo "WARNING: API is not responding on :${API_PORT}. Start it first (apps/api)."
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
