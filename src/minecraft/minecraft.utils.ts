import {
  subMilliseconds,
} from 'date-fns'
import { logger } from '#root/logger.js'
import { prisma } from '#root/prisma/index.js'
import { pingServer } from '#root/minecraft/pingService.js'

const pingPollingInterval = 5_000

export interface CommonPingResult {
  maxPlayers: number
  playerCount: number
  motd: string
  protocol: number
  version: string
  latency?: number
  favicon?: string
  players?: { uuid: string, name: string } []
}

// Function to track player sessions
async function trackPlayerSessions() {
  const servers = await prisma.server.findMany()

  for (const server of servers) {
    const now = new Date()
    logger.info(`Pinging ${server.address}`, server)
    // Ping the server to get the current online players
    const pingResult = await pingServer(server.address)

    if (pingResult.offline || !pingResult.players) {
      continue
    }
    logger.info(`Ping result ${server.address}. Online: ${pingResult.players.map(p => p.name).join(', ')}`, pingResult)

    // Ensure all online players exist in the database
    const onlinePlayers = await prisma.$transaction(pingResult.players.map(player => prisma.player.upsert({
      select: {
        uuid: true,
        id: true,
      },
      where: { uuid: player.uuid },
      create: {
        uuid: player.uuid,
        name: player.name,
      },
      update: {
        name: player.name,
      },
    })))

    // Update end time for players who are still online
    const lastDateToConsiderOnline = subMilliseconds(now, Math.max(pingPollingInterval * 1.5, 30_000))
    logger.info(`Minimum time to be updated ${lastDateToConsiderOnline.toISOString()}`)
    const usersToUpdateOnline = {
      serverId: server.id,
      endTime: {
        gt: lastDateToConsiderOnline,
      },
      player: {
        uuid: {
          in: onlinePlayers.map(player => player.uuid),
        },
      },
    } as const

    const [usersUpdatedOnline] = await prisma.$transaction([
      prisma.playerSession.findMany({
        select: { player: { select: { uuid: true } } },
        where: usersToUpdateOnline,
      }),
      prisma.playerSession.updateMany({
        where: usersToUpdateOnline,
        data: {
          endTime: now,
        },
      }),
    ])
    logger.info(`Users updated online: ${usersUpdatedOnline.length}`)
    const usersUpdatedOnlineUuid = usersUpdatedOnline.map(u => u.player.uuid)
    const newUsers = onlinePlayers.filter(onlinePlayer => !usersUpdatedOnlineUuid.includes(onlinePlayer.uuid))

    logger.info(`Just joined users: ${newUsers.length}`)

    await prisma.$transaction(
      newUsers.map(newUser => prisma.playerSession.create({
        data: {
          serverId: server.id,
          endTime: now,
          startTime: now,
          playerId: newUser.id,
        },
      })),
    )
  }
}
export function startServerPolling() {
  // Periodically track player sessions
  const scheduleTrackPlayerSessions = async () => {
    const startTime = performance.now()

    await trackPlayerSessions()

    const endTime = performance.now()

    logger.info({ msg: `Server polling completed`, elapsed: endTime - startTime })

    setTimeout(scheduleTrackPlayerSessions, pingPollingInterval)
  }

  scheduleTrackPlayerSessions()
}
