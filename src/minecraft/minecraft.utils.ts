import mc from 'minecraft-protocol'

import { Prisma } from '@prisma/client'
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

export async function pingServer(params: { host: string, port?: number }) {
  const { host, port } = params

  try {
    const pingResponse = await mc.ping({
      host,
      port,
      noPongTimeout: 1000,
    })

    return { ...toCommonPingResult(pingResponse), host, port, offline: false } as const
  }
  catch (error) {
    logger.info('Ping failed', params, error)
    return { host, port, offline: true } as const
  }
}

export async function addServer(url: string) {
  logger.info(`Adding server ${url}`)
  const parts = url.split(':')
  const host = parts.at(0)
  if (!host) {
    throw new Error('Incorrect host')
  }

  const port = Number.parseInt(parts.at(1) || '0')
  const pingResponse = await pingServer({ host, port })
  logger.info(`Pinged`, pingResponse)
  if (pingResponse) {
    try {
      await prisma.server.create({
        data: {
          host,
          port: port || 0,
        },
      })
      return true
    }
    catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        if (e.code === 'P2002') {
          throw new Error('Server is already exist')
        }
      }
      throw e
    }
  }
  throw new Error('The server is not available')
}

// Function to track player sessions
async function trackPlayerSessions() {
  const servers = await prisma.server.findMany()

  for (const server of servers) {
    const now = new Date()
    logger.info(`Pinging ${server.host}`, server)
    // Ping the server to get the current online players
    const pingResult = await pingServer({ host: server.host, port: server.port })

    if (pingResult.offline || !pingResult.players) {
      continue
    }
    logger.info(`Ping result ${server.host}. Online: ${pingResult.players.map(p => p.name).join(', ')}`, pingResult)

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
