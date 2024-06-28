// server-poller.ts
import type { Context, MiddlewareFn } from 'grammy'
import { prisma } from '#root/prisma/index.js'
import { logger } from '#root/logger.js'
import type { CommonPingResult } from '#root/minecraft/pingService.js'
import { pingServer } from '#root/minecraft/pingService.js'
import type { Bot } from '#root/bot/index.js'
import { startServerPolling } from '#root/minecraft/minecraft.utils.js'

export interface ServerStatus {
  serverId: string
  address: string
  status: OnlineStatus | OfflineStatus
  players: {
    name: string
    lastSeen: Date | null
  }[]
}

interface OnlineStatus {
  online: true
  pingResult: CommonPingResult
}

interface OfflineStatus {
  online: false
}

export interface ServerPollerConfig {
  intervalMs?: number
}

export interface ServerPollerFlavor {
  serverPoller: {
    getStatus: () => Promise<ServerStatus[]>
    start: () => void
    stop: () => void
    enableServer: (serverId: string) => Promise<void>
    disableServer: (serverId: string) => Promise<void>
  }
}

export class ServerPoller {
  private pollingTimeoutId: NodeJS.Timeout | null = null
  private config: ServerPollerConfig
  private bot: Bot

  constructor(bot: Bot, config: ServerPollerConfig = {}) {
    this.config = { intervalMs: 5000, ...config }
    this.bot = bot
    this.start()
    startServerPolling()
  }

  start() {
    if (this.pollingTimeoutId) {
      clearTimeout(this.pollingTimeoutId)
      this.pollingTimeoutId = null
    }

    this.scheduleNextPoll()

    logger.info(`Server polling started with interval of ${this.config.intervalMs}ms`)
  }

  private scheduleNextPoll() {
    this.pollingTimeoutId = setTimeout(async () => {
      const startTime = performance.now()

      try {
        await this.pollServers()
      }
      catch (error) {
        logger.error('Error in server polling:', error)
      }
      finally {
        const endTime = performance.now()
        const executionTime = endTime - startTime

        logger.info(`Chat updating completed in ${executionTime.toFixed(2)} ms`)

        this.scheduleNextPoll() // Schedule the next poll after completion
      }
    }, this.config.intervalMs)
  }

  stop() {
    if (this.pollingTimeoutId) {
      clearInterval(this.pollingTimeoutId)
      this.pollingTimeoutId = null
      logger.info('Server polling stopped')
    }
  }

  async pollServers() {
    const servers = await this.getActiveServers()
    const statuses = await Promise.all(
      servers.map(async (server) => {
        const pingResult = await pingServer(server.address)
        const players = await this.getRecentPlayers(server.id)
        return {
          serverId: server.id,
          address: server.address,
          status: pingResult.offline
            ? { online: false as const }
            : { online: true as const, pingResult },
          players: players.map(p => ({
            name: p.name,
            lastSeen: p.lastSeen,
          })),
        }
      }),
    )
    logger.debug(`Found ${statuses.length} servers`)
    // Send status updates to subscribed chats
    for (const status of statuses) {
      const subscribedChats = await this.getSubscribedChats(status.serverId)
      logger.debug(`Found ${subscribedChats.length} chats to send status update to`)
      for (const liveMsg of subscribedChats) {
        const messageId = liveMsg.tgMessageId
        logger.debug(`Sending status update to chat ${liveMsg.chatWatcherTgChatId} msg ${messageId}`)
        const text = this.formatStatusMessage(status)
        const chatId = liveMsg.chatWatcherTgChatId.toString()
        try {
          await this.bot.api.editMessageText(chatId, messageId, text)
        }
        catch (error) {
          await this.bot.api.deleteMessage(chatId, messageId).catch(e => logger.info(`Error deleting message ${messageId} in chat ${liveMsg.chatWatcherTgChatId}`, e))
          const newMsg = await this.bot.api.sendMessage(chatId, text).catch(async () => {
            // remove the message from the database
            logger.info(`Deleting chat ${liveMsg.chatWatcherTgChatId} and it's messages from chat from DB `)
            await prisma.chatWatcher.delete({
              where: {
                tgChatId: liveMsg.chatWatcherTgChatId,
              },
            })
          })
          if (!newMsg) {
            logger.info(`Error sending message ${text} in chat ${liveMsg.chatWatcherTgChatId}`)
            continue
          }
          await this.bot.api.pinChatMessage(chatId, newMsg.message_id).catch(e => logger.info(`Error pinning message ${newMsg.message_id} in chat ${liveMsg.chatWatcherTgChatId}`, e))
          // add this message to the database
          await prisma.liveMessage.create({
            select: {
              chatWatcherTgChatId: true,
              tgMessageId: true,
            },
            data: {
              serverId: status.serverId,
              tgMessageId: newMsg.message_id,
              addedById: liveMsg.addedById,
              chatWatcherTgChatId: liveMsg.chatWatcherTgChatId,
            },
          })
        }
      }
    }

    logger.info('Completed server polling')
    return statuses
  }

