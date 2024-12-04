import type { Context } from '#root/bot/context.js'
import { logHandle } from '#root/bot/helpers/logging.js'
import { Composer } from 'grammy'

const composer = new Composer<Context>()

const feature = composer.chatType('private')

feature.command('cancel', logHandle('cancel-command'), async (ctx) => {
  await ctx.conversation.exit()
  await ctx.reply('Cancel current conversation')
})

export { composer as cancelConversationFeature }
