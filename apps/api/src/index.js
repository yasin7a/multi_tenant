import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs/promises";
import dns from "node:dns/promises";
import { randomBytes } from "node:crypto";

import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import multer from "multer";
import bcrypt from "bcryptjs";

import { prisma } from "./lib/prisma.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API_PORT = Number(process.env.API_PORT || process.env.PORT) || 9097;
const ROOT_DOMAIN = process.env.ROOT_DOMAIN || "lvh.me";
const PUBLIC_URL = process.env.PUBLIC_URL?.replace(/\/$/, "");
const SERVER_IP = process.env.SERVER_IP || "";

const UPLOADS_DIR = path.join(__dirname, "..", "public", "uploads");
const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);

const authHandoffs = new Map();

function isPlatformHost(host) {
  return (
    host === "localhost" ||
    host === ROOT_DOMAIN ||
    host.endsWith(`.${ROOT_DOMAIN}`)
  );
}

function getPublicProtocol() {
  if (PUBLIC_URL?.startsWith("https")) return "https";
  if (PUBLIC_URL?.startsWith("http")) return "http";
  return "http";
}

function getSiteUrl(subdomain) {
  if (PUBLIC_URL) return `${getPublicProtocol()}://${subdomain}.${ROOT_DOMAIN}`;
  return `http://${subdomain}.${ROOT_DOMAIN}:${process.env.WEB_PORT || 3000}`;
}

function getTenantBaseUrl(tenant) {
  if (tenant.customDomain)
    return `${getPublicProtocol()}://${tenant.customDomain}`;
  return getSiteUrl(tenant.subdomain);
}

function normalizeCustomDomain(value) {
  if (!value) return null;
  let domain = String(value).trim().toLowerCase();
  domain = domain.replace(/^https?:\/\//, "");
  domain = domain.split("/")[0].split(":")[0].replace(/\.$/, "");
  return domain || null;
}

function isValidCustomDomain(domain) {
  if (!domain || domain.length > 253) return false;
  if (domain === ROOT_DOMAIN || domain.endsWith(`.${ROOT_DOMAIN}`))
    return false;
  if (domain === "localhost" || domain.endsWith(".localhost")) return false;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(domain)) return false;
  return /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/.test(domain);
}

async function verifyCustomDomainDns(domain) {
  if (!domain || !SERVER_IP) return { verified: false, addresses: [] };
  try {
    const addresses = await dns.resolve4(domain);
    return { verified: addresses.includes(SERVER_IP), addresses };
  } catch {
    return { verified: false, addresses: [] };
  }
}

async function resolveHost(hostname) {
  const host = hostname;
  if (host === "localhost" || host === ROOT_DOMAIN) return { type: "main" };

  if (host.endsWith(".localhost")) {
    return {
      type: "tenant",
      subdomain: host.slice(0, -".localhost".length),
      isCustomDomain: false,
    };
  }

  if (host.endsWith(`.${ROOT_DOMAIN}`)) {
    return {
      type: "tenant",
      subdomain: host.slice(0, -(ROOT_DOMAIN.length + 1)),
      isCustomDomain: false,
    };
  }

  const tenant = await prisma.tenant.findFirst({
    where: { customDomain: host },
    select: { subdomain: true },
  });

  if (tenant)
    return {
      type: "tenant",
      subdomain: tenant.subdomain,
      isCustomDomain: true,
    };
  return { type: "unknown", host };
}

function authCookieOptions(req) {
  const secure = (req.headers["x-forwarded-proto"] || req.protocol) === "https";
  const options = {
    path: "/",
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 7 * 1000,
    secure,
    sameSite: "lax",
  };

  const hostname = req.hostname;
  if (isPlatformHost(hostname)) {
    if (hostname !== "localhost" && !hostname.endsWith(".localhost")) {
      options.domain = `.${ROOT_DOMAIN}`;
    }
  }

  return options;
}

function setAuthCookie(res, req, userId) {
  res.cookie("userId", userId, authCookieOptions(req));
}

function clearAuthCookie(res, req) {
  const opts = { ...authCookieOptions(req), maxAge: 0 };
  res.clearCookie("userId", opts);
}

function createAuthHandoff(userId) {
  const token = randomBytes(24).toString("hex");
  authHandoffs.set(token, { userId, expires: Date.now() + 2 * 60 * 1000 });
  return token;
}

