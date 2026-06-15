# Multi-Tenant App — Production Deployment Guide

Complete guide for deploying this app on a Linux server (Ubuntu/Debian) with domain `multi.takitahmid.com`.

**Recommended reverse proxy:** [Caddy](#part-b-caddy-recommended) (auto SSL for subdomains + user custom domains).

**Legacy option:** [Nginx](#part-a-nginx-legacy) (manual SSL, limited custom domain support).

---

## Table of contents

1. [Architecture](#architecture)
2. [DNS (Cloudflare)](#dns-cloudflare)
3. [Environment variables](#environment-variables)
4. [App deployment](#app-deployment)
5. [Part A: Nginx (legacy)](#part-a-nginx-legacy)
6. [Part B: Caddy (recommended)](#part-b-caddy-recommended)
7. [Custom domains](#custom-domains)
8. [Troubleshooting](#troubleshooting)
9. [Nginx vs Caddy comparison](#nginx-vs-caddy-comparison)

---

## Architecture

```
Browser
   │
   ▼
Reverse proxy (Nginx or Caddy) — ports 80 / 443
   │
   ▼
Node.js app (Fastify) — 127.0.0.1:3000
   │
   ▼
PostgreSQL
```

### URL structure

| URL | Purpose |
|-----|---------|
| `https://multi.takitahmid.com` | Home, login, register |
| `https://{username}.multi.takitahmid.com` | User public profile |
| `https://{username}.multi.takitahmid.com/edit` | Edit profile (auth required) |
| `https://user-custom-domain.com` | Public profile via custom domain |

### How the app detects tenants

- **Subdomain:** `yasin7a.multi.takitahmid.com` → tenant subdomain `yasin7a`
- **Custom domain:** `mysite.com` → lookup `Tenant.customDomain` in database
- **Main domain:** `multi.takitahmid.com` → platform pages (no tenant)

---

## DNS (Cloudflare)

Zone: `takitahmid.com` (add site on Cloudflare, point nameservers from registrar).

| Type | Name | Content | Proxy |
|------|------|---------|-------|
| A | `multi` | `YOUR_SERVER_IP` | DNS only (grey cloud) |
| A | `*.multi` | `YOUR_SERVER_IP` | DNS only (grey cloud) |

**Important:** Use **DNS only (grey cloud)** during setup. Orange cloud (proxied) can cause SSL handshake issues with on-demand certificates.

### Verify DNS

```bash
dig +short multi.takitahmid.com
dig +short yasin7a.multi.takitahmid.com
```

Both should return your server IP (e.g. `56.10.33.169`).

---

## Environment variables

File: `/var/www/multi_tenant/.env`

```env
DATABASE_URL="postgresql://USER:PASS@localhost:5432/multitenant?schema=public"
ROOT_DOMAIN=multi.takitahmid.com
PUBLIC_URL=https://multi.takitahmid.com
SERVER_IP=56.10.33.169
ACME_EMAIL=your-email@gmail.com
PORT=3000
```

| Variable | Description |
|----------|-------------|
| `ROOT_DOMAIN` | Platform root domain (no `https://`) |
| `PUBLIC_URL` | Full public URL for redirects and links |
| `SERVER_IP` | Shown in edit profile DNS instructions |
| `ACME_EMAIL` | Let's Encrypt contact (used by Caddy) |
| `PORT` | App port (default `3000`, not exposed publicly) |

After changing `.env`:

```bash
pm2 restart multi-tenant
```

---

## App deployment

### 1. Clone and install

```bash
cd /var/www
git clone https://github.com/YOUR_USER/multi_tenant.git multi_tenant
cd multi_tenant
npm install
```

### 2. Database

```bash
npx prisma migrate deploy
npx prisma generate
```

### 3. Run with PM2

```bash
pm2 start server.js --name multi-tenant
pm2 save
pm2 startup
```

### 4. Verify app

```bash
curl -I http://127.0.0.1:3000
pm2 logs multi-tenant --lines 20
```

### 5. AWS / firewall

Open inbound ports:

- **80** (HTTP — ACME challenges)
- **443** (HTTPS)
- **22** (SSH)

Do **not** expose port **3000** publicly.

---

## Part A: Nginx (legacy)

Use this only if you prefer Nginx or already have a wildcard certificate. **Not recommended** for user custom domains (each domain needs manual `certbot`).

### A.1 — Install Nginx

```bash
sudo apt update
sudo apt install -y nginx
```

### A.2 — Wildcard SSL with Certbot (DNS challenge)

Wildcard `*.multi.takitahmid.com` **cannot** use HTTP challenge. Use DNS challenge:

```bash
sudo apt install -y certbot
sudo certbot certonly --manual --preferred-challenges dns \
  -d multi.takitahmid.com \
  -d *.multi.takitahmid.com
```

Add the TXT records Certbot shows in Cloudflare (`_acme-challenge.multi`), wait 5–10 minutes, then press Enter.

Certificate path:

```
/etc/letsencrypt/live/multi.takitahmid.com/fullchain.pem
/etc/letsencrypt/live/multi.takitahmid.com/privkey.pem
```

**Renewal:** Manual DNS certs do not auto-renew unless you configure a DNS plugin or auth hook. Repeat before expiry (~90 days).

### A.3 — Nginx config

Copy example config:

```bash
sudo cp /var/www/multi_tenant/docs/nginx.example.conf \
  /etc/nginx/sites-available/multi-tenant

sudo ln -sf /etc/nginx/sites-available/multi-tenant \
  /etc/nginx/sites-enabled/

sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

Reference config: [`docs/nginx.example.conf`](./nginx.example.conf)

### A.4 — Original simple config (IP only, HTTP)

Early development config (no SSL):

```nginx
server {
    listen 80;
    server_name 56.10.33.169;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### A.5 — Nginx limitations

| Feature | Nginx |
|---------|-------|
| Platform `multi.takitahmid.com` | Yes (with wildcard cert) |
| User subdomains | Yes (with `*.multi` cert) |
| User custom domain HTTPS | **Manual** `certbot --nginx -d eachdomain.com` per user |
| Auto SSL for new custom domains | No |

### A.6 — Custom domain HTTPS on Nginx (per user)

After user points DNS A record to your server and saves domain in app:

```bash
sudo certbot --nginx -d mysite.com
sudo nginx -t && sudo systemctl reload nginx
```

Repeat for every new custom domain.

---

## Part B: Caddy (recommended)

Caddy replaces Nginx and provides:

- Automatic HTTPS for `multi.takitahmid.com`
- On-demand HTTPS for `username.multi.takitahmid.com` (first visit issues cert)
- On-demand HTTPS for user custom domains (no manual certbot)

### B.1 — How it works

```
HTTPS request → Caddy
    → asks app: GET /internal/caddy-ask?domain=hostname
    → 200 OK? → Let's Encrypt cert issued automatically
    → reverse_proxy → 127.0.0.1:3000
```

The app only approves:

- `multi.takitahmid.com`
- `{subdomain}.multi.takitahmid.com` if tenant exists in DB
- Custom domain if saved in `Tenant.customDomain`

### B.2 — Caddyfile

Location: [`caddy/Caddyfile`](../caddy/Caddyfile)

```caddyfile
{
	email ACME_EMAIL_PLACEHOLDER

	on_demand_tls {
		ask http://127.0.0.1:3000/internal/caddy-ask
	}
}

https:// {
	tls {
		on_demand
	}

	request_body {
		max_size 6MB
	}

	reverse_proxy 127.0.0.1:3000 {
		header_up Host {host}
		header_up X-Real-IP {remote_host}
	}
}
```

**Do not add** `interval` or `burst` inside `on_demand_tls` — removed in newer Caddy versions.

**Do not use** `*.multi.takitahmid.com` in a static block — wildcard certs need DNS challenge and Caddy will fail to start.

### B.3 — One-command install

```bash
cd /var/www/multi_tenant
git pull

# App must be running first
pm2 status

sudo ACME_EMAIL=your@gmail.com bash scripts/setup-caddy.sh
```

The script:

1. Installs Caddy (if missing)
2. Copies Caddyfile to `/etc/caddy/Caddyfile`
3. Runs `caddy validate`
4. Stops and disables Nginx
5. Starts Caddy

### B.4 — Manual install

```bash
# Install Caddy
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy

# Deploy config
sudo sed "s/ACME_EMAIL_PLACEHOLDER/your@gmail.com/" \
  /var/www/multi_tenant/caddy/Caddyfile > /etc/caddy/Caddyfile

sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl stop nginx
sudo systemctl disable nginx
sudo systemctl enable caddy
sudo systemctl restart caddy
```

### B.5 — Verify Caddy

```bash
sudo systemctl status caddy
curl -I https://multi.takitahmid.com
curl -I https://yasin7a.multi.takitahmid.com
```

First subdomain/custom domain visit may take 10–30 seconds while cert is issued.

### B.6 — Test SSL approval endpoint

```bash
# Main domain — should return 200
curl -i "http://127.0.0.1:3000/internal/caddy-ask?domain=multi.takitahmid.com"

# Existing user subdomain — should return 200
curl -i "http://127.0.0.1:3000/internal/caddy-ask?domain=yasin7a.multi.takitahmid.com"

# Unknown domain — should return 403
curl -i "http://127.0.0.1:3000/internal/caddy-ask?domain=fake.multi.takitahmid.com"

# Debug helper (after deploy)
curl "http://127.0.0.1:3000/internal/caddy-check?domain=yasin7a.multi.takitahmid.com"
```

If subdomain returns **403**:

1. Check `ROOT_DOMAIN=multi.takitahmid.com` in `.env`
2. `pm2 restart multi-tenant`
3. Confirm user exists: subdomain `yasin7a` in database

### B.7 — Caddy logs

```bash
journalctl -u caddy -f
journalctl -xeu caddy.service --no-pager | tail -50
```

### B.8 — Switch back from Caddy to Nginx

```bash
sudo systemctl stop caddy
sudo systemctl disable caddy
sudo systemctl enable nginx
sudo systemctl start nginx
```

---

## Custom domains

### User steps

1. At domain provider, add **A record**:
   - Name: `@`
   - Value: `SERVER_IP` (from `.env`)
2. Login → go to `https://{username}.multi.takitahmid.com/edit`
3. Enter custom domain (e.g. `mysite.com`) → Save
4. Wait for DNS propagation (5–30 min)
5. Visit `https://mysite.com`

### With Caddy

SSL is automatic on first HTTPS visit (no certbot).

### With Nginx

Run manually per domain:

```bash
sudo certbot --nginx -d mysite.com
```

### Auth note

Login cookies are set for `.multi.takitahmid.com`. Custom domains show **public profile only**. Edit profile and login use the platform subdomain URL.

---

## Troubleshooting

### `ERR_SSL_PROTOCOL_ERROR` on subdomain

| Check | Command |
|-------|---------|
| ROOT_DOMAIN correct | `grep ROOT_DOMAIN .env` |
| caddy-ask returns 200 | `curl -i "http://127.0.0.1:3000/internal/caddy-ask?domain=user.multi.takitahmid.com"` |
| Caddy running | `systemctl status caddy` |
| DNS points to server | `dig +short user.multi.takitahmid.com` |
| Port 443 open | AWS Security Group |
| Cloudflare proxy off | Grey cloud on DNS records |

Fix `.env` → `pm2 restart multi-tenant` → `sudo systemctl restart caddy` → retry HTTPS.

### Caddy fails to start

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
```

Common causes:

- `interval` / `burst` in `on_demand_tls` (remove them)
- `*.domain` in static block (use on-demand instead)
- Port 80/443 in use: `sudo ss -tlnp | grep ':80\|:443'`

### `caddy/Caddyfile not found` on server

```bash
cd /var/www/multi_tenant && git pull
ls caddy/Caddyfile
```

### App 502 / connection refused

```bash
pm2 status
pm2 restart multi-tenant
curl http://127.0.0.1:3000
```

### Prisma / DB errors

```bash
npx prisma migrate deploy
pm2 restart multi-tenant
```

---

## Nginx vs Caddy comparison

| | Nginx + Certbot | Caddy |
|--|-----------------|-------|
| Setup complexity | Higher | Lower |
| Platform SSL | Manual wildcard DNS challenge | Automatic |
| Subdomain SSL | Wildcard cert (one-time DNS TXT) | On-demand per subdomain |
| Custom domain SSL | Manual per domain | **Automatic** on-demand |
| User runs certbot | No (you do) | **Never** |
| Config file | `docs/nginx.example.conf` | `caddy/Caddyfile` |
| Install script | — | `scripts/setup-caddy.sh` |
| Recommended | Legacy | **Yes** |

---

## Quick reference

```bash
# Deploy / update app
cd /var/www/multi_tenant
git pull
npm install
npx prisma migrate deploy
pm2 restart multi-tenant

# Caddy (recommended)
sudo ACME_EMAIL=you@gmail.com bash scripts/setup-caddy.sh

# Health checks
curl -I https://multi.takitahmid.com
curl -i "http://127.0.0.1:3000/internal/caddy-ask?domain=multi.takitahmid.com"
pm2 status
systemctl status caddy
```

---

## Local development

```env
ROOT_DOMAIN=lvh.me
PUBLIC_URL=
PORT=3000
```

Use `http://lvh.me:3000` and `http://{user}.lvh.me:3000` (hosts file or `lvh.me` resolves to 127.0.0.1).

```bash
npm run dev
```

Caddy is not required locally.
