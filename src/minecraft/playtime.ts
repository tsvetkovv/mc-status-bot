import { endOfDay, endOfMonth, endOfWeek, startOfDay, startOfMonth, startOfWeek } from 'date-fns'
import { prisma } from '#root/prisma/index.js'

async function calculatePlaytime(serverId: string, periodStart: Date, periodEnd: Date) {
  const sessions = await prisma.playerSession.findMany({
    where: {
      serverId,
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
    await prisma.dailyPlaytime.upsert({
      where: {
        date_playerId_serverId: {
          date: periodStart,
          playerId,
          serverId,
        },
      },
      update: {
        playtime,
      },
      create: {
        date: periodStart,
        playerId,
        serverId,
        playtime,
      },
    })
  }
}

export async function updatePlaytimes() {
  const now = new Date()
  const servers = await prisma.server.findMany()

  for (const server of servers) {
    await calculatePlaytime(server.id, startOfDay(now), endOfDay(now))
    await calculatePlaytime(server.id, startOfWeek(now), endOfWeek(now))
    await calculatePlaytime(server.id, startOfMonth(now), endOfMonth(now))
  }
}
