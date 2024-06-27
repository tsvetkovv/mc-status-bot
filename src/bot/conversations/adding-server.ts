import type { Conversation } from '@grammyjs/conversations'
import { createConversation } from '@grammyjs/conversations'
import type { Prisma } from '@prisma/client'
import type { Context } from '#root/bot/context.js'
import { i18n } from '#root/bot/i18n.js'
import { prisma } from '#root/prisma/index.js'
import { logger } from '#root/logger.js'
import { addServer } from '#root/minecraft/serverService.js'
import { selectChatKeyboard } from '#root/bot/keyboards/select-chat.js'

export const CONV_ADDING_SERVER = 'adding-server'

export function addingServerConversation() {
  return createConversation(
    async (conversation: Conversation<Context>, ctx: Context) => {
      await conversation.run(i18n)

      await ctx.reply('Give me a server address')

      while (true) {
        const { message } = await conversation.wait()

        const proposedServer = message?.text
        if (ctx.hasCommand('cancel')) {
          return ctx.reply('Cancelled')
        }
        if (proposedServer) {
          ctx.chatAction = 'typing'
          const response = await conversation.external(() => {
            return addServer(proposedServer)
          })

          logger.info(`Response for ${proposedServer} : ${response}`)
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
            const msgServerAdded = `The server ${proposedServer} has been added`
            const msgServerAddedPrivate = await ctx.reply(msgServerAdded, {
              reply_markup: {
                remove_keyboard: true,
              },
            })
            const isGroup = !!message.chat_shared
            if (isGroup) {
              await ctx.reply(JSON.stringify(message.chat_shared))
              chatId = message.chat_shared.chat_id
              messageId = (await ctx.api.sendMessage(chatId, msgServerAdded)).message_id
            }
            else if (message.text === 'Just this chat') {
              // If no chat was shared, use the current chat
              chatId = tgChatId
              messageId = msgServerAddedPrivate.message_id
            }
            await conversation.external(async () => {
              // remove all previous liveMessages in the chat
              const liveMessages = await prisma.liveMessage.findMany({
                where: {
                  chatWatcherTgChatId: tgChatId,
                },
              })
              if (liveMessages.length > 0) {
                await ctx.api.deleteMessages(tgChatId, liveMessages.map(({ tgMessageId }) => tgMessageId))
              }

              const data = {
                tgChatId,
                isGroup,
                liveMessages: {
                  create: {
                    tgMessageId: messageId,
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
                  },
                },
              } satisfies Prisma.ChatWatcherUpdateInput & Prisma.ChatWatcherCreateInput
              await prisma.chatWatcher.upsert({
                where: { tgChatId },
                create: data,
                update: data,
              })
            })

            return
          }
          else {
            await ctx.reply('The server is not responding')
            return
          }
        }
      }
    },
    CONV_ADDING_SERVER,
  )
}
