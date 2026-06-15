import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createWriteStream } from 'node:fs'
import fs from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import { pipeline } from 'node:stream/promises'
import Fastify from 'fastify'
import cookie from '@fastify/cookie'
import formbody from '@fastify/formbody'
import multipart from '@fastify/multipart'
import fastifyStatic from '@fastify/static'
import ejs from 'ejs'
import bcrypt from 'bcryptjs'
import { prisma } from './lib/prisma.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads')
const ALLOWED_IMAGE_TYPES = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
}
const ROOT_DOMAIN = process.env.ROOT_DOMAIN || 'lvh.me'
const PORT = process.env.PORT || 3000
const PUBLIC_URL = process.env.PUBLIC_URL?.replace(/\/$/, '')
const SERVER_IP = process.env.SERVER_IP || ''

const app = Fastify({ logger: true, trustProxy: true })

await app.register(cookie)
await app.register(formbody)
await app.register(multipart, { limits: { fileSize: 5 * 1024 * 1024 } })
await app.register(fastifyStatic, { root: path.join(__dirname, 'public') })

function setAuthCookie(reply, userId) {
  const options = {
    path: '/',
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 7,
  }

  if (ROOT_DOMAIN !== 'localhost') {
    options.domain = `.${ROOT_DOMAIN}`
  }

  reply.setCookie('userId', userId, options)
}

function clearAuthCookie(reply) {
  const options = { path: '/' }

  if (ROOT_DOMAIN !== 'localhost') {
    options.domain = `.${ROOT_DOMAIN}`
  }

  reply.clearCookie('userId', options)
}

