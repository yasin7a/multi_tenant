import Fastify from 'fastify'
import cookie from '@fastify/cookie'
import bcrypt from 'bcryptjs'
import { prisma } from './lib/prisma.js'

const app = Fastify({ logger: true })

await app.register(cookie)

function setAuthCookie(reply, userId) {
  reply.setCookie('userId', userId, {
    path: '/',
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 7, // 7 days
  })
}

const ROOT_DOMAIN = process.env.ROOT_DOMAIN || 'lvh.me'

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

async function publicSiteHandler(request, reply) {
  const subdomain = getSubdomain(request)

  if (!subdomain) {
    return reply.code(400).send({ error: 'visit a tenant subdomain to view their site' })
  }

  const user = await getPublicProfile(subdomain)

  if (!user) {
    return reply.code(404).send({ error: 'site not found' })
  }

  return {
    username: user.username,
    tenantId: user.tenantId,
    tenant: user.tenant,
  }
}

app.get('/', async (request, reply) => {
  const subdomain = getSubdomain(request)

  if (subdomain) {
    return publicSiteHandler(request, reply)
  }

  return { message: 'server is ok' }
})

app.get('/site', publicSiteHandler)

app.post('/register', async (request, reply) => {
  const { username, email, password } = request.body

  if (!username || !email || !password) {
    return reply.code(400).send({ error: 'username, email, and password are required' })
  }

  const existing = await prisma.user.findFirst({
    where: { OR: [{ username }, { email }] },
  })

  if (existing) {
    return reply.code(409).send({ error: 'username or email already exists' })
  }

  const subdomain = username.toLowerCase()

  const existingTenant = await prisma.tenant.findUnique({ where: { subdomain } })

  if (existingTenant) {
    return reply.code(409).send({ error: 'subdomain already taken' })
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
  return reply.code(201).send({ isLoggedIn: true, userId: user.id })
})

app.post('/login', async (request, reply) => {
  const { email, password } = request.body

  if (!email || !password) {
    return reply.code(400).send({ error: 'email and password are required' })
  }

  const user = await prisma.user.findUnique({ where: { email } })

  if (!user) {
    return reply.code(401).send({ error: 'invalid credentials' })
  }

  const valid = await bcrypt.compare(password, user.password)

  if (!valid) {
    return reply.code(401).send({ error: 'invalid credentials' })
  }

  setAuthCookie(reply, user.id)
  return { isLoggedIn: true, userId: user.id }
})

app.get('/profile', async (request, reply) => {
  const userId = request.cookies.userId

  if (!userId) {
    return reply.code(401).send({ error: 'not authenticated' })
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      email: true,
      tenantId: true,
      tenant: { select: { id: true, name: true, subdomain: true } },
    },
  })

  if (!user) {
    return reply.code(401).send({ error: 'not authenticated' })
  }

  return {
    isLoggedIn: true,
    userId: user.id,
    username: user.username,
    email: user.email,
    tenantId: user.tenantId,
    tenant: user.tenant,
  }
})

const start = async () => {
  try {
    await app.listen({ port: 3000, host: '0.0.0.0' })
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

start()
