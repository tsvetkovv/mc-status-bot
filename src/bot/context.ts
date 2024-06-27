import type { Update, UserFromGetMe } from '@grammyjs/types'
import { type Api, Context as DefaultContext, type SessionFlavor } from 'grammy'
import type { AutoChatActionFlavor } from '@grammyjs/auto-chat-action'
import type { HydrateFlavor } from '@grammyjs/hydrate'
import type { I18nFlavor } from '@grammyjs/i18n'
import type { ParseModeFlavor } from '@grammyjs/parse-mode'
import type { ConversationFlavor } from '@grammyjs/conversations'
import type { Logger } from '#root/logger.js'
import type { PrismaClientX } from '#root/prisma/index.js'
import type { ServerPollerFlavor } from '#root/bot/middlewares/server-poller.js'

export interface SessionData {
  // field?: string;
}

interface ExtendedContextFlavor {
  prisma: PrismaClientX
  logger: Logger
}

export type Context = ParseModeFlavor<
  HydrateFlavor<
    DefaultContext &
    ExtendedContextFlavor &
    SessionFlavor<SessionData> &
    I18nFlavor &
    AutoChatActionFlavor &
    ConversationFlavor &
    ServerPollerFlavor
  >
>

interface Dependencies {
  prisma: PrismaClientX
  logger: Logger
}

export function createContextConstructor({ logger, prisma }: Dependencies) {
  return class extends DefaultContext implements ExtendedContextFlavor {
    prisma: PrismaClientX

    logger: Logger

    constructor(update: Update, api: Api, me: UserFromGetMe) {
      super(update, api, me)

      this.prisma = prisma
      this.logger = logger.child({
        update_id: this.update.update_id,
      })
    }
  } as unknown as new (update: Update, api: Api, me: UserFromGetMe) => Context
}
