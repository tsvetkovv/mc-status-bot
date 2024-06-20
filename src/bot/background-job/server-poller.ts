import { prisma } from '#root/prisma/index.js'
import { logger } from '#root/logger.js'
import type { CommonPingResult } from '#root/minecraft/pingService.js'
import { pingServer } from '#root/minecraft/pingService.js'

export interface ServerStatus {
  serverId: string
  address: string
  pingResult: CommonPingResult | { offline: true }
}

export class ServerPoller {
  private pollingInterval: NodeJS.Timeout | null = null

  async start(intervalMs: number = 60000) {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval)
    }

    this.pollingInterval = setInterval(async () => {
      try {
        await this.pollServers()
      }
      catch (error) {
        logger.error('Error in server polling:', error)
      }
    }, intervalMs)

    logger.info(`Server polling started with interval of ${intervalMs}ms`)
  }

  stop() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval)
      this.pollingInterval = null
      logger.info('Server polling stopped')
    }
  }

  async pollServers(): Promise<ServerStatus[]> {
    const servers = await this.getActiveServers()
    const statuses = await Promise.all(
      servers.map(async server => ({
        serverId: server.id,
        address: server.address,
        pingResult: await pingServer(server.address),
      })),
    )
    logger.info('Completed server polling')
    return statuses
  }

  private async getActiveServers() {
    return prisma.server.findMany({
      select: { id: true, address: true },
    })
  }
}
