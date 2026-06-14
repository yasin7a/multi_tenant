import 'dotenv/config'
import { prisma } from '../lib/prisma.js'

async function main() {
  console.log('No seed data configured')
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
