import { Composer } from 'grammy'
import type { Context } from '#root/bot/context.js'
import { logHandle } from '#root/bot/helpers/logging.js'
import { CONV_ADDING_SERVER } from '#root/bot/conversations/index.js'
import { isAdmin } from '#root/bot/filters/index.js'

const composer = new Composer<Context>()

const feature = composer.chatType('private')

feature.command('addserver', logHandle('command-addserver'), (ctx) => {
  return ctx.conversation.enter(CONV_ADDING_SERVER)
})

feature
  .chatType('private')
  .filter(isAdmin)
  .command('listservers', logHandle('command-listservers'), async (ctx) => {
    const allServers = await ctx.prisma.server.findMany({
      orderBy: {
        createdAt: 'desc',
      },
    })
    const msg = allServers
      .map(({ id, address }) => `- ${address} \n /remove_${id}`)
      .join('\n')
    if (!msg) {
      return ctx.reply('No servers found')
    }
    await ctx.reply(msg)
  })
  .command('startpolling', logHandle('command-startpolling'), async (ctx) => {
    await ctx.serverPoller.start()
  })
  .command('stoppolling', async (ctx) => {
    await ctx.reply('Server polling stopped.')
  })

feature.hears(/\/remove_(.+)/, logHandle('command-remove'), async (ctx) => {
  const idToRemove = ctx.match[1]

  if (idToRemove) {
    const server = await ctx.prisma.server.findFirst({
      where: {
        id: idToRemove,
      },
    })
    if (server) {
      await ctx.reply(`Are you sure you want to remove ${server.address}? /confirm_removal_${idToRemove}`)
    }
  }
})
feature.hears(/\/confirm_removal_(.+)/, logHandle('command-remove'), async (ctx) => {
  const idToRemove = ctx.match[1]
  if (idToRemove) {
    const server = await ctx.prisma.server.delete({
      where: {
        id: idToRemove,
      },
    })
    if (server) {
      await ctx.reply(`Successfully removed ${server.address}`)
    }
  }
})

export { composer as addServerFeature }
