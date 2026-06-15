# Multi-Tenant App

Subdomain-based multi-tenant platform with user profiles, image upload, and optional custom domains.

## Production deployment

See **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** for the full guide:

- DNS (Cloudflare)
- Environment variables
- PM2 app setup
- **Nginx (legacy)** — manual SSL, wildcard certbot
- **Caddy (recommended)** — auto SSL for subdomains + custom domains

## Quick start (local)

```bash
npm install
cp .env.example .env   # or create .env
npx prisma migrate deploy
npm run dev
```

Visit `http://lvh.me:3000` (set `ROOT_DOMAIN=lvh.me` in `.env`).

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Local development |
| `npm start` | Production app |
| `npm run setup:caddy` | Install/configure Caddy on server |
