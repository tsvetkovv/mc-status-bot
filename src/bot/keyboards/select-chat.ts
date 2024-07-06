import { Keyboard } from 'grammy'
import type { ChatAdministratorRights } from '@grammyjs/types'

const noOpPermissions = {
  can_change_info: false,
  can_delete_messages: false,
  can_delete_stories: false,
  can_edit_messages: false,
  can_edit_stories: false,
  can_invite_users: false,
  can_manage_chat: false,
  can_manage_topics: false,
  can_manage_video_chats: false,
  can_pin_messages: false,
  can_post_messages: false,
  can_post_stories: false,
  can_promote_members: false,
  can_restrict_members: false,
  is_anonymous: false,
} satisfies ChatAdministratorRights

const requiredGroupPermissions = {
  ...noOpPermissions,
  can_pin_messages: true,
  can_delete_messages: true, // required for deleting system messages about pinning messages
} satisfies ChatAdministratorRights

const requiredChannelPermissions = {
  ...requiredGroupPermissions,
  can_post_messages: true,
  can_manage_chat: true,

  can_change_info: true,
  can_delete_messages: true,
  can_delete_stories: true,
  can_edit_messages: true,
  can_edit_stories: true,
  can_invite_users: true,
  can_manage_topics: true,
  can_manage_video_chats: true,
  can_pin_messages: true,
  can_post_stories: true,
  can_promote_members: true,
  can_restrict_members: true,
  is_anonymous: true,
} satisfies ChatAdministratorRights

export const selectChatKeyboard = new Keyboard()
  .requestChat('Select group', 0, {
    bot_is_member: true,
    chat_is_channel: false,
    user_administrator_rights: requiredGroupPermissions,
    bot_administrator_rights: requiredGroupPermissions,
  })
  .requestChat('Select channel', 1, {
    bot_is_member: true,
    chat_is_channel: true,
    user_administrator_rights: requiredChannelPermissions,
    bot_administrator_rights: requiredChannelPermissions,
  })
  .text('Just this chat')