function normalizeCustomDomain(value) {
  if (!value) return null

  let domain = String(value).trim().toLowerCase()
  domain = domain.replace(/^https?:\/\//, '')
  domain = domain.split('/')[0].split(':')[0].replace(/\.$/, '')

  return domain || null
}

function isValidCustomDomain(domain) {
  if (!domain || domain.length > 253) return false
  if (domain === ROOT_DOMAIN || domain.endsWith(`.${ROOT_DOMAIN}`)) return false
  if (domain === 'localhost' || domain.endsWith('.localhost')) return false
  if (/^\d+\.\d+\.\d+\.\d+$/.test(domain)) return false

  return /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/.test(domain)
}

async function resolveHost(request) {
  const host = request.hostname

  if (host === 'localhost' || host === ROOT_DOMAIN) {
    return { type: 'main' }
  }

  if (host.endsWith('.localhost')) {
    return {
      type: 'tenant',
      subdomain: host.slice(0, -'.localhost'.length),
      isCustomDomain: false,
    }
  }

  if (host.endsWith(`.${ROOT_DOMAIN}`)) {
    return {
      type: 'tenant',
      subdomain: host.slice(0, -(ROOT_DOMAIN.length + 1)),
      isCustomDomain: false,
    }
  }

  const tenant = await prisma.tenant.findFirst({
    where: { customDomain: host },
    select: { subdomain: true },
  })

  if (tenant) {
    return {
      type: 'tenant',
      subdomain: tenant.subdomain,
      isCustomDomain: true,
    }
  }

  return { type: 'unknown', host }
}

function getSubdomainFromContext(ctx) {
  return ctx.type === 'tenant' ? ctx.subdomain : null
}

function getPublicProtocol() {
  if (PUBLIC_URL?.startsWith('https')) return 'https'
  if (PUBLIC_URL?.startsWith('http')) return 'http'

  return 'http'
}

function getSiteUrl(subdomain) {
  if (PUBLIC_URL) {
    return `${getPublicProtocol()}://${subdomain}.${ROOT_DOMAIN}`
  }

  return `http://${subdomain}.${ROOT_DOMAIN}:${PORT}`
}

function getTenantPublicUrl(tenant) {
  if (tenant.customDomain) {
    return `${getPublicProtocol()}://${tenant.customDomain}`
  }

  return getSiteUrl(tenant.subdomain)
}

function formatProfileDate(date) {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function buildPublicProfileMeta(user, subdomain) {
  const profileUrl = getTenantPublicUrl(user.tenant)
  const description = user.tenant.customDomain
    ? `Public profile of ${user.username} at ${user.tenant.customDomain}`
    : `Public profile of ${user.username} at ${subdomain}.${ROOT_DOMAIN}`
  const imageUrl = user.imageUrl ? `${profileUrl}${user.imageUrl}` : null

  return {
    description,
    canonical: profileUrl,
    ogType: 'profile',
    ogTitle: `${user.username}'s profile`,
    ogDescription: description,
    ogUrl: profileUrl,
    ogImage: imageUrl,
    twitterCard: imageUrl ? 'summary_large_image' : 'summary',
  }
}

function getMainUrl(path = '/') {
  if (PUBLIC_URL) {
    return `${PUBLIC_URL}${path}`
  }

  return `http://${ROOT_DOMAIN}:${PORT}${path}`
}

function getNavUrls(authUser) {
  return {
    mainUrl: getMainUrl(),
    loginUrl: getMainUrl('/login'),
    registerUrl: getMainUrl('/register'),
    profileUrl: authUser ? `${getSiteUrl(authUser.tenant.subdomain)}/edit` : getMainUrl('/login'),
    logoutUrl: getMainUrl('/logout'),
  }
}

function wantsJson(request) {
  const accept = request.headers.accept || ''
  return accept.includes('application/json') && !accept.includes('text/html')
}

async function parseEditRequest(request) {
  const contentType = request.headers['content-type'] || ''

  if (contentType.includes('multipart/form-data')) {
    const fields = {}
    let newImageUrl = null
    let imageError = null

    for await (const part of request.parts()) {
      if (part.type === 'file') {
        if (part.fieldname === 'image' && part.filename) {
          const result = await saveProfileImage(part)
          if (result.error) {
            imageError = result.error
          } else {
            newImageUrl = result.imageUrl
          }
        } else {
          part.file.resume()
        }
      } else {
        fields[part.fieldname] = part.value
      }
    }

    return { ...fields, newImageUrl, imageError }
  }

  return { ...request.body, newImageUrl: null, imageError: null }
}

async function saveProfileImage(part) {
  if (!part?.filename) {
    return { imageUrl: null }
  }

  const ext = ALLOWED_IMAGE_TYPES[part.mimetype]
  if (!ext) {
    part.file.resume()
    return { error: 'Invalid image type. Use JPEG, PNG, GIF, or WebP.' }
  }

  const filename = `${randomBytes(16).toString('hex')}${ext}`
  const filepath = path.join(UPLOADS_DIR, filename)

  await pipeline(part.file, createWriteStream(filepath))

  if (part.file.truncated) {
    await fs.unlink(filepath).catch(() => {})
    return { error: 'Image is too large. Max 5 MB.' }
  }

  return { imageUrl: `/uploads/${filename}` }
}

async function deleteProfileImage(imageUrl) {
  if (!imageUrl?.startsWith('/uploads/')) {
    return
  }

  const filename = path.basename(imageUrl)
  if (!filename || filename.includes('..')) {
    return
  }

  const filepath = path.resolve(UPLOADS_DIR, filename)
  if (!filepath.startsWith(path.resolve(UPLOADS_DIR))) {
    return
  }

  try {
    await fs.unlink(filepath)
  } catch (err) {
    if (err.code !== 'ENOENT') {
      app.log.warn({ err, imageUrl }, 'failed to delete profile image')
    }
  }
}

async function getAuthUser(userId) {
  if (!userId) return null

  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      email: true,
      imageUrl: true,
      createdAt: true,
      tenantId: true,
      tenant: { select: { id: true, subdomain: true, customDomain: true, createdAt: true } },
    },
  })
}

