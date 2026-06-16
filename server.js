import 'dotenv/config'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createWriteStream } from 'node:fs'
import fs from 'node:fs/promises'
import dns from 'node:dns/promises'
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
const PORT = Number(process.env.PORT) || 9097
const PUBLIC_URL = process.env.PUBLIC_URL?.replace(/\/$/, '')
const SERVER_IP = process.env.SERVER_IP || ''
const authHandoffs = new Map()

const app = Fastify({ logger: true, trustProxy: true })

await app.register(cookie)
await app.register(formbody)
await app.register(multipart, { limits: { fileSize: 5 * 1024 * 1024 } })
await app.register(fastifyStatic, { root: path.join(__dirname, 'public') })

function isPlatformHost(host) {
  return host === 'localhost' || host === ROOT_DOMAIN || host.endsWith(`.${ROOT_DOMAIN}`)
}

function getRequestUrl(request, path = '/') {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${request.protocol}://${request.hostname}${normalizedPath}`
}

function setAuthCookie(reply, request, userId) {
  const options = {
    path: '/',
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 7,
    secure: request.protocol === 'https',
  }

  if (isPlatformHost(request.hostname)) {
    if (request.hostname !== 'localhost' && !request.hostname.endsWith('.localhost')) {
      options.domain = `.${ROOT_DOMAIN}`
    }
  }

  reply.setCookie('userId', userId, options)
}

function clearAuthCookie(reply, request) {
  const options = { path: '/' }

  if (isPlatformHost(request.hostname)) {
    if (request.hostname !== 'localhost' && !request.hostname.endsWith('.localhost')) {
      options.domain = `.${ROOT_DOMAIN}`
    }
  }

  reply.clearCookie('userId', options)
}

function createAuthHandoff(userId) {
  const token = randomBytes(24).toString('hex')
  authHandoffs.set(token, { userId, expires: Date.now() + 2 * 60 * 1000 })
  return token
}

function consumeAuthHandoff(token) {
  const entry = authHandoffs.get(token)
  if (!entry || entry.expires < Date.now()) {
    authHandoffs.delete(token)
    return null
  }

  authHandoffs.delete(token)
  return entry.userId
}

