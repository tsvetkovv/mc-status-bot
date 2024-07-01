import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const server = {
    host: 'france.mysh.dev',
    port: 25566,
  }

  await prisma.server.upsert({
    where: {
      host_port: {
        host: server.host,
        port: server.port,
      },
    },
    create: server,
    update: server,
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
