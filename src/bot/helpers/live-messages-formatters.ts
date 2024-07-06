import type { OfflinePlayer, OnlinePlayer, ServerStatus } from '#root/bot/middlewares/server-poller.js'

const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto', localeMatcher: 'best fit', style: 'narrow' })

export function getLiveMessageText(status: ServerStatus): string {
  const header = generateServerHeader(status)
  const playerList = generatePlayerList(status.players)
  const footer = generateFooter()

  return `
${header}

${playerList}

${footer}`
}

export function generateServerHeader(serverStatus: ServerStatus): string {
  const { status, address } = serverStatus

  if (status.online) {
    const playerCount = status.pingResult.players?.length ?? 0
    const maxPlayers = status.pingResult.maxPlayers
    return `<code>${address}</code> <strong>${playerCount}/${maxPlayers}</strong>`
  }
  else {
    return `<code>${address}</code> <strong>Offline</strong>`
  }
}

export function generatePlayerList(players: (OnlinePlayer | OfflinePlayer)[]): string {
  const onlinePlayers = formatOnlinePlayers(players.filter((p): p is OnlinePlayer => p.online))
  const offlinePlayers = formatOfflinePlayers(players.filter((p): p is OfflinePlayer => !p.online))

  return [onlinePlayers, offlinePlayers].filter(Boolean).join('\n')
}

export function formatOnlinePlayers(players: OnlinePlayer[]): string {
  return players
    .sort((a, b) => b.sessionStartTime.getTime() - a.sessionStartTime.getTime())
    .map((player) => {
      const sessionDuration = formatDuration(Date.now() - player.sessionStartTime.getTime())
      return `🟢 ${player.name} ${sessionDuration}`
    })
    .join('\n')
}

export function formatOfflinePlayers(players: OfflinePlayer[]): string {
  return players
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
        return `⚪️ ${player.name}`

      const timeAgo = formatTimeAgo(player.lastSeen)
      return `⚪️ ${player.name} ~ ${timeAgo}`
    })
    .join('\n')
}

export function formatDuration(duration: number): string {
  const hours = Math.floor(duration / 3600000)
  const minutes = Math.floor((duration % 3600000) / 60000)
  if (duration < 60000) {
    return 'just joined'
  }
  else if (hours === 0) {
    return `for ${minutes}m`
  }
  else {
    return `for ${hours}h ${minutes}m`
  }
}

export function formatTimeAgo(date: Date): string {
  const timeDiff = Date.now() - date.getTime()
  const minutes = Math.floor(timeDiff / 60000)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days > 0) {
    return rtf.format(-days, 'day')
  }
  else if (hours > 0) {
    return rtf.format(-hours, 'hour')
  }
  else if (minutes > 0) {
    return rtf.format(-minutes, 'minute')
  }
  else {
    return 'just now'
  }
}

export function generateFooter(): string {
  const currentTime = new Date().toLocaleTimeString('de', { timeZone: 'Europe/Berlin' })
  return `Updated at ${currentTime} (CET)`
}