function consumeAuthHandoff(token) {
  const entry = authHandoffs.get(token);
  if (!entry || entry.expires < Date.now()) {
    authHandoffs.delete(token);
    return null;
  }
  authHandoffs.delete(token);
  return entry.userId;
}

async function getAuthUser(userId) {
  if (!userId) return null;
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      email: true,
      imageUrl: true,
      createdAt: true,
      tenantId: true,
      tenant: {
        select: {
          id: true,
          subdomain: true,
          customDomain: true,
          createdAt: true,
        },
      },
    },
  });
}

async function ensureUploadsDir() {
  await fs.mkdir(UPLOADS_DIR, { recursive: true });
}

function createCors() {
  // Allow Next.js dev server(s) on same root domain, plus any explicit PUBLIC_URL origin.
  const allowedOrigins = new Set();
  if (PUBLIC_URL) {
    try {
      allowedOrigins.add(new URL(PUBLIC_URL).origin);
    } catch {
      // ignore
    }
  }
  allowedOrigins.add(`http://${ROOT_DOMAIN}:${process.env.WEB_PORT || 3000}`);

  return cors({
    credentials: true,
    origin(origin, cb) {
      if (!origin) return cb(null, true);
      if (allowedOrigins.has(origin)) return cb(null, true);
      try {
        const url = new URL(origin);
        const isDevSubdomain =
          url.hostname === ROOT_DOMAIN ||
          url.hostname.endsWith(`.${ROOT_DOMAIN}`);
        const isDevPort =
          String(url.port || "") === String(process.env.WEB_PORT || 3000);
        if (
          isDevSubdomain &&
          isDevPort &&
          (url.protocol === "http:" || url.protocol === "https:")
        ) {
          return cb(null, true);
        }
      } catch {
        // ignore
      }
      return cb(null, false);
    },
  });
}

