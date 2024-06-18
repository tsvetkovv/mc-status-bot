import type { Conversation } from '@grammyjs/conversations'
import { createConversation } from '@grammyjs/conversations'
import type { Prisma } from '@prisma/client'
import type { Context } from '#root/bot/context.js'
import { i18n } from '#root/bot/i18n.js'
import { addServer } from '#root/minecraft/minecraft.utils.js'
import { prisma } from '#root/prisma/index.js'
import { logger } from '#root/logger.js'

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

            const message = await ctx.reply('The server has been added')
            await conversation.external(async () => {
              const data = {
                tgChatId,
                isGroup: !ctx.hasChatType('private'),
                liveMessages: {
                  create: {
                    tgChatId,
                    tgMessageId: message.message_id,
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
