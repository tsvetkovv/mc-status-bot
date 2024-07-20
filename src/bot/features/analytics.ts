import { Composer } from 'grammy'
import { Temporal } from 'temporal-polyfill'
import type { Player, PlayerSession, Server } from '@prisma/client'
import type { Context } from '#root/bot/context.js'
import { logHandle } from '#root/bot/helpers/logging.js'
import { prisma } from '#root/prisma/index.js'

interface TimeRange {
  label: string
  duration: Temporal.DurationLike
}

interface TopPlayersForTimeRange {
  label: string
  players: PlayerStats[]
}

interface PlayerStats {
  name: string
  totalTime: number
}

interface PlayerTimes {
  [playerId: string]: PlayerStats
}

const composer = new Composer<Context>()

composer.chatType(['private', 'group', 'supergroup'])
  .command('topplayers', logHandle('command-topplayers'), async (ctx) => {
    const server = await getServerForChat(ctx.chat.id)
    if (!server) {
      await ctx.reply('No server found for this chat.')
      return
    }

    const now = Temporal.Now.plainDateTimeISO()
    const topPlayers = await getTopPlayersForTimeRanges(server.id, now)

    const message = formatTopPlayersMessage(server.address, topPlayers)
    await ctx.reply(message)
  })

async function getServerForChat(chatId: number): Promise<Server | null> {
  const liveMessage = await prisma.liveMessage.findFirst({
    where: { chatWatcherTgChatId: BigInt(chatId) },
    include: { server: true },
  })
  return liveMessage?.server ?? null
}

async function getTopPlayersForTimeRanges(serverId: string, now: Temporal.PlainDateTime): Promise<TopPlayersForTimeRange[]> {
  const timeRanges: TimeRange[] = [
    { label: 'Last 24 hours', duration: { hours: 24 } },
    { label: 'Last 7 days', duration: { days: 7 } },
    { label: 'Last 30 days', duration: { days: 30 } },
  ]

  const topPlayers = await Promise.all(
    timeRanges.map(async range => ({
      label: range.label,
      players: await getTopPlayers(serverId, now.subtract(range.duration), now),
    })),
  )

  return topPlayers
}

async function getTopPlayers(serverId: string, startDate: Temporal.PlainDateTime, endDate: Temporal.PlainDateTime): Promise<PlayerStats[]> {
  const playerSessions = await prisma.playerSession.findMany({
    where: {
      serverId,
      startTime: { gte: startDate.toZonedDateTime('UTC').toInstant().toString() },
      endTime: { lte: endDate.toZonedDateTime('UTC').toInstant().toString() },
    },
    include: { player: true },
  })

  const playerTimes = aggregatePlayerTimes(playerSessions)
  return sortAndLimitPlayers(playerTimes, 20)
}

function aggregatePlayerTimes(playerSessions: (PlayerSession & { player: Player })[]): PlayerTimes {
  return playerSessions.reduce((acc, session) => {
    const playerId = session.playerId
    const duration = calculateSessionDuration(session)

    if (!acc[playerId]) {
      acc[playerId] = { name: session.player.name, totalTime: 0 }
    }
    acc[playerId].totalTime += duration

    return acc
  }, {} as PlayerTimes)
}

function calculateSessionDuration(session: PlayerSession): number {
  if (!session.endTime)
    return 0
  const start = Temporal.Instant.from(session.startTime.toISOString())
  const end = Temporal.Instant.from(session.endTime.toISOString())
  return end.since(start, { largestUnit: 'minutes' }).minutes
}

function sortAndLimitPlayers(playerTimes: PlayerTimes, limit: number): PlayerStats[] {
  return Object.values(playerTimes)
    .sort((a, b) => b.totalTime - a.totalTime)
    .slice(0, limit)
}

function formatTopPlayersMessage(serverAddress: string, topPlayers: TopPlayersForTimeRange[]): string {
  let message = `Top players for <code>${serverAddress}</code>:\n\n`
  topPlayers.forEach(({ label, players }) => {
    message += `${label}:\n${formatPlayerList(players)}\n\n`
  })
  return message.trim()
}

function formatPlayerList(players: PlayerStats[]): string {
  return players
    .map((player, index) => {
      const days = Math.floor(player.totalTime / (24 * 60))
      const hours = Math.floor((player.totalTime % (24 * 60)) / 60)
      const minutes = Math.round(player.totalTime % 60)

      let timeString = ''
      if (days > 0)
        timeString += `${days}d `
      if (hours > 0 || days > 0)
        timeString += `${hours}h `
      timeString += `${minutes}m`

      return `${index + 1}. ${player.name} ~ ${timeString}`
    })
    .join('\n')
}

export { composer as analyticsFeature }
