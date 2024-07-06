import type { Conversation } from '@grammyjs/conversations'
import { createConversation } from '@grammyjs/conversations'
import type { Prisma } from '@prisma/client'
import type { Context } from '#root/bot/context.js'
import { i18n } from '#root/bot/i18n.js'
import { prisma } from '#root/prisma/index.js'
import { logger } from '#root/logger.js'
import { addServer } from '#root/minecraft/server-service.js'
import { selectChatKeyboard } from '#root/bot/keyboards/select-chat.js'

export const CONV_ADDING_SERVER = 'adding-server'

async function handleAddingServerConversation({ ctx, conversation, proposedServer }: {
  conversation: Conversation<Context>
  ctx: Context
  proposedServer: string
}) {
  ctx.chatAction = 'typing'
  const response = await conversation.external(() => {
    return addServer(proposedServer)
  })

  logger.info({ msg: `Response for ${proposedServer}`, response })
  if (response) {
    const tgChatId = ctx.chatId
    const fromId = ctx.from?.id

    if (!tgChatId) {
      throw new Error('Unknown chatId')
    }
    if (!fromId) {
      throw new Error('Unknown fromId')
    }

    await ctx.reply('Select a chat to push the status to', {
      reply_markup: selectChatKeyboard,
    })

    const { message } = await conversation.waitFor(['message:chat_shared', 'message:text'])
    let chatId: number
    let messageId: number
    const msgServerAdded = `The server <code>${proposedServer}</code> has been added`

    const isGroup = !!message.chat_shared
    if (isGroup) {
      chatId = message.chat_shared.chat_id
      messageId = (await ctx.api.sendMessage(chatId, msgServerAdded)).message_id
    }
    const msgServerAddedPrivate = await ctx.reply(msgServerAdded, {
      reply_markup: {
        remove_keyboard: true,
      },
    })
    if (!isGroup && message.text === 'Just this chat') {
      // If no chat was shared, use the current chat
      chatId = tgChatId
      messageId = msgServerAddedPrivate.message_id
    }
    await conversation.external(async () => {
      // remove all previous liveMessages in the chat
      const liveMessages = await prisma.liveMessage.findMany({
        where: {
          chatWatcherTgChatId: chatId,
        },
      }).catch(err => logger.info({ msg: `Error finding live messages in chat ${chatId}`, err }))
      if (liveMessages?.length) {
        logger.info(`Deleting ${liveMessages.length} messages in chat ${chatId}`)
        await ctx.api.deleteMessages(chatId, liveMessages.map(({ tgMessageId }) => tgMessageId)).catch(e => logger.info(`Error deleting messages in chat ${chatId}`, e))
        await prisma.liveMessage.deleteMany({
          where: {
            chatWatcherTgChatId: chatId,
          },
        }).catch(e => logger.info(`Error deleting live messages from DB for chat ${chatId}`, e))
      }

      await ctx.api.pinChatMessage(chatId, messageId).catch(err => logger.info(`Error pinning message ${messageId} in chat ${chatId}`, err))
      const data = {
        tgMessageId: messageId,
        chatWatcher: {
          connectOrCreate: {
            where: { tgChatId: chatId },
            create: {
              tgChatId: chatId,
              isGroup,
            },
          },
        },
        server: {
          connect: {
            id: response.id,
          },
        },
        addedBy: {
          connectOrCreate: {
            where: {
              telegramId: fromId,
            },
            create: {
              telegramId: fromId,
            },
          },
        },
      } satisfies Prisma.LiveMessageCreateInput

      logger.info(`Creating live message for chat ${chatId}`)
      await prisma.liveMessage.create({
        data,
      }).catch(e => logger.info(`Error creating live message for chat ${chatId}`, e))
    })
  }
  else {
    await ctx.reply('The server is not responding')
  }
}

export function addingServerConversation() {
  return createConversation(
    async (conversation: Conversation<Context>, ctx: Context) => {
      await conversation.run(i18n)

      await ctx.reply('Give me a server address')

      const { message } = await conversation.wait()

      const proposedServer = message?.text
      if (ctx.hasCommand('cancel')) {
        return ctx.reply('Cancelled')
      }
      if (proposedServer) {
        await handleAddingServerConversation({ ctx, conversation, proposedServer }).catch((e) => {
          logger.info({ msg: `Error adding server ${proposedServer}`, err: e })
          ctx.reply(`Error adding server <code>${proposedServer}</code>`, { reply_markup: { remove_keyboard: true } })
        })
      }
    },
    CONV_ADDING_SERVER,
  )
}
