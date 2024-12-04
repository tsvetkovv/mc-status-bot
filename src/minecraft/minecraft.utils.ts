import { logger } from '#root/logger.js'
import { pingServer } from '#root/minecraft/ping-service.js'
import { prisma } from '#root/prisma/index.js'

import { Temporal } from 'temporal-polyfill'

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
  const servers = await prisma.server.findMany({
    where: {
      isPollingEnabled: true,
    },
    select: {
      id: true,
      address: true,
      lastPingDate: true,
    },
  })

  for (const server of servers) {
    const now = new Date()
    logger.debug(`Pinging ${server.address}`, server)
    // Ping the server to get the current online players
    const pingResult = await pingServer(server.address)

    if (pingResult.offline) {
      // if the server is offline more than 7 days, disable polling for it
      const lastPingDate = server.lastPingDate && Temporal.Instant.from(server.lastPingDate.toISOString())
      if (!lastPingDate || lastPingDate.until(Temporal.Now.instant()).days > 7) {
        logger.warn(`Server ${server.address} is offline for more than 7 days, disabling polling`)
        await prisma.server.update({
          where: {
            id: server.id,
          },
          data: {
            isPollingEnabled: false,
          },
        })
      }
      continue // skip the rest of the code if the server is offline
    }
    if (!pingResult.players) {
      continue
    }
    logger.debug(`Ping result ${server.address}. Online: ${pingResult.players.map(p => p.name).join(', ')}`, pingResult)

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
    // if a user is not online for more than 3 minutes, consider them offline
    const lastDateToConsiderOnline = new Date(
      Temporal.Now.instant()
        .subtract({
          milliseconds: Math.max(pingPollingInterval * 1.5, 3 * 60_000),
        })
        .toString(),
    )

    logger.debug(`Minimum time to be updated ${lastDateToConsiderOnline.toISOString()}`)
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
      prisma.server.update({
        where: {
          id: server.id,
        },
        data: {
          lastPingDate: now,
        },
      }),
    ])
    logger.debug(`Users updated online: ${usersUpdatedOnline.length}`)
    const usersUpdatedOnlineUuid = usersUpdatedOnline.map(u => u.player.uuid)
    const newUsers = onlinePlayers.filter(onlinePlayer => !usersUpdatedOnlineUuid.includes(onlinePlayer.uuid))

    logger.debug(`Just joined users: ${newUsers.length}`)

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

    logger.debug({ msg: `Server polling completed`, elapsed: endTime - startTime })

    setTimeout(scheduleTrackPlayerSessions, pingPollingInterval)
  }

  scheduleTrackPlayerSessions()
}
