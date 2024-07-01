import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const server = 'france.mysh.dev:25566'

  await prisma.server.upsert({
    where: {
      address: server,
    },
    create: {
      address: server,
    },
    update: {
      address: server,
    },
  })
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
  })
