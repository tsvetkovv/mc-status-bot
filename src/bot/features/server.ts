import { Composer, Keyboard } from 'grammy'
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

adminFeature.command('startpolling', logHandle('command-startpolling'), async (ctx) => {
  ctx.serverPoller.start()
})
adminFeature.command('stoppolling', async (ctx) => {
  await ctx.reply('Server polling stopped.')
})
adminFeature.command('choosegroup', logHandle('command-choosegroup'), async (ctx) => {
  const keyboard = new Keyboard().requestChat('Choose a group', 0, {
    bot_is_member: true,
    chat_is_channel: false,
    request_title: true,
    user_administrator_rights: {
      can_pin_messages: true,
      can_edit_messages: true,
      can_delete_messages: true,
      is_anonymous: false,
      can_manage_chat: false,
      can_manage_video_chats: false,
      can_restrict_members: false,
      can_promote_members: false,
      can_change_info: false,
      can_invite_users: false,
      can_post_stories: false,
      can_edit_stories: false,
      can_delete_stories: false,
    },
    bot_administrator_rights: {
      can_pin_messages: true,
      can_edit_messages: true,
      can_delete_messages: true,
      is_anonymous: false,
      can_manage_chat: false,
      can_manage_video_chats: false,
      can_restrict_members: false,
      can_promote_members: false,
      can_change_info: false,
      can_invite_users: false,
      can_post_stories: false,
      can_edit_stories: false,
      can_delete_stories: false,
    },
  }).row().text('Just this chat')
  await ctx.reply('Choose a group', {
    reply_markup: keyboard,
  })
})

feature.on('msg:chat_shared', logHandle('msg:chat_shared'), async (ctx) => {
  await ctx.reply(JSON.stringify(ctx.message.chat_shared), {
    reply_markup: {
      remove_keyboard: true,
    },
  })
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

feature.callbackQuery('gr')

export { composer as addServerFeature }