async function renderPage(reply, template, data, request) {
  const authUser = data.authUser ?? (request ? await getAuthUser(request.cookies.userId) : null)
  const body = await ejs.renderFile(path.join(__dirname, 'views', template), data)
  const html = await ejs.renderFile(path.join(__dirname, 'views', 'layout.ejs'), {
    title: data.title,
    meta: data.meta ?? null,
    body,
    authUser,
    ...getNavUrls(authUser),
  })

  return reply.type('text/html').send(html)
}

async function renderTenantNotFound(reply, request, subdomain) {
  const authUser = await getAuthUser(request.cookies.userId)
  const body = await ejs.renderFile(path.join(__dirname, 'views', 'tenant-not-found.ejs'), {
    subdomain,
    rootDomain: ROOT_DOMAIN,
    mainUrl: getMainUrl(),
  })
  const html = await ejs.renderFile(path.join(__dirname, 'views', 'layout.ejs'), {
    title: 'Site not found',
    meta: null,
    body,
    authUser,
    ...getNavUrls(authUser),
  })

  return reply.code(404).type('text/html').send(html)
}

async function renderProfileEdit(reply, request, user, { error = null, success = null } = {}) {
  return renderPage(reply, 'profile-edit.ejs', {
    title: 'Edit profile',
    user,
    rootDomain: ROOT_DOMAIN,
    serverIp: SERVER_IP,
    error,
    success,
  }, request)
}

async function getPublicProfile(subdomain) {
  return prisma.user.findFirst({
    where: { tenant: { subdomain } },
    select: {
      username: true,
      email: true,
      imageUrl: true,
      createdAt: true,
      tenantId: true,
      tenant: { select: { id: true, subdomain: true, customDomain: true, createdAt: true } },
    },
  })
}

async function renderPublicProfile(request, reply, subdomain) {
  const user = await getPublicProfile(subdomain)

  if (!user) {
    if (wantsJson(request)) {
      return reply.code(404).send({ error: 'profile not found' })
    }

    return renderTenantNotFound(reply, request, subdomain)
  }

  if (wantsJson(request)) {
    return {
      username: user.username,
      email: user.email,
      imageUrl: user.imageUrl,
      createdAt: user.createdAt,
      tenantId: user.tenantId,
      tenant: user.tenant,
    }
  }

  const profileUrl = getTenantPublicUrl(user.tenant)

  return renderPage(reply, 'profile-public.ejs', {
    title: `${user.username}'s profile`,
    user,
    rootDomain: ROOT_DOMAIN,
    profileUrl,
    memberSince: formatProfileDate(user.createdAt),
    siteCreated: formatProfileDate(user.tenant.createdAt),
    meta: buildPublicProfileMeta(user, subdomain),
    loginUrl: getMainUrl('/login'),
  }, request)
}

async function renderSubdomainEdit(request, reply, subdomain, { isCustomDomain = false } = {}) {
  const authUser = await getAuthUser(request.cookies.userId)

  if (isCustomDomain) {
    return reply.redirect(`${getSiteUrl(subdomain)}/edit`)
  }

  if (!authUser || authUser.tenant.subdomain !== subdomain) {
    if (wantsJson(request)) {
      return reply.code(401).send({ error: 'not authenticated' })
    }

    return reply.redirect(getMainUrl('/login'))
  }

  if (wantsJson(request)) {
    return {
      isLoggedIn: true,
      userId: authUser.id,
      username: authUser.username,
      email: authUser.email,
      imageUrl: authUser.imageUrl,
      createdAt: authUser.createdAt,
      tenantId: authUser.tenantId,
      tenant: authUser.tenant,
    }
  }

  return renderProfileEdit(reply, request, authUser)
}

