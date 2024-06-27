import { Composer } from 'grammy'
import type { Context } from '#root/bot/context.js'
import { logHandle } from '#root/bot/helpers/logging.js'

const composer = new Composer<Context>()

composer.on('message:pinned_message', logHandle('message:pinned_message'), async (ctx) => {
  // check if the bot pinged the message
  if (ctx.message?.pinned_message?.from?.id === ctx.me?.id) {
    await ctx.api.deleteMessage(ctx.chat.id, ctx.message.message_id)
  }
})

export { composer as pinnedFeature }
