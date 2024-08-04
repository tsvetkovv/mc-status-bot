#!/usr/bin/env tsx

import process from 'node:process'
import { PrismaAdapter } from '@grammyjs/storage-prisma'
import { prisma } from './prisma/index.js'
import { createBot } from '#root/bot/index.js'
import { config } from '#root/config.js'
import { logger } from '#root/logger.js'
import { createServer, createServerManager } from '#root/server/index.js'

function onShutdown(cleanUp: () => Promise<void>) {
  let isShuttingDown = false
  const handleShutdown = async () => {
    if (isShuttingDown)
      return
    isShuttingDown = true
    logger.info('Shutdown')
    await cleanUp()
  }
  process.on('SIGINT', handleShutdown)
  process.on('SIGTERM', handleShutdown)
}

async function startPolling() {
  const bot = createBot(config.BOT_TOKEN, {
    prisma,
    sessionStorage: new PrismaAdapter(prisma.session),
  })

  // graceful shutdown
  onShutdown(async () => {
    await bot.stop()
  })

  // connect to database
  await prisma.$connect()

  // start bot
  await bot.start({
    allowed_updates: config.BOT_ALLOWED_UPDATES,
    onStart: async ({ username }) => {
      logger.info({
        msg: 'Bot running...',
        username,
      })

      for (const adminId of config.BOT_ADMINS) {
        try {
          await bot.api.sendMessage(adminId, 'I am up!')
        }
        catch (error) {
          console.error(`Failed to send startup message to admin ${adminId}:`, error)
        }
      }
    },
  })
}

async function startWebhook() {
  const bot = createBot(config.BOT_TOKEN, {
    prisma,
    sessionStorage: new PrismaAdapter(prisma.session),
  })
  const server = createServer(bot)
  const serverManager = createServerManager(server)

  // graceful shutdown
  onShutdown(async () => {
    await serverManager.stop()
  })

  // connect to database
  await prisma.$connect()

  // to prevent receiving updates before the bot is ready
  await bot.init()

  // start server
  const info = await serverManager.start(
    config.BOT_SERVER_HOST,
    config.BOT_SERVER_PORT,
  )
  logger.info({
    msg: 'Server started',
    url:
      info.family === 'IPv6'
        ? `http://[${info.address}]:${info.port}`
        : `http://${info.address}:${info.port}`,
  })

  // set webhook
  await bot.api.setWebhook(config.BOT_WEBHOOK, {
    allowed_updates: config.BOT_ALLOWED_UPDATES,
    secret_token: config.BOT_WEBHOOK_SECRET,
    drop_pending_updates: true,
    max_connections: 1,
  })
  logger.info({
    msg: 'Webhook was set',
    url: config.BOT_WEBHOOK,
  })
}

// startServerPolling()

try {
  if (config.BOT_MODE === 'webhook')
    await startWebhook()
  else if (config.BOT_MODE === 'polling')
    await startPolling()
}
catch (error) {
  logger.error(error)
  process.exit(1)
}