const storage = multer.diskStorage({
  async destination(_req, _file, cb) {
    try {
      await ensureUploadsDir();
      cb(null, UPLOADS_DIR);
    } catch (err) {
      cb(err, UPLOADS_DIR);
    }
  },
  filename(_req, file, cb) {
    const ext =
      file.mimetype === "image/jpeg"
        ? ".jpg"
        : file.mimetype === "image/png"
          ? ".png"
          : file.mimetype === "image/gif"
            ? ".gif"
            : file.mimetype === "image/webp"
              ? ".webp"
              : "";
    cb(null, `${randomBytes(16).toString("hex")}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    if (!ALLOWED_IMAGE_TYPES.has(file.mimetype)) return cb(null, false);
    return cb(null, true);
  },
});

const app = express();
app.set("trust proxy", true);

app.use(createCors());
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  "/uploads",
  express.static(path.join(__dirname, "..", "public", "uploads")),
);

app.get("/api/health", (_req, res) => res.json({ ok: true }));

// Caddy on_demand_tls calls this before issuing a certificate (custom domains only).
app.get("/internal/caddy-ask", async (req, res) => {
  const domain = normalizeCustomDomain(req.query.domain);
  if (!domain || !isValidCustomDomain(domain)) return res.status(403).send();
  if (domain === ROOT_DOMAIN || domain.endsWith(`.${ROOT_DOMAIN}`))
    return res.status(403).send();

  const tenant = await prisma.tenant.findFirst({
    where: { customDomain: domain },
    select: { id: true },
  });

  return tenant ? res.status(200).send("ok") : res.status(403).send();
});

app.get("/auth/continue", async (req, res) => {
  const userId = consumeAuthHandoff(req.query.token);
  const nextPath =
    typeof req.query.next === "string" && req.query.next.startsWith("/")
      ? req.query.next
      : "/edit";

  if (!userId) return res.redirect("/login");
  setAuthCookie(res, req, userId);
  return res.redirect(nextPath);
});

app.get("/api/site", async (req, res) => {
  const ctx = await resolveHost(req.hostname);
  return res.json(ctx);
});

app.get("/api/profile/public", async (req, res) => {
  const hostCtx = await resolveHost(req.hostname);
  if (hostCtx.type !== "tenant")
    return res.status(404).json({ error: "profile not found" });

  const user = await prisma.user.findFirst({
    where: { tenant: { subdomain: hostCtx.subdomain } },
    select: {
      username: true,
      email: true,
      imageUrl: true,
      createdAt: true,
      tenantId: true,
      tenant: {
        select: {
          id: true,
          subdomain: true,
          customDomain: true,
          createdAt: true,
        },
      },
    },
  });

  if (!user) return res.status(404).json({ error: "profile not found" });
  return res.json(user);
});

app.get("/api/profile/me", async (req, res) => {
  const authUser = await getAuthUser(req.cookies.userId);
  if (!authUser) return res.status(401).json({ error: "not authenticated" });
  return res.json(authUser);
});

app.get("/api/custom-domain/verify", async (req, res) => {
  const authUser = await getAuthUser(req.cookies.userId);
  if (!authUser) return res.status(401).json({ error: "not authenticated" });

  const domain =
    normalizeCustomDomain(req.query.domain) || authUser.tenant.customDomain;
  if (!domain)
    return res.json({ domain: null, verified: false, status: "none" });
  if (!isValidCustomDomain(domain))
    return res.status(400).json({ error: "invalid domain" });

  const dnsCheck = await verifyCustomDomainDns(domain);
  return res.json({
    domain,
    verified: dnsCheck.verified,
    expectedIp: SERVER_IP || null,
    addresses: dnsCheck.addresses,
    status: dnsCheck.verified ? "valid" : "pending",
  });
});

app.post("/api/auth/register", async (req, res) => {
  const { username, email, password } = req.body || {};
  if (!username || !email || !password)
    return res
      .status(400)
      .json({ error: "username, email, and password are required" });

  const existing = await prisma.user.findFirst({
    where: { OR: [{ username }, { email }] },
  });
  if (existing)
    return res.status(409).json({ error: "username or email already exists" });

  const subdomain = String(username).toLowerCase();
  const existingTenant = await prisma.tenant.findUnique({
    where: { subdomain },
    select: { id: true },
  });
  if (existingTenant)
    return res.status(409).json({ error: "subdomain already taken" });

  const hashedPassword = await bcrypt.hash(password, 10);

  const user = await prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.create({ data: { subdomain } });
    return tx.user.create({
      data: { username, email, password: hashedPassword, tenantId: tenant.id },
      select: { id: true },
    });
  });

  setAuthCookie(res, req, user.id);
  return res.status(201).json({ isLoggedIn: true, userId: user.id, subdomain });
});

function isWrongTenantLogin(req, hostCtx, user) {
  if (hostCtx.type !== "tenant") return false;
  if (hostCtx.isCustomDomain) return user.tenant.customDomain !== req.hostname;
  return user.tenant.subdomain !== hostCtx.subdomain;
}

app.post("/api/auth/login", async (req, res) => {
  const hostCtx = await resolveHost(req.hostname);
  const { email, password } = req.body || {};
  if (!email || !password)
    return res.status(400).json({ error: "email and password are required" });

  const user = await prisma.user.findUnique({
    where: { email },
    include: { tenant: { select: { subdomain: true, customDomain: true } } },
  });
  if (!user) return res.status(401).json({ error: "invalid credentials" });

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return res.status(401).json({ error: "invalid credentials" });

  if (isWrongTenantLogin(req, hostCtx, user)) {
    return res.status(403).json({
      error: "wrong tenant",
      message: "This site belongs to someone else.",
      redirectUrl: `${getTenantBaseUrl(user.tenant)}/login`,
    });
  }

  setAuthCookie(res, req, user.id);

  if (user.tenant.customDomain && req.hostname !== user.tenant.customDomain) {
    const token = createAuthHandoff(user.id);
    return res.json({
      isLoggedIn: true,
      userId: user.id,
      redirectUrl: `${getTenantBaseUrl(user.tenant)}/auth/continue?token=${token}&next=${encodeURIComponent("/edit")}`,
    });
  }

  return res.json({ isLoggedIn: true, userId: user.id });
});

app.post("/api/auth/logout", async (req, res) => {
  clearAuthCookie(res, req);
  return res.json({ ok: true });
});

async function deleteProfileImage(imageUrl) {
  if (!imageUrl?.startsWith("/uploads/")) return;
  const filename = path.basename(imageUrl);
  if (!filename || filename.includes("..")) return;
  const filepath = path.resolve(UPLOADS_DIR, filename);
  if (!filepath.startsWith(path.resolve(UPLOADS_DIR))) return;
  try {
    await fs.unlink(filepath);
  } catch {
    // ignore
  }
}

app.post("/api/profile", upload.single("image"), async (req, res) => {
  const hostCtx = await resolveHost(req.hostname);
  const authUser = await getAuthUser(req.cookies.userId);
  if (!authUser) return res.status(401).json({ error: "not authenticated" });

  // Enforce tenant host (same semantics as old server)
  if (hostCtx.type === "tenant") {
    if (hostCtx.isCustomDomain) {
      if (authUser.tenant.customDomain !== req.hostname)
        return res.status(403).json({ error: "wrong tenant host" });
    } else if (authUser.tenant.subdomain !== hostCtx.subdomain) {
      return res.status(403).json({ error: "wrong tenant host" });
    }
  } else {
    // main host editing is allowed only if you are redirected to tenant; keep strict here
    return res
      .status(400)
      .json({ error: "open edit on your tenant subdomain/custom domain" });
  }

  const username = req.body?.username;
  const email = req.body?.email;
  const customDomain = normalizeCustomDomain(req.body?.customDomain);
  const newSubdomain = username?.toLowerCase().trim();

  if (!username || !email)
    return res.status(400).json({ error: "username and email are required" });
  if (!/^[a-zA-Z0-9-]+$/.test(username))
    return res.status(400).json({
      error: "username can only contain letters, numbers, and hyphens",
    });

  const existing = await prisma.user.findFirst({
    where: { OR: [{ username }, { email }], NOT: { id: authUser.id } },
  });
  if (existing)
    return res.status(409).json({ error: "username or email already exists" });

  if (newSubdomain !== authUser.tenant.subdomain) {
    const existingTenant = await prisma.tenant.findUnique({
      where: { subdomain: newSubdomain },
      select: { id: true },
    });
    if (existingTenant)
      return res.status(409).json({ error: "subdomain already taken" });
  }

  if (customDomain && !isValidCustomDomain(customDomain))
    return res.status(400).json({ error: "invalid custom domain" });
  if (customDomain) {
    const existingDomain = await prisma.tenant.findFirst({
      where: { customDomain, NOT: { id: authUser.tenantId } },
      select: { id: true },
    });
    if (existingDomain)
      return res.status(409).json({ error: "custom domain already taken" });
  }

  const previousImageUrl = authUser.imageUrl;
  const uploadedImageUrl = req.file?.filename
    ? `/uploads/${req.file.filename}`
    : null;
  const imageUrl = uploadedImageUrl ?? authUser.imageUrl;

  let updatedUser;
  try {
    updatedUser = await prisma.$transaction(async (tx) => {
      await tx.tenant.update({
        where: { id: authUser.tenantId },
        data: { subdomain: newSubdomain, customDomain },
      });
      return tx.user.update({
        where: { id: authUser.id },
        data: { username, email, imageUrl },
        select: {
          id: true,
          username: true,
          email: true,
          imageUrl: true,
          createdAt: true,
          tenantId: true,
          tenant: {
            select: {
              id: true,
              subdomain: true,
              customDomain: true,
              createdAt: true,
            },
          },
        },
      });
    });
  } catch (err) {
    if (uploadedImageUrl) await deleteProfileImage(uploadedImageUrl);
    throw err;
  }

  if (
    uploadedImageUrl &&
    previousImageUrl &&
    previousImageUrl !== uploadedImageUrl
  ) {
    await deleteProfileImage(previousImageUrl);
  }

  // If custom domain is set and you're not on it, return a redirect URL like the old app.
  if (
    updatedUser.tenant.customDomain &&
    req.hostname !== updatedUser.tenant.customDomain
  ) {
    const token = createAuthHandoff(updatedUser.id);
    return res.json({
      ...updatedUser,
      redirectUrl: `${getTenantBaseUrl(updatedUser.tenant)}/auth/continue?token=${token}&next=${encodeURIComponent("/edit")}`,
    });
  }

  return res.json(updatedUser);
});

await ensureUploadsDir();
app.listen(API_PORT, "0.0.0.0", () => {
  // eslint-disable-next-line no-console
  console.log(`[api] listening on :${API_PORT}`);
});
