# Multi-Tenant App

## Production

```bash
cd /var/www/multi_tenant
git pull && npm install && npx prisma migrate deploy
pm2 restart multi-tenant
```

**Caddy** (app on :3000; wildcard cert should already be on the server):

```bash
pm2 restart multi-tenant
sudo bash scripts/setup-caddy.sh
```

- Platform (`multi.takitahmid.com`, `*.multi.takitahmid.com`) → wildcard cert, instant HTTPS
- User custom domains → on-demand TLS after DNS + profile save

Renew wildcard: `sudo certbot renew && sudo systemctl reload caddy`

If Caddy fails: `journalctl -u caddy -n 20`

`.env`: `ROOT_DOMAIN=multi.takitahmid.com`, `PUBLIC_URL=https://multi.takitahmid.com`, `SERVER_IP=<your server IP>`

## Local

```bash
npm run dev
```
