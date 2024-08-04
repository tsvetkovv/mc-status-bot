import type { Conversation } from '@grammyjs/conversations'
import { createConversation } from '@grammyjs/conversations'
import type { Context } from '#root/bot/context.js'
import { i18n } from '#root/bot/i18n.js'
import { logger } from '#root/logger.js'
import { prisma } from '#root/prisma/index.js'
import { pingServer } from '#root/minecraft/ping-service.js'

export const CONV_CHANGING_SERVER = 'changing-server'

async function handleChangingServerConversation(conversation: Conversation<Context>, ctx: Context) {
  const serverId = ctx.session.currentServerId

  if (!serverId) {
    await ctx.reply('No server selected. Please use the /change_server command to select a server.')
    return
  }

  ctx.chatAction = 'typing'

  const server = await conversation.external(() =>
    ctx.prisma.server.findUnique({
      where: { id: serverId },
    }),
  )

  if (!server) {
    await ctx.reply('Server not found.')
    return
  }

  await ctx.reply(`Current server address: ${server.address}\nEnter the new address for the server:`)

  const { message } = await conversation.wait()
  const newAddress = message?.text

  if (!newAddress) {
    await ctx.reply('Invalid address. Operation cancelled.')
    return
  }

  // Ping check
  const pingResult = await conversation.external(() => pingServer(newAddress))

  if (pingResult.offline) {
    await ctx.reply('The new server address is not reachable. Please check the address and try again.')
    return
  }

  try {
    const updatedServer = await conversation.external(async () =>
      await prisma.server.update({
        where: { id: serverId },
        data: { address: newAddress },
      }),
    )

    await ctx.reply(`Server address updated successfully.\nNew address: ${updatedServer.address}`)
  }
  catch (error) {
    await ctx.reply('An error occurred while updating the server address. Please try again later.')
    logger.error('Error updating server address', error)
  }

  // Clear the currentServerId from the session after we're done
  ctx.session.currentServerId = undefined
}

export function changingServerConversation() {
  return createConversation<Context>(
    async (conversation, ctx) => {
      await conversation.run(i18n)
      await handleChangingServerConversation(conversation, ctx).catch((e) => {
        logger.info({ msg: `Error changing server ${ctx.session.currentServerId}`, err: e })
        ctx.reply(`Error changing server address`, { parse_mode: 'HTML' })
      })
    },
    CONV_CHANGING_SERVER,
  )
}
