import type { Context } from '#root/bot/context.js'
import type { Conversation } from '@grammyjs/conversations'
import type { Prisma } from '@prisma/client'
import { isAdmin } from '#root/bot/filters/index.js'
import { i18n } from '#root/bot/i18n.js'
import { selectChatKeyboard } from '#root/bot/keyboards/select-chat.js'
import { logger } from '#root/logger.js'
import { addServer } from '#root/minecraft/server-service.js'
import { prisma } from '#root/prisma/index.js'
import { createConversation } from '@grammyjs/conversations'

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
  if (!response) {
    await ctx.reply('The server is not responding')
    return
  }

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
  let chatId: number | undefined
  let messageId: number | undefined
  const initMessage = `Gathering info about <code>${proposedServer}</code>...`

  const isGroup = !!message.chat_shared
  if (isGroup) {
    chatId = message.chat_shared.chat_id
    messageId = (await ctx.api.sendMessage(chatId, initMessage)).message_id
    await ctx.reply(`The server <code>${proposedServer}</code> has been added`, {
      reply_markup: {
        remove_keyboard: true,
      },
    })
  }
  else if (!isGroup && message.text === 'Just this chat') {
    const msgServerAddedPrivate = await ctx.reply(initMessage, {
      reply_markup: {
        remove_keyboard: true,
      },
    })
    // If no chat was shared, use the current chat
    chatId = tgChatId
    messageId = msgServerAddedPrivate.message_id
  }
  else if (isAdmin(ctx)) {
    // admin sends tgChatId, parse it, check if it exists in DB and use chatId and messageId from there
    const tgChatIdFromAdmin = message.text
    if (!tgChatIdFromAdmin) {
      return
    }
    const parsedChatId = Number.parseInt(tgChatIdFromAdmin)
    if (Number.isNaN(parsedChatId)) {
      return
    }
    const chat = await conversation.external(async () => {
      return prisma.chatWatcher.findFirst({
        select: {
          liveMessages: {
            select: {
              tgMessageId: true,
            },
            take: 1,
          },
        },
        where: {
          tgChatId: parsedChatId,
        },
      })
    })

    const messageIdFromDB = chat?.liveMessages.at(0)?.tgMessageId

    if (messageIdFromDB) {
      chatId = parsedChatId
      messageId = messageIdFromDB
      await ctx.reply(`The server <code>${proposedServer}</code> has been added`, {
        reply_markup: {
          remove_keyboard: true,
        },
      })
    }
  }

  if (messageId === undefined || chatId === undefined) {
    return
  }

  await conversation.external(async () => {
    // remove all previous liveMessages in the chat
    const liveMessages = await prisma.liveMessage.findMany({
      where: {
        chatWatcherTgChatId: chatId,
      },
      orderBy: {
        createdAt: 'desc',
      },
    }).catch(err => logger.info({ msg: `Error finding live messages in chat ${chatId}`, err }))
    if (liveMessages?.length && liveMessages.length > 1) {
      const [latestMessage, ...oldMessages] = liveMessages
      logger.info(`Deleting ${oldMessages.length} old messages in chat ${chatId}`)
      await ctx.api.deleteMessages(chatId, oldMessages.map(({ tgMessageId }) => tgMessageId))
        .catch(e => logger.info(`Error deleting messages in chat ${chatId}`, e))

      await prisma.liveMessage.deleteMany({
        where: {
          chatWatcherTgChatId: chatId,
          createdAt: {
            lt: latestMessage.createdAt,
          },
        },
      }).catch(e => logger.info(`Error deleting old live messages from DB for chat ${chatId}`, e))
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

    const existingMessage = await prisma.liveMessage.findFirst({
      where: {
        chatWatcherTgChatId: chatId,
      },
    })

    if (existingMessage === null) {
      await prisma.liveMessage.create({
        data,
      }).catch(e => logger.info(`Error creating live message for chat ${chatId}`, e))
    }
    else {
      logger.info(`Creating live message for chat ${chatId}`)
      await prisma.liveMessage.upsert({
        where: {
          id: existingMessage.id,
        },
        create: data,
        update: data,
      }).catch(e => logger.info(`Error creating live message for chat ${chatId}`, e))
    }
  })
}

export function addingServerConversation() {
  return createConversation(
    async (conversation: Conversation<Context>, ctx: Context) => {
      await conversation.run(i18n)

      await ctx.reply('Give me a server address or /cancel')

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
