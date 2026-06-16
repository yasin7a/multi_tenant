#!/bin/bash
set -e

DIR="$(cd "$(dirname "$0")/.." && pwd)"
ROOT_DOMAIN="${ROOT_DOMAIN:-$(grep -E '^ROOT_DOMAIN=' "$DIR/.env" 2>/dev/null | cut -d= -f2- | tr -d '"' | tr -d "'")}"
ROOT_DOMAIN="${ROOT_DOMAIN:-multi.takitahmid.com}"
APP_PORT="${APP_PORT:-$(grep -E '^PORT=' "$DIR/.env" 2>/dev/null | cut -d= -f2- | tr -d '"' | tr -d "'")}"
APP_PORT="${APP_PORT:-9097}"
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

if ! curl -sf --max-time 2 "http://127.0.0.1:${APP_PORT}/" >/dev/null; then
  echo "WARNING: App is not responding on :${APP_PORT}. Start it first: pm2 restart multi-tenant"
fi

sed -e "s/__ROOT_DOMAIN__/${ROOT_DOMAIN}/g" -e "s/__APP_PORT__/${APP_PORT}/g" "$DIR/caddy/Caddyfile" > /etc/caddy/Caddyfile
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

echo "OK: https://${ROOT_DOMAIN} (ports 80 and 443 open, proxying to :${APP_PORT})"
