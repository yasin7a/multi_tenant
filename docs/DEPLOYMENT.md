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

## Caddy (HTTPS + custom domains)

```bash
sudo bash scripts/setup-caddy.sh
```

Caddy terminates HTTPS and proxies to the app on port 3000. When a user adds a custom domain, they create an A record to `SERVER_IP` and save the domain in profile edit. Caddy asks the app (`/internal/caddy-ask`) whether to issue a certificate; only registered custom domains and platform hosts are approved.

## Update

```bash
git pull && npm install && npx prisma migrate deploy
pm2 restart multi-tenant
```

## Troubleshooting

- Site down: `pm2 status` and `systemctl status caddy`
- Custom domain SSL: confirm DNS A record points to `SERVER_IP`, domain is saved in profile, then `journalctl -u caddy -n 30`
