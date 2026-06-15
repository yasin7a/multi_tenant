# Multi-Tenant App

## Production

```bash
cd /var/www/multi_tenant
git pull && npm install && npx prisma migrate deploy
pm2 restart multi-tenant
```

**Caddy** (app must be running on :3000 first):

```bash
pm2 restart multi-tenant
sudo bash scripts/setup-caddy.sh
```

Caddy reverse-proxies HTTPS to the app. Custom domains get automatic Let's Encrypt certificates after the user points DNS to your server and saves the domain in their profile.

If Caddy fails: `journalctl -u caddy -n 20`

`.env`: `ROOT_DOMAIN=multi.takitahmid.com`, `PUBLIC_URL=https://multi.takitahmid.com`, `SERVER_IP=<your server IP>`

## Local

```bash
npm run dev
```
