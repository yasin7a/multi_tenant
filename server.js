import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Fastify from 'fastify'
import cookie from '@fastify/cookie'
import formbody from '@fastify/formbody'
import fastifyStatic from '@fastify/static'
import view from '@fastify/view'
import ejs from 'ejs'
import bcrypt from 'bcryptjs'
import { prisma } from './lib/prisma.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = Fastify({ logger: true })

await app.register(cookie)
await app.register(formbody)
await app.register(fastifyStatic, { root: path.join(__dirname, 'public') })
await app.register(view, {
  engine: { ejs },
  root: path.join(__dirname, 'views'),
})

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

function getMainUrl(path = '/') {
  return `http://${ROOT_DOMAIN}:${PORT}${path}`
}

function getNavUrls(authUser) {
  return {
    mainUrl: getMainUrl(),
    loginUrl: getMainUrl('/login'),
    registerUrl: getMainUrl('/register'),
    profileUrl: authUser ? `${getSiteUrl(authUser.tenant.subdomain)}/edit` : getMainUrl('/profile'),
    logoutUrl: getMainUrl('/logout'),
  }
}

async function renderProfileEdit(reply, request, user, { error = null, success = null } = {}) {
  return renderPage(reply, 'profile-edit.ejs', {
    title: 'Edit profile',
    user,
    siteUrl: getSiteUrl(user.tenant.subdomain),
    rootDomain: ROOT_DOMAIN,
    error,
    success,
  }, request)
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
    body,
    authUser,
    ...getNavUrls(authUser),
  })

  return reply.code(404).type('text/html').send(html)
}

function wantsJson(request) {
  const accept = request.headers.accept || ''
  return accept.includes('application/json') && !accept.includes('text/html')
}

async function getAuthUser(userId) {
  if (!userId) return null

  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      email: true,
      tenantId: true,
      tenant: { select: { id: true, name: true, subdomain: true } },
    },
  })
}

async function renderPage(reply, template, data, request) {
  const authUser = data.authUser ?? (request ? await getAuthUser(request.cookies.userId) : null)
  const body = await ejs.renderFile(path.join(__dirname, 'views', template), data)
  const html = await ejs.renderFile(path.join(__dirname, 'views', 'layout.ejs'), {
    title: data.title,
    body,
    authUser,
    ...getNavUrls(authUser),
  })

  return reply.type('text/html').send(html)
}

async function getPublicProfile(subdomain) {
  return prisma.user.findFirst({
    where: { tenant: { subdomain } },
    select: {
      username: true,
      tenantId: true,
      tenant: { select: { id: true, name: true, subdomain: true } },
    },
  })
}

async function publicProfilePageHandler(request, reply) {
  const subdomain = getSubdomain(request)

  if (!subdomain) {
    if (wantsJson(request)) {
      return reply.code(400).send({ error: 'visit a tenant subdomain to view their site' })
    }

    return renderPage(reply, 'error.ejs', {
      title: 'Subdomain required',
      message: 'Visit a tenant subdomain to view their site.',
      subdomain: false,
    }, request)
  }

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
      tenantId: user.tenantId,
      tenant: user.tenant,
    }
  }

  return renderPage(reply, 'profile-public.ejs', {
    title: `${user.username}'s profile`,
    user,
    rootDomain: ROOT_DOMAIN,
    loginUrl: getMainUrl('/login'),
  }, request)
}

async function publicSiteHandler(request, reply) {
  const subdomain = getSubdomain(request)

  if (!subdomain) {
    if (wantsJson(request)) {
      return reply.code(400).send({ error: 'visit a tenant subdomain to view their site' })
    }

    return renderPage(reply, 'error.ejs', {
      title: 'Subdomain required',
      message: 'Visit a tenant subdomain to view their site.',
      subdomain: false,
    }, request)
  }

  const user = await getPublicProfile(subdomain)

  if (!user) {
    if (wantsJson(request)) {
      return reply.code(404).send({ error: 'site not found' })
    }

    return renderTenantNotFound(reply, request, subdomain)
  }

  if (wantsJson(request)) {
    return {
      username: user.username,
      tenantId: user.tenantId,
      tenant: user.tenant,
    }
  }

  return renderPage(reply, 'site.ejs', {
    title: `${user.username}'s site`,
    user,
  }, request)
}

async function subdomainPublicHandler(request, reply) {
  return publicProfilePageHandler(request, reply)
}

