# Deployment

## DNS (Cloudflare)

| Type | Name | Content |
|------|------|---------|
| A | `multi` | server IP |
| A | `*.multi` | server IP |

Grey cloud (DNS only).

## .env

```
ROOT_DOMAIN=multi.takitahmid.com
PUBLIC_URL=https://multi.takitahmid.com
SERVER_IP=<server public IP>
DATABASE_URL=postgresql://...
PORT=3000
```

## App

```bash
cd /var/www/multi_tenant
npm install
npx prisma migrate deploy
pm2 start server.js --name multi-tenant
pm2 save
```

## SSL

Wildcard cert for `multi.takitahmid.com` + `*.multi.takitahmid.com` should already exist at `/etc/letsencrypt/live/multi.takitahmid.com/`.

New server only — issue once with DNS TXT when certbot asks:

```bash
certbot certonly --manual --preferred-challenges dns \
  -d multi.takitahmid.com -d '*.multi.takitahmid.com'
```

## Caddy

```bash
sudo bash scripts/setup-caddy.sh
```

| Host | SSL |
|------|-----|
| `multi.takitahmid.com`, `*.multi.takitahmid.com` | Wildcard cert (instant, including unknown subdomains) |
| User custom domain | On-demand TLS via `/internal/caddy-ask` (must be saved in profile + A record to `SERVER_IP`) |

## Update

```bash
git pull && npm install && npx prisma migrate deploy
pm2 restart multi-tenant
```

## Troubleshooting

**ERR_CONNECTION_REFUSED** — nothing is listening on ports 80/443 on the server:

```bash
pm2 status
pm2 restart multi-tenant
sudo bash scripts/setup-caddy.sh
sudo systemctl status caddy
sudo ss -tlnp | grep -E ':80|:443'
```

If Caddy failed: `sudo journalctl -u caddy -n 40 --no-pager`

- Site down: `pm2 status` and `systemctl status caddy`
- Wildcard cert missing: re-run certbot command in SSL section above, then `sudo bash scripts/setup-caddy.sh`
- Renew wildcard: `sudo certbot renew` (hook reloads Caddy automatically)
- Custom domain SSL: DNS A record → `SERVER_IP`, domain saved in profile, then `journalctl -u caddy -n 30`
