# Multi-Tenant App

## Production

```bash
cd /var/www/multi_tenant
git pull && npm install && npx prisma migrate deploy
pm2 restart multi-tenant
```

**First time SSL** (add DNS TXT when certbot asks):

```bash
sudo apt install -y certbot
sudo certbot certonly --manual --preferred-challenges dns \
  -d multi.takitahmid.com -d '*.multi.takitahmid.com'
```

**Caddy** (app must be running on :3000 first):

```bash
pm2 restart multi-tenant
sudo bash scripts/setup-caddy.sh
```

If still down: `journalctl -u caddy -n 20`

Renew: `sudo certbot renew && sudo systemctl reload caddy`

`.env`: `ROOT_DOMAIN=multi.takitahmid.com`, `PUBLIC_URL=https://multi.takitahmid.com`

## Local

```bash
npm run dev
```