async function subdomainEditHandler(request, reply) {
  const subdomain = getSubdomain(request)

  if (!subdomain) {
    return reply.redirect(getMainUrl('/'))
  }

  const authUser = await getAuthUser(request.cookies.userId)

  if (!authUser || authUser.tenant.subdomain !== subdomain) {
    if (wantsJson(request)) {
      return reply.code(401).send({ error: 'not authenticated' })
    }

    return reply.redirect(getMainUrl('/login'))
  }

  if (wantsJson(request)) {
    return authProfileJson(authUser)
  }

  return renderProfileEdit(reply, request, authUser)
}

app.get('/', async (request, reply) => {
  const subdomain = getSubdomain(request)

  if (subdomain) {
    return subdomainPublicHandler(request, reply)
  }

  if (wantsJson(request)) {
    return { message: 'server is ok' }
  }

  return renderPage(reply, 'home.ejs', { title: 'Multi Tenant App' }, request)
})

app.get('/site', publicSiteHandler)

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
  const existingTenant = await prisma.tenant.findUnique({ where: { subdomain } })

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
      data: { name: `${username}'s tenant`, subdomain },
    })

    return tx.user.create({
      data: {
        username,
        email,
        password: hashedPassword,
        tenantId: tenant.id,
      },
      select: { id: true, username: true, email: true, tenantId: true },
    })
  })

  setAuthCookie(reply, user.id)

  if (wantsJson(request)) {
    return reply.code(201).send({ isLoggedIn: true, userId: user.id })
  }

  return reply.redirect(`${getSiteUrl(subdomain)}/edit`)
})

app.get('/edit', async (request, reply) => {
  if (!getSubdomain(request)) {
    const authUser = await getAuthUser(request.cookies.userId)
    if (authUser) {
      return reply.redirect(`${getSiteUrl(authUser.tenant.subdomain)}/edit`)
    }
    return reply.redirect(getMainUrl('/login'))
  }

  return subdomainEditHandler(request, reply)
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

function publicProfileJson(user) {
  return {
    username: user.username,
    tenantId: user.tenantId,
    tenant: user.tenant,
  }
}

function authProfileJson(user) {
  return {
    isLoggedIn: true,
    userId: user.id,
    username: user.username,
    email: user.email,
    tenantId: user.tenantId,
    tenant: user.tenant,
  }
}

app.get('/profile', async (request, reply) => {
  const subdomain = getSubdomain(request)
  const authUser = await getAuthUser(request.cookies.userId)

  if (!subdomain) {
    if (!authUser) {
      if (wantsJson(request)) {
        return reply.code(401).send({ error: 'not authenticated' })
      }

      return reply.redirect(getMainUrl('/login'))
    }

    return reply.redirect(`${getSiteUrl(authUser.tenant.subdomain)}/edit`)
  }

  return subdomainPublicHandler(request, reply)
})

app.post('/edit', async (request, reply) => {
  const subdomain = getSubdomain(request)
  const authUser = await getAuthUser(request.cookies.userId)

  if (!authUser) {
    if (wantsJson(request)) {
      return reply.code(401).send({ error: 'not authenticated' })
    }

    return reply.redirect(getMainUrl('/login'))
  }

  if (!subdomain || authUser.tenant.subdomain !== subdomain) {
    return reply.redirect(`${getSiteUrl(authUser.tenant.subdomain)}/edit`)
  }

  const { username, email, tenantName } = request.body

  if (!username || !email || !tenantName) {
    if (wantsJson(request)) {
      return reply.code(400).send({ error: 'username, email, and tenant name are required' })
    }

    return renderProfileEdit(reply, request, authUser, {
      error: 'Username, email, and tenant name are required.',
    })
  }

  const existing = await prisma.user.findFirst({
    where: {
      OR: [{ username }, { email }],
      NOT: { id: authUser.id },
    },
  })

  if (existing) {
    if (wantsJson(request)) {
      return reply.code(409).send({ error: 'username or email already exists' })
    }

    return renderProfileEdit(reply, request, authUser, {
      error: 'Username or email already exists.',
    })
  }

  const updatedUser = await prisma.$transaction(async (tx) => {
    await tx.tenant.update({
      where: { id: authUser.tenantId },
      data: { name: tenantName },
    })

    return tx.user.update({
      where: { id: authUser.id },
      data: { username, email },
      select: {
        id: true,
        username: true,
        email: true,
        tenantId: true,
        tenant: { select: { id: true, name: true, subdomain: true } },
      },
    })
  })

  if (wantsJson(request)) {
    return authProfileJson(updatedUser)
  }

  return renderProfileEdit(reply, request, updatedUser, {
    success: 'Profile updated successfully.',
  })
})

app.post('/profile', async (request, reply) => {
  const authUser = await getAuthUser(request.cookies.userId)

  if (!authUser) {
    return reply.redirect(getMainUrl('/login'))
  }

  return reply.redirect(`${getSiteUrl(authUser.tenant.subdomain)}/edit`)
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
