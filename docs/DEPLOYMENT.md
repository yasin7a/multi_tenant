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

## SSL (once)

```bash
sudo apt install -y certbot
sudo certbot certonly --manual --preferred-challenges dns \
  -d multi.takitahmid.com -d '*.multi.takitahmid.com'
```

## Caddy

```bash
sudo bash scripts/setup-caddy.sh
```

## Update

```bash
git pull && npm install && npx prisma migrate deploy
pm2 restart multi-tenant
```

## Troubleshooting

- Site down: `pm2 status` and `systemctl status caddy`
- Cert missing: re-run certbot command above
- Renew: `sudo certbot renew && sudo systemctl reload caddy`
