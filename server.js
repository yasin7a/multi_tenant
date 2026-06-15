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
const app = Fastify({ logger: true })

await app.register(cookie)
await app.register(formbody)
await app.register(multipart, { limits: { fileSize: 5 * 1024 * 1024 } })
await app.register(fastifyStatic, { root: path.join(__dirname, 'public') })

const ROOT_DOMAIN = process.env.ROOT_DOMAIN || 'lvh.me'
const PORT = process.env.PORT || 3000

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

function getSubdomain(request) {
  const host = request.hostname

  if (host === 'localhost' || host === ROOT_DOMAIN) {
    return null
  }

  if (host.endsWith('.localhost')) {
    return host.slice(0, -'.localhost'.length)
  }

  if (host.endsWith(`.${ROOT_DOMAIN}`)) {
    return host.slice(0, -(ROOT_DOMAIN.length + 1))
  }

  const parts = host.split('.')
  if (parts.length >= 3) {
    return parts[0]
  }

  return null
}

function getSiteUrl(subdomain) {
  return `http://${subdomain}.${ROOT_DOMAIN}:${PORT}`
}

function formatProfileDate(date) {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function buildPublicProfileMeta(user, subdomain) {
  const profileUrl = getSiteUrl(subdomain)
  const description = `Public profile of ${user.username} at ${subdomain}.${ROOT_DOMAIN}`
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
      tenant: { select: { id: true, subdomain: true, createdAt: true } },
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
      tenant: { select: { id: true, subdomain: true, createdAt: true } },
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

  const profileUrl = getSiteUrl(subdomain)

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

async function renderSubdomainEdit(request, reply, subdomain) {
  const authUser = await getAuthUser(request.cookies.userId)

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

app.get('/', async (request, reply) => {
  const subdomain = getSubdomain(request)

  if (subdomain) {
    return renderPublicProfile(request, reply, subdomain)
  }

  if (wantsJson(request)) {
    return { message: 'server is ok' }
  }

  return renderPage(reply, 'home.ejs', { title: 'Multi Tenant App' }, request)
})

app.get('/register', async (request, reply) => {
  if (getSubdomain(request)) {
    return reply.redirect(getMainUrl('/register'))
  }

  return renderPage(reply, 'register.ejs', {
    title: 'Register',
    error: null,
    values: {},
  }, request)
})

app.post('/register', async (request, reply) => {
  if (getSubdomain(request)) {
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
  const subdomain = getSubdomain(request)

  if (!subdomain) {
    const authUser = await getAuthUser(request.cookies.userId)
    if (authUser) {
      return reply.redirect(`${getSiteUrl(authUser.tenant.subdomain)}/edit`)
    }
    return reply.redirect(getMainUrl('/login'))
  }

  return renderSubdomainEdit(request, reply, subdomain)
})

app.get('/login', async (request, reply) => {
  if (getSubdomain(request)) {
    return reply.redirect(getMainUrl('/login'))
  }

  return renderPage(reply, 'login.ejs', {
    title: 'Login',
    error: null,
    values: {},
  }, request)
})

app.post('/login', async (request, reply) => {
  if (getSubdomain(request)) {
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
  const currentSubdomain = getSubdomain(request)
  const authUser = await getAuthUser(request.cookies.userId)

  if (!authUser) {
    if (wantsJson(request)) {
      return reply.code(401).send({ error: 'not authenticated' })
    }

    return reply.redirect(getMainUrl('/login'))
  }

  if (!currentSubdomain || authUser.tenant.subdomain !== currentSubdomain) {
    return reply.redirect(`${getSiteUrl(authUser.tenant.subdomain)}/edit`)
  }

  const { username, email, newImageUrl, imageError } = await parseEditRequest(request)
  const newSubdomain = username?.toLowerCase().trim()
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

  const imageUrl = newImageUrl ?? authUser.imageUrl

  let updatedUser

  try {
    updatedUser = await prisma.$transaction(async (tx) => {
      await tx.tenant.update({
        where: { id: authUser.tenantId },
        data: { subdomain: newSubdomain },
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
          tenant: { select: { id: true, subdomain: true, createdAt: true } },
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