function redirectToTenant(reply, request, tenant, path, userId = null) {
  const targetPath = path.startsWith('/') ? path : `/${path}`

  if (tenant.customDomain && request.hostname !== tenant.customDomain && userId) {
    const token = createAuthHandoff(userId)
    return reply.redirect(`${getTenantBaseUrl(tenant)}/auth/continue?token=${token}&next=${encodeURIComponent(targetPath)}`)
  }

  return reply.redirect(getTenantUrl(request, tenant, targetPath))
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

async function verifyCustomDomainDns(domain) {
  if (!domain || !SERVER_IP) {
    return { verified: false, addresses: [] }
  }

  try {
    const addresses = await dns.resolve4(domain)
    return {
      verified: addresses.includes(SERVER_IP),
      addresses,
    }
  } catch {
    return { verified: false, addresses: [] }
  }
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

function getTenantBaseUrl(tenant) {
  if (tenant.customDomain) {
    return `${getPublicProtocol()}://${tenant.customDomain}`
  }

  return getSiteUrl(tenant.subdomain)
}

function isOnTenantHost(request, tenant) {
  const host = request.hostname

  if (tenant.customDomain && host === tenant.customDomain) {
    return true
  }

  if (host === `${tenant.subdomain}.${ROOT_DOMAIN}`) {
    return true
  }

  if (host.endsWith('.localhost')) {
    const subdomain = host.slice(0, -'.localhost'.length)
    return subdomain === tenant.subdomain
  }

  return false
}

function getTenantUrl(request, tenant, path = '/') {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`

  if (request && isOnTenantHost(request, tenant)) {
    return getRequestUrl(request, normalizedPath)
  }

  return `${getTenantBaseUrl(tenant)}${normalizedPath}`
}

function shouldCanonicalizeToCustomDomain(request, tenant) {
  if (!tenant.customDomain || request.hostname === tenant.customDomain) {
    return false
  }

  return request.hostname === `${tenant.subdomain}.${ROOT_DOMAIN}`
}

function isWrongTenantLogin(request, hostCtx, user) {
  if (hostCtx.type !== 'tenant') {
    return false
  }

  if (hostCtx.isCustomDomain) {
    return user.tenant.customDomain !== request.hostname
  }

  return user.tenant.subdomain !== hostCtx.subdomain
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

function getProfileUrl(request, authUser) {
  if (!authUser) {
    return request ? getRequestUrl(request, '/login') : getMainUrl('/login')
  }

  return getTenantUrl(request, authUser.tenant, '/edit')
}

function getNavUrls(request, authUser) {
  if (authUser?.tenant.customDomain) {
    const tenant = authUser.tenant
    const onCustomDomain = request?.hostname === tenant.customDomain
    const url = (path) => (
      onCustomDomain && request ? getRequestUrl(request, path) : `${getTenantBaseUrl(tenant)}${path}`
    )

    return {
      mainUrl: url('/'),
      loginUrl: url('/login'),
      registerUrl: url('/register'),
      profileUrl: url('/edit'),
      logoutUrl: url('/logout'),
    }
  }

  const base = request ? getRequestUrl(request, '/') : getMainUrl()

  return {
    mainUrl: base,
    loginUrl: request ? getRequestUrl(request, '/login') : getMainUrl('/login'),
    registerUrl: request ? getRequestUrl(request, '/register') : getMainUrl('/register'),
    profileUrl: getProfileUrl(request, authUser),
    logoutUrl: request ? getRequestUrl(request, '/logout') : getMainUrl('/logout'),
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
    ...getNavUrls(request, authUser),
  })

  return reply.type('text/html').send(html)
}

async function renderTenantNotFound(reply, request, subdomain) {
  const authUser = await getAuthUser(request.cookies.userId)
  const body = await ejs.renderFile(path.join(__dirname, 'views', 'tenant-not-found.ejs'), {
    subdomain,
    rootDomain: ROOT_DOMAIN,
    mainUrl: getRequestUrl(request, '/'),
    registerUrl: getRequestUrl(request, '/register'),
  })
  const html = await ejs.renderFile(path.join(__dirname, 'views', 'layout.ejs'), {
    title: 'Site not found',
    meta: null,
    body,
    authUser,
    ...getNavUrls(request, authUser),
  })

  return reply.code(404).type('text/html').send(html)
}

async function renderLoginPage(reply, request, { error = null, values = {}, redirectUrl = null, redirectSeconds = 5 } = {}) {
  return renderPage(reply, 'login.ejs', {
    title: 'Login',
    error,
    values,
    redirectUrl,
    redirectSeconds,
  }, request)
}

async function renderProfileEdit(reply, request, user, { error = null, success = null } = {}) {
  let customDomainVerified = false
  if (user.tenant.customDomain) {
    const dnsCheck = await verifyCustomDomainDns(user.tenant.customDomain)
    customDomainVerified = dnsCheck.verified
  }

  return renderPage(reply, 'profile-edit.ejs', {
    title: 'Edit profile',
    user,
    rootDomain: ROOT_DOMAIN,
    serverIp: SERVER_IP,
    customDomainVerified,
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

  if (shouldCanonicalizeToCustomDomain(request, user.tenant)) {
    return reply.redirect(`${getTenantBaseUrl(user.tenant)}${request.url}`)
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
    loginUrl: getRequestUrl(request, '/login'),
  }, request)
}

async function renderSubdomainEdit(request, reply, subdomain) {
  const authUser = await getAuthUser(request.cookies.userId)

  if (authUser?.tenant.subdomain === subdomain && shouldCanonicalizeToCustomDomain(request, authUser.tenant)) {
    return redirectToTenant(reply, request, authUser.tenant, '/edit', authUser.id)
  }

  if (!authUser || authUser.tenant.subdomain !== subdomain) {
    if (wantsJson(request)) {
      return reply.code(401).send({ error: 'not authenticated' })
    }

    return reply.redirect(getRequestUrl(request, '/login'))
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

// Caddy on_demand_tls calls this before issuing a certificate (custom domains only).
app.get('/internal/caddy-ask', async (request, reply) => {
  const domain = normalizeCustomDomain(request.query.domain)
  if (!domain || !isValidCustomDomain(domain)) return reply.code(403).send()
  if (domain === ROOT_DOMAIN || domain.endsWith(`.${ROOT_DOMAIN}`)) return reply.code(403).send()

  const tenant = await prisma.tenant.findFirst({
    where: { customDomain: domain },
    select: { id: true },
  })

  return tenant ? reply.code(200).send('ok') : reply.code(403).send()
})

app.get('/auth/continue', async (request, reply) => {
  const userId = consumeAuthHandoff(request.query.token)
  const nextPath = typeof request.query.next === 'string' && request.query.next.startsWith('/')
    ? request.query.next
    : '/edit'

  if (!userId) {
    return reply.redirect(getRequestUrl(request, '/login'))
  }

  setAuthCookie(reply, request, userId)
  return reply.redirect(getRequestUrl(request, nextPath))
})

app.get('/api/custom-domain/verify', async (request, reply) => {
  const authUser = await getAuthUser(request.cookies.userId)
  if (!authUser) {
    return reply.code(401).send({ error: 'not authenticated' })
  }

  const domain = normalizeCustomDomain(request.query.domain) || authUser.tenant.customDomain
  if (!domain) {
    return { domain: null, verified: false, status: 'none' }
  }

  if (!isValidCustomDomain(domain)) {
    return reply.code(400).send({ error: 'invalid domain' })
  }

  const dnsCheck = await verifyCustomDomainDns(domain)
  return {
    domain,
    verified: dnsCheck.verified,
    expectedIp: SERVER_IP || null,
    addresses: dnsCheck.addresses,
    status: dnsCheck.verified ? 'valid' : 'pending',
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
  return renderPage(reply, 'register.ejs', {
    title: 'Register',
    error: null,
    values: {},
  }, request)
})

app.post('/register', async (request, reply) => {
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

  setAuthCookie(reply, request, user.id)

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
      return reply.redirect(getProfileUrl(request, authUser))
    }
    return reply.redirect(getRequestUrl(request, '/login'))
  }

  return renderSubdomainEdit(request, reply, subdomain)
})

app.get('/login', async (request, reply) => {
  return renderLoginPage(reply, request)
})

app.post('/login', async (request, reply) => {
  const hostCtx = await resolveHost(request)
  const { email, password } = request.body

  if (!email || !password) {
    if (wantsJson(request)) {
      return reply.code(400).send({ error: 'email and password are required' })
    }

    return renderLoginPage(reply, request, {
      error: 'Email and password are required.',
      values: { email },
    })
  }

  const user = await prisma.user.findUnique({
    where: { email },
    include: { tenant: { select: { subdomain: true, customDomain: true } } },
  })

  if (!user) {
    if (wantsJson(request)) {
      return reply.code(401).send({ error: 'invalid credentials' })
    }

    return renderLoginPage(reply, request, {
      error: 'Invalid credentials.',
      values: { email },
    })
  }

  const valid = await bcrypt.compare(password, user.password)

  if (!valid) {
    if (wantsJson(request)) {
      return reply.code(401).send({ error: 'invalid credentials' })
    }

    return renderLoginPage(reply, request, {
      error: 'Invalid credentials.',
      values: { email },
    })
  }

  if (isWrongTenantLogin(request, hostCtx, user)) {
    const redirectUrl = `${getTenantBaseUrl(user.tenant)}/login`

    if (wantsJson(request)) {
      return reply.code(403).send({
        error: 'wrong tenant',
        message: 'This site belongs to someone else.',
        redirectUrl,
      })
    }

    return renderLoginPage(reply, request, {
      error: 'This site belongs to someone else. Redirecting you to your site…',
      values: { email },
      redirectUrl,
      redirectSeconds: 5,
    })
  }

  setAuthCookie(reply, request, user.id)

  if (wantsJson(request)) {
    return { isLoggedIn: true, userId: user.id }
  }

  if (user.tenant.customDomain && request.hostname !== user.tenant.customDomain) {
    return redirectToTenant(reply, request, user.tenant, '/edit', user.id)
  }

  return reply.redirect(getProfileUrl(request, user))
})

app.get('/logout', async (request, reply) => {
  clearAuthCookie(reply, request)
  return reply.redirect(getRequestUrl(request, '/login'))
})

app.post('/edit', async (request, reply) => {
  const hostCtx = await resolveHost(request)
  const currentSubdomain = getSubdomainFromContext(hostCtx)
  const authUser = await getAuthUser(request.cookies.userId)

  if (!authUser) {
    if (wantsJson(request)) {
      return reply.code(401).send({ error: 'not authenticated' })
    }

    return reply.redirect(getRequestUrl(request, '/login'))
  }

  if (hostCtx.isCustomDomain) {
    if (authUser.tenant.customDomain !== request.hostname) {
      return reply.redirect(getTenantUrl(null, authUser.tenant, '/edit'))
    }
  } else if (!currentSubdomain || authUser.tenant.subdomain !== currentSubdomain) {
    return reply.redirect(getTenantUrl(null, authUser.tenant, '/edit'))
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

  if (updatedUser.tenant.customDomain && request.hostname !== updatedUser.tenant.customDomain) {
    return redirectToTenant(reply, request, updatedUser.tenant, '/edit', updatedUser.id)
  }

  if (updatedUser.tenant.subdomain !== currentSubdomain) {
    return reply.redirect(getTenantUrl(request, updatedUser.tenant, '/edit'))
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
