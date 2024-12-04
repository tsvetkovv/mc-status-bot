import { logger } from '#root/logger.js'
import mc from 'minecraft-protocol'

export interface CommonPingResult {
  maxPlayers: number
  playerCount: number
  motd: string
  protocol: number
  version: string
  latency?: number
  favicon?: string
  players?: { uuid: string, name: string }[]
}

export function toCommonPingResult(result: Awaited<ReturnType<typeof mc.ping>>): CommonPingResult {
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
