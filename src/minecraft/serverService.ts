import { pingServer } from './pingService.js'
import { logger } from '#root/logger.js'
import { prisma } from '#root/prisma/index.js'

export async function addServer(address: string) {
  logger.info(`Adding server: ${address}`)

  const serverAddedAlready = await prisma.server.findUnique({
    select: {
      id: true,
    },
    where: {
      address,
    },
  })
  if (serverAddedAlready !== null) {
    return serverAddedAlready
  }

  const pingResponse = await pingServer(address)
  logger.info('Pinged', pingResponse)
  if (pingResponse && !pingResponse.offline) {
    try {
      return await prisma.server.create({
        select: {
          id: true,
        },
        data: {
          address,
        },
      })
    }
    catch (e) {
      logger.error('Failed to add server to the database', e)
      return false
    }
  }
  return false
}