app.get('/internal/caddy-ask', async (request, reply) => {
  const domain = normalizeCustomDomain(request.query.domain)

  if (!domain) {
    return reply.code(403).send()
  }

  if (domain === ROOT_DOMAIN) {
    return reply.code(200).send('ok')
  }

  if (domain.endsWith(`.${ROOT_DOMAIN}`)) {
    const subdomain = domain.slice(0, -(ROOT_DOMAIN.length + 1))

    if (!subdomain || subdomain.includes('.')) {
      return reply.code(403).send()
    }

    // Approve any platform subdomain so Caddy can issue SSL.
    // Unknown tenants get a 404 page from the app, not ERR_SSL_PROTOCOL_ERROR.
    if (/^[a-z0-9-]+$/.test(subdomain)) {
      return reply.code(200).send('ok')
    }

    return reply.code(403).send()
  }

  if (!isValidCustomDomain(domain)) {
    return reply.code(403).send()
  }

  const tenant = await prisma.tenant.findFirst({
    where: { customDomain: domain },
    select: { id: true },
  })

  if (!tenant) {
    return reply.code(403).send()
  }

  return reply.code(200).send('ok')
})

app.get('/internal/caddy-check', async (request, reply) => {
  const domain = normalizeCustomDomain(request.query.domain)
  const askUrl = domain
    ? `http://127.0.0.1:${PORT}/internal/caddy-ask?domain=${encodeURIComponent(domain)}`
    : null

  let askStatus = null
  if (domain) {
    try {
      const res = await fetch(askUrl)
      askStatus = res.status
    } catch {
      askStatus = 'error'
    }
  }

  return {
    rootDomain: ROOT_DOMAIN,
    domain,
    askStatus,
    hint: askStatus === 200
      ? 'Caddy can issue SSL for this domain'
      : 'Fix ROOT_DOMAIN, tenant subdomain, or pull latest server.js — then pm2 restart',
  }
})

app.get('/', async (request, reply) => {
  const hostCtx = await resolveHost(request)
  const subdomain = getSubdomainFromContext(hostCtx)

  if (hostCtx.type === 'unknown') {
    if (wantsJson(request)) {
      return reply.code(404).send({ error: 'site not found' })
    }

    return renderTenantNotFound(reply, request, hostCtx.host)
  }

  if (subdomain) {
    return renderPublicProfile(request, reply, subdomain)
  }

  if (wantsJson(request)) {
    return { message: 'server is ok' }
  }

  return renderPage(reply, 'home.ejs', { title: 'Multi Tenant App' }, request)
})

app.get('/register', async (request, reply) => {
  const hostCtx = await resolveHost(request)

  if (hostCtx.type !== 'main') {
    return reply.redirect(getMainUrl('/register'))
  }

  return renderPage(reply, 'register.ejs', {
    title: 'Register',
    error: null,
    values: {},
  }, request)
})

app.post('/register', async (request, reply) => {
  const hostCtx = await resolveHost(request)

  if (hostCtx.type !== 'main') {
    return reply.redirect(getMainUrl('/register'))
  }

  const { username, email, password } = request.body

  if (!username || !email || !password) {
    if (wantsJson(request)) {
      return reply.code(400).send({ error: 'username, email, and password are required' })
    }

    return renderPage(reply, 'register.ejs', {
      title: 'Register',
      error: 'Username, email, and password are required.',
      values: { username, email },
    }, request)
  }

  const existing = await prisma.user.findFirst({
    where: { OR: [{ username }, { email }] },
  })

  if (existing) {
    if (wantsJson(request)) {
      return reply.code(409).send({ error: 'username or email already exists' })
    }

    return renderPage(reply, 'register.ejs', {
      title: 'Register',
      error: 'Username or email already exists.',
      values: { username, email },
    }, request)
  }

  const subdomain = username.toLowerCase()
  const existingTenant = await prisma.tenant.findUnique({
    where: { subdomain },
    select: { id: true },
  })

  if (existingTenant) {
    if (wantsJson(request)) {
      return reply.code(409).send({ error: 'subdomain already taken' })
    }

    return renderPage(reply, 'register.ejs', {
      title: 'Register',
      error: 'Subdomain already taken.',
      values: { username, email },
    }, request)
  }

  const hashedPassword = await bcrypt.hash(password, 10)

  const user = await prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.create({
      data: { subdomain },
    })

    return tx.user.create({
      data: {
        username,
        email,
        password: hashedPassword,
        tenantId: tenant.id,
      },
      select: { id: true },
    })
  })

  setAuthCookie(reply, user.id)

  if (wantsJson(request)) {
    return reply.code(201).send({ isLoggedIn: true, userId: user.id })
  }

  return reply.redirect(`${getSiteUrl(subdomain)}/edit`)
})

