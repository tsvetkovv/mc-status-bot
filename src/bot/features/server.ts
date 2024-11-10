import { Composer } from 'grammy'
import type { Context } from '#root/bot/context.js'
import { logHandle } from '#root/bot/helpers/logging.js'
import { isAdmin } from '#root/bot/filters/index.js'
import { CONV_ADDING_SERVER } from '#root/bot/conversations/adding-server.js'
import { CONV_CHANGING_SERVER } from '#root/bot/conversations/change-server.js'

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
  .command('change_server', logHandle('command-change_server'), async (ctx) => {
    const servers = await ctx.prisma.server.findMany({
      select: {
        id: true,
        address: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    })

    if (servers.length === 0) {
      return ctx.reply('No servers found. Add a server first using /addserver command.')
    }

    const serverList = servers
      .map(({ id, address }) => `${address} - /change_${id}`)
      .join('\n')

    await ctx.reply(`Select a server to change:\n\n${serverList}`)
  })

adminFeature.hears(/\/change_(.+)/, logHandle('command-change-server-id'), async (ctx) => {
  const serverId = ctx.match[1]
  ctx.session.currentServerId = serverId
  await ctx.conversation.enter(CONV_CHANGING_SERVER)
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

adminFeature.hears(/\/remove_livemessage_(.+)/, logHandle('command-remove_livemessage_'), async (ctx) => {
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

adminFeature.hears(/\/confirm_remove_livemessage_(.+)/, logHandle('command-confirm_remove_livemessage_'), async (ctx) => {
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
