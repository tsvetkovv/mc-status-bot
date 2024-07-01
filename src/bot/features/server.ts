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

const adminFeature = feature
  .chatType('private')
  .filter(isAdmin)

adminFeature
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

adminFeature
  .command('livemessages', logHandle('command-livemessages'), async (ctx) => {
    const allLiveMessages = await ctx.prisma.liveMessage.findMany({
      select: {
        chatWatcherTgChatId: true,
        tgMessageId: true,
        id: true,
      },
    })

    const msg = allLiveMessages
      .map(({ chatWatcherTgChatId, tgMessageId, id }) => `- chat: ${chatWatcherTgChatId} msg: ${tgMessageId} \n /remove_livemessage_${id}`)
      .join('\n')
    if (!msg) {
      return ctx.reply('No messages found')
    }
    await ctx.reply(msg)
  })

adminFeature.command('startpolling', logHandle('command-startpolling'), async (ctx) => {
  ctx.serverPoller.start()
})
adminFeature.command('stoppolling', async (ctx) => {
  await ctx.reply('Server polling stopped.')
})

feature.hears(/\/remove_livemessage_(.+)/, logHandle('command-remove_livemessage_'), async (ctx) => {
  const idToRemove = ctx.match[1]

  if (idToRemove) {
    const msg = await ctx.prisma.liveMessage.findFirst({
      where: {
        id: idToRemove,
      },
    })
    if (msg) {
      await ctx.reply(`Are you sure you want to remove live message ${msg.tgMessageId} in chat ${msg.chatWatcherTgChatId}? /confirm_remove_livemessage_${idToRemove}`)
    }
  }
})
feature.hears(/\/confirm_remove_livemessage_(.+)/, logHandle('command-confirm_remove_livemessage_'), async (ctx) => {
  const idToRemove = ctx.match[1]
  if (idToRemove) {
    const liveMessage = await ctx.prisma.liveMessage.delete({
      where: {
        id: idToRemove,
      },
    })
    if (liveMessage) {
      await ctx.reply(`Successfully removed `)
    }
  }
})

export { composer as addServerFeature }