app.get('/edit', async (request, reply) => {
  const hostCtx = await resolveHost(request)
  const subdomain = getSubdomainFromContext(hostCtx)

  if (hostCtx.type === 'unknown') {
    return renderTenantNotFound(reply, request, hostCtx.host)
  }

  if (!subdomain) {
    const authUser = await getAuthUser(request.cookies.userId)
    if (authUser) {
      return reply.redirect(`${getSiteUrl(authUser.tenant.subdomain)}/edit`)
    }
    return reply.redirect(getMainUrl('/login'))
  }

  return renderSubdomainEdit(request, reply, subdomain, {
    isCustomDomain: hostCtx.isCustomDomain,
  })
})

app.get('/login', async (request, reply) => {
  const hostCtx = await resolveHost(request)

  if (hostCtx.type !== 'main') {
    return reply.redirect(getMainUrl('/login'))
  }

  return renderPage(reply, 'login.ejs', {
    title: 'Login',
    error: null,
    values: {},
  }, request)
})

app.post('/login', async (request, reply) => {
  const hostCtx = await resolveHost(request)

  if (hostCtx.type !== 'main') {
    return reply.redirect(getMainUrl('/login'))
  }

  const { email, password } = request.body

  if (!email || !password) {
    if (wantsJson(request)) {
      return reply.code(400).send({ error: 'email and password are required' })
    }

    return renderPage(reply, 'login.ejs', {
      title: 'Login',
      error: 'Email and password are required.',
      values: { email },
    }, request)
  }

  const user = await prisma.user.findUnique({
    where: { email },
    include: { tenant: { select: { subdomain: true } } },
  })

  if (!user) {
    if (wantsJson(request)) {
      return reply.code(401).send({ error: 'invalid credentials' })
    }

    return renderPage(reply, 'login.ejs', {
      title: 'Login',
      error: 'Invalid credentials.',
      values: { email },
    }, request)
  }

  const valid = await bcrypt.compare(password, user.password)

  if (!valid) {
    if (wantsJson(request)) {
      return reply.code(401).send({ error: 'invalid credentials' })
    }

    return renderPage(reply, 'login.ejs', {
      title: 'Login',
      error: 'Invalid credentials.',
      values: { email },
    }, request)
  }

  setAuthCookie(reply, user.id)

  if (wantsJson(request)) {
    return { isLoggedIn: true, userId: user.id }
  }

  return reply.redirect(`${getSiteUrl(user.tenant.subdomain)}/edit`)
})

app.get('/logout', async (request, reply) => {
  clearAuthCookie(reply)
  return reply.redirect(getMainUrl('/login'))
})