  private async getSubscribedChats(serverId: string) {
    return prisma.liveMessage.findMany({
      where: {
        serverId,
        editable: true,
      },
      select: {
        chatWatcherTgChatId: true,
        tgMessageId: true,
        addedById: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
      distinct: ['chatWatcherTgChatId'],
    })
  }

  private async getRecentPlayers(serverId: string) {
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

    const recentSessions = await prisma.playerSession.findMany({
      where: {
        serverId,
        OR: [
          { endTime: { gte: oneWeekAgo } },
          { endTime: null },
        ],
      },
      orderBy: {
        endTime: 'desc',
      },
      select: {
        player: {
          select: {
            name: true,
          },
        },
        endTime: true,
      },
      distinct: ['playerId'],
    })

    const players = recentSessions.map(session => ({
      name: session.player.name,
      lastSeen: session.endTime,
    }))
    return players
  }

  private formatStatusMessage(status: ServerStatus): string {
    const header = status.status.online
      ? `${status.address} ${status.status.pingResult.players?.length}/${status.status.pingResult.maxPlayers}`
      : `${status.address} Offline`

    const onlinePlayers = status.status.online
      ? status.status.pingResult.players?.map(player => `🟢 ${player.name}`).join('\n') || ''
      : ''

    const offlinePlayers = status.players
      .filter(player => !status.status.online || !status.status.pingResult.players?.some(p => p.name === player.name))
      .sort((a, b) => {
        if (a.lastSeen && b.lastSeen)
          return b.lastSeen.getTime() - a.lastSeen.getTime()
        if (a.lastSeen)
          return -1
        if (b.lastSeen)
          return 1
        return 0
      })
      .map((player) => {
        if (!player.lastSeen)
          return `⚪️ ${player.name}` // Handle null lastSeen

        const timeDiff = Date.now() - player.lastSeen.getTime()
        let timeAgo = 'less than a minute ago'
        if (timeDiff > 60000 && timeDiff < 3600000)
          timeAgo = `${Math.floor(timeDiff / 60000)} minutes ago`
        if (timeDiff >= 3600000)
          timeAgo = `${Math.floor(timeDiff / 3600000)} hours ago`
        return `⚪️ ${player.name} ~ ${timeAgo}`
      })
      .join('\n')

    const playerList = [onlinePlayers, offlinePlayers].filter(Boolean).join('\n')

    // show current time with hours, minutes, seconds
    const currentTime = new Date().toLocaleTimeString('en-US', { hour12: false })
    return `
${header}

${playerList}
    
Updated at ${currentTime}`
  }

  private async getActiveServers() {
    return prisma.server.findMany({
      where: { isPollingEnabled: true },
      select: { id: true, address: true },
    })
  }

  async enableServer(serverId: string) {
    await prisma.server.update({
      where: { id: serverId },
      data: { isPollingEnabled: true },
    })
    logger.info(`Server ${serverId} enabled for polling`)
  }

  async disableServer(serverId: string) {
    await prisma.server.update({
      where: { id: serverId },
      data: { isPollingEnabled: false },
    })
    logger.info(`Server ${serverId} disabled for polling`)
  }

  middleware(): MiddlewareFn<Context & ServerPollerFlavor> {
    return middleware(this)
  }
}

function middleware(serverPoller: ServerPoller): MiddlewareFn<Context & ServerPollerFlavor> {
  return async (ctx, next) => {
    Object.defineProperty(ctx, 'serverPoller', {
      value: {
        getStatus: serverPoller.pollServers.bind(serverPoller),
        start: serverPoller.start.bind(serverPoller),
        stop: serverPoller.stop.bind(serverPoller),
        enableServer: serverPoller.enableServer.bind(serverPoller),
        disableServer: serverPoller.disableServer.bind(serverPoller),
      },
      writable: true,
    })

    await next()
  }
}
