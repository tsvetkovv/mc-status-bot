import { Composer } from 'grammy'
import type { Context } from '#root/bot/context.js'
import { logHandle } from '#root/bot/helpers/logging.js'
import { CONV_ADDING_SERVER } from '#root/bot/conversations/index.js'

const composer = new Composer<Context>()

const feature = composer.chatType('private')

feature.command('add_server', logHandle('command-add_server'), (ctx) => {
  return ctx.conversation.enter(CONV_ADDING_SERVER)
})

export { composer as addServerFeature }