app.post('/edit', async (request, reply) => {
  const hostCtx = await resolveHost(request)
  const currentSubdomain = getSubdomainFromContext(hostCtx)
  const authUser = await getAuthUser(request.cookies.userId)

  if (!authUser) {
    if (wantsJson(request)) {
      return reply.code(401).send({ error: 'not authenticated' })
    }

    return reply.redirect(getMainUrl('/login'))
  }

  if (hostCtx.isCustomDomain || !currentSubdomain || authUser.tenant.subdomain !== currentSubdomain) {
    return reply.redirect(`${getSiteUrl(authUser.tenant.subdomain)}/edit`)
  }

  const { username, email, customDomain: customDomainRaw, newImageUrl, imageError } = await parseEditRequest(request)
  const newSubdomain = username?.toLowerCase().trim()
  const customDomain = normalizeCustomDomain(customDomainRaw)
  const previousImageUrl = authUser.imageUrl

  const rejectEdit = async (options) => {
    if (newImageUrl) {
      await deleteProfileImage(newImageUrl)
    }

    if (wantsJson(request)) {
      return reply.code(options.status).send({ error: options.error })
    }

    return renderProfileEdit(reply, request, authUser, {
      error: options.message,
    })
  }

  if (imageError) {
    return rejectEdit({
      status: 400,
      error: imageError,
      message: imageError,
    })
  }

  if (!username || !email) {
    return rejectEdit({
      status: 400,
      error: 'username and email are required',
      message: 'Username and email are required.',
    })
  }

  if (!/^[a-zA-Z0-9-]+$/.test(username)) {
    return rejectEdit({
      status: 400,
      error: 'username can only contain letters, numbers, and hyphens',
      message: 'Username can only contain letters, numbers, and hyphens.',
    })
  }

  const existing = await prisma.user.findFirst({
    where: {
      OR: [{ username }, { email }],
      NOT: { id: authUser.id },
    },
  })

  if (existing) {
    return rejectEdit({
      status: 409,
      error: 'username or email already exists',
      message: 'Username or email already exists.',
    })
  }

  if (newSubdomain !== authUser.tenant.subdomain) {
    const existingTenant = await prisma.tenant.findUnique({
      where: { subdomain: newSubdomain },
      select: { id: true },
    })

    if (existingTenant) {
      return rejectEdit({
        status: 409,
        error: 'subdomain already taken',
        message: 'That username is already taken as a subdomain.',
      })
    }
  }

  if (customDomain && !isValidCustomDomain(customDomain)) {
    return rejectEdit({
      status: 400,
      error: 'invalid custom domain',
      message: 'Enter a valid custom domain (e.g. mysite.com). Platform subdomains cannot be used.',
    })
  }

  if (customDomain) {
    const existingDomain = await prisma.tenant.findFirst({
      where: {
        customDomain,
        NOT: { id: authUser.tenantId },
      },
      select: { id: true },
    })

    if (existingDomain) {
      return rejectEdit({
        status: 409,
        error: 'custom domain already taken',
        message: 'That custom domain is already in use.',
      })
    }
  }

  const imageUrl = newImageUrl ?? authUser.imageUrl

  let updatedUser

  try {
    updatedUser = await prisma.$transaction(async (tx) => {
      await tx.tenant.update({
        where: { id: authUser.tenantId },
        data: { subdomain: newSubdomain, customDomain },
      })

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
          tenant: { select: { id: true, subdomain: true, customDomain: true, createdAt: true } },
        },
      })
    })
  } catch (err) {
    if (newImageUrl) {
      await deleteProfileImage(newImageUrl)
    }

    throw err
  }

  if (newImageUrl && previousImageUrl && previousImageUrl !== newImageUrl) {
    await deleteProfileImage(previousImageUrl)
  }

  if (wantsJson(request)) {
    return {
      isLoggedIn: true,
      userId: updatedUser.id,
      username: updatedUser.username,
      email: updatedUser.email,
      imageUrl: updatedUser.imageUrl,
      createdAt: updatedUser.createdAt,
      tenantId: updatedUser.tenantId,
      tenant: updatedUser.tenant,
    }
  }

  if (updatedUser.tenant.subdomain !== currentSubdomain) {
    return reply.redirect(`${getSiteUrl(updatedUser.tenant.subdomain)}/edit`)
  }

  return renderProfileEdit(reply, request, updatedUser, {
    success: 'Profile updated successfully.',
  })
})

const start = async () => {
  try {
    await app.listen({ port: PORT, host: '0.0.0.0' })
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

start()
