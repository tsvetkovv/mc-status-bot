import mc from 'minecraft-protocol'

import { Prisma } from '@prisma/client'
import { endOfDay, endOfMonth, endOfWeek, startOfDay, startOfMonth, startOfWeek } from 'date-fns'
import { logger } from '#root/logger.js'
import { prisma } from '#root/prisma/index.js'

export interface CommonPingResult {
  maxPlayers: number
  playerCount: number
  motd: string
  protocol: number
  version: string
  latency?: number
  favicon?: string
  players?: { id: string, name: string } []
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
      players: result.players.sample,
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
    logger.info(`Ping result ${server.host}`, pingResult)

    const onlinePlayers = pingResult.players

    await prisma.$transaction(onlinePlayers.map(player => prisma.player.upsert({
      where: { uuid: player.id },
      create: {
        uuid: player.id,
        name: player.name,
        serverId: server.id,
      },
      update: {
        name: player.name,
        serverId: server.id,
      },
    })))

    // Get the last known player sessions for the server
    const lastSessions = await prisma.playerSession.findMany({
      where: {
        serverId: server.id,
        endTime: null,
      },
    })

    const onlinePlayerIds = onlinePlayers.map(player => player.id)
    const lastSessionPlayerIds = lastSessions.map(session => session.playerId)

    // End sessions for players who are no longer online
    const endedSessions = lastSessions.filter(session => !onlinePlayerIds.includes(session.playerId))
    for (const session of endedSessions) {
      await prisma.playerSession.update({
        where: { id: session.id },
        data: { endTime: now },
      })
    }

    // Start new sessions for players who are now online but were not in the last session
    const newPlayerIds = onlinePlayerIds.filter(id => !lastSessionPlayerIds.includes(id))
    for (const playerId of newPlayerIds) {
      await prisma.playerSession.create({
        data: {
          playerId,
          serverId: server.id,
          startTime: now,
        },
      })
    }
  }
}

// Function to calculate playtime
async function calculatePlaytime(periodStart: Date, periodEnd: Date) {
  const sessions = await prisma.playerSession.findMany({
    where: {
      OR: [
        {
          startTime: {
            gte: periodStart,
            lte: periodEnd,
          },
        },
        {
          endTime: {
            gte: periodStart,
            lte: periodEnd,
          },
        },
      ],
    },
  })

  const playtimeMap = new Map<string, number>()

  for (const session of sessions) {
    const start = session.startTime < periodStart ? periodStart : session.startTime
    const end = session.endTime ? (session.endTime > periodEnd ? periodEnd : session.endTime) : periodEnd
    const duration = (end.getTime() - start.getTime()) / 1000 // Convert to seconds

    if (!playtimeMap.has(session.playerId)) {
      playtimeMap.set(session.playerId, 0)
    }
    playtimeMap.set(session.playerId, playtimeMap.get(session.playerId)! + duration)
  }

  for (const [playerId, playtime] of playtimeMap.entries()) {
    // Store playtime data in the relevant table (Daily, Weekly, Monthly)
    await prisma.dailyPlaytime.upsert({
      where: {
        date_playerId_serverId: {
          date: periodStart,
          playerId,
          serverId: '1', // Assuming server ID 1
        },
      },
      update: {
        playtime,
      },
      create: {
        date: periodStart,
        playerId,
        serverId: '1', // Assuming server ID 1
        playtime,
      },
    })
  }
}

// Function to update playtimes
async function updatePlaytimes() {
  const now = new Date()

  // Calculate daily playtime
  await calculatePlaytime(startOfDay(now), endOfDay(now))

  // Calculate weekly playtime
  await calculatePlaytime(startOfWeek(now), endOfWeek(now))

  // Calculate monthly playtime
  await calculatePlaytime(startOfMonth(now), endOfMonth(now))
}

export async function startServerPolling() {
  // Periodically track player sessions
  setInterval(async () => {
    await trackPlayerSessions() // Assuming server ID 1
  }, 5000) // Ping every 10 seconds

  // Periodically update playtimes (e.g., every day at midnight)
  setInterval(async () => {
    await updatePlaytimes()
  }, 24 * 60 * 60 * 1000) // Run every 24 hours
}
