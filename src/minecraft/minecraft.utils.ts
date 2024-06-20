import mc from 'minecraft-protocol'

import {
  subMilliseconds,
} from 'date-fns'
import { logger } from '#root/logger.js'
import { prisma } from '#root/prisma/index.js'

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

function toCommonPingResult(result: Awaited<ReturnType<typeof mc.ping>>): CommonPingResult {
  if ('maxPlayers' in result) {
    // It's an OldPingResult
    return {
      maxPlayers: result.maxPlayers,
      playerCount: result.playerCount,
      motd: result.motd,
      protocol: result.protocol,
      version: result.version,
    }
  }
  else {
    // It's a NewPingResult
    return {
      players: result.players.sample?.map(({ name, id }) => ({ name, uuid: id })),
      maxPlayers: result.players.max,
      playerCount: result.players.online,
      motd: typeof result.description === 'string' ? result.description : result.description.text || '',
      protocol: result.version.protocol,
      version: result.version.name,
      latency: result.latency,
      favicon: result.favicon,
    }
  }
}

export async function pingServer(address: string) {
  const [host, rawPort] = address.split(':')

  const port = rawPort && Number.parseInt(rawPort) > 0 ? Number.parseInt(rawPort) : undefined

  try {
    const pingResponse = await mc.ping({
      host,
      port,
      noPongTimeout: 1000,
    })

    return { ...toCommonPingResult(pingResponse), host, port, offline: false } as const
  }
  catch (error) {
    logger.info('Ping failed', address, error)
    return { host, port, offline: true } as const
  }
}

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
    return true
  }

  const pingResponse = await pingServer(address)
  logger.info(`Pinged`, pingResponse)
  if (pingResponse && !pingResponse.offline) {
    try {
      await prisma.server.create({
        data: {
          address,
        },
      })
      return true
    }
    catch (e) {
      return false
    }
  }
  return false
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
        serverId: server.id,
      },
      update: {
        name: player.name,
        serverId: server.id,
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

export async function startServerPolling() {
  // Periodically track player sessions
  setInterval(async () => {
    await trackPlayerSessions() // Assuming server ID 1
  }, pingPollingInterval) // Ping every 10 seconds
}
