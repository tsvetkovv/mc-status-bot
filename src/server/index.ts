import type { Bot } from '#root/bot/index.js'
import type { AddressInfo } from 'node:net'
import type { Env } from './environment.js'
import { config } from '#root/config.js'
import { prisma } from '#root/prisma/index.js'
import { requestLogger } from '#root/server/middlewares/request-logger.js'
import { serve } from '@hono/node-server'
import { webhookCallback } from 'grammy'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { getPath } from 'hono/utils/url'
import { logger } from './middlewares/logger.js'
import { requestId } from './middlewares/request-id.js'

export function createServer(bot: Bot) {
  const server = new Hono<Env>()

  server.use(requestId())
  server.use(logger())

  if (config.isDev)
    server.use(requestLogger())

  server.onError(async (error, c) => {
    if (error instanceof HTTPException) {
      if (error.status < 500)
        c.var.logger.info(error)
      else
        c.var.logger.error(error)

      return error.getResponse()
    }

    // unexpected error
    c.var.logger.error({
      err: error,
      method: c.req.raw.method,
      path: getPath(c.req.raw),
    })
    return c.json(
      {
        error: 'Oops! Something went wrong.',
      },
      500,
    )
  })

  server.get('/weird-healthcheck', async (c) => {
    try {
      await prisma.user.findFirst()
      return c.text('ok')
    }
    catch {
      return c.text('error', { status: 500 })
    }
  })

  server.post(
    '/webhook',
    webhookCallback(bot, 'hono', {
      secretToken: config.BOT_WEBHOOK_SECRET,
    }),
  )

  return server
}

export type Server = Awaited<ReturnType<typeof createServer>>

export function createServerManager(server: Server) {
  let handle: undefined | ReturnType<typeof serve>
  return {
    start: (host: string, port: number) =>
      new Promise<AddressInfo>((resolve) => {
        handle = serve(
          {
            fetch: server.fetch,
            hostname: host,
            port,
          },
          info => resolve(info),
        )
      }),
    stop: () =>
      new Promise<void>((resolve) => {
        if (handle)
          handle.close(() => resolve())
        else
          resolve()
      }),
  }
}
