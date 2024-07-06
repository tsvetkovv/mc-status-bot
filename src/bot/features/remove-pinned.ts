import { Composer } from 'grammy'
import type { Context } from '#root/bot/context.js'
import { logHandle } from '#root/bot/helpers/logging.js'

const composer = new Composer<Context>()

composer.on('message:pinned_message', logHandle('message:pinned_message'), async (ctx) => {
  // check if the bot pinged the message
  if (ctx.msg.pinned_message.from?.id === ctx.me.id) {
    await ctx.api.deleteMessage(ctx.chat.id, ctx.msg.message_id)
  }
})
composer.on('channel_post:pinned_message', logHandle('channel_post:pinned_message'), async (ctx) => {
  // a channel post is authored by the channel itself, so we can't rely on the "from" field.
  // so, we can check if the bot pinned the message by checking the message id in the DB

  const liveMessageTgId = ctx.msg.pinned_message.message_id
  const tgChatId = ctx.msg.pinned_message.chat.id
  // check the server address what linked to this live message
  const serverAddress = await ctx.prisma.liveMessage.findUnique({
    select: {
      id: true,
    },
    where: {
      tgMessageId_chatWatcherTgChatId: {
        tgMessageId: liveMessageTgId,
        chatWatcherTgChatId: tgChatId,
      },
    },
  })

  if (serverAddress) {
    const systemMessageId = ctx.msg.message_id
    await ctx.api.deleteMessage(tgChatId, systemMessageId)
  }
})

export { composer as pinnedFeature }
