import type { MsgKey } from '@/lib/i18n'

export type MessageActionId =
  | 'copy'
  | 'translate'
  | 'speak'
  | 'bookmark'
  | 'fork'
  | 'genData'
  | 'peek'
  | 'hide'
  | 'summarize'
  | 'undoSummary'
  | 'moveUp'
  | 'moveDown'
  | 'delete'
  | 'deleteBelow'

export type MessageActionGroupId = 'message' | 'story' | 'delete'

export interface MessageActionCtx {
  isUser: boolean
  index: number
  count: number
  isCutoff: boolean
  compactions: number
  hidden: boolean
  bookmarked: boolean
  translated: boolean
  translating: boolean
  speaking: boolean
}

export interface MessageActionItem {
  id: MessageActionId
  labelKey: MsgKey
  danger?: boolean
  disabled?: boolean
}

export interface MessageActionGroup {
  id: MessageActionGroupId
  labelKey: MsgKey
  items: MessageActionItem[]
}

export function messageActions(ctx: MessageActionCtx): MessageActionGroup[] {
  const message: MessageActionGroup = {
    id: 'message',
    labelKey: 'msg.grp.message',
    items: [
      { id: 'copy', labelKey: 'msg.act.copy' },
      ctx.translating
        ? { id: 'translate', labelKey: 'msg.act.translating', disabled: true }
        : ctx.translated
          ? { id: 'translate', labelKey: 'msg.act.untranslate' }
          : { id: 'translate', labelKey: 'msg.act.translate' },
      ctx.speaking
        ? { id: 'speak', labelKey: 'msg.act.stopSpeak' }
        : { id: 'speak', labelKey: 'msg.act.speak' },
      ctx.bookmarked
        ? { id: 'bookmark', labelKey: 'msg.act.unbookmark' }
        : { id: 'bookmark', labelKey: 'msg.act.bookmark' },
      { id: 'fork', labelKey: 'msg.act.fork' },
      { id: 'genData', labelKey: 'msg.act.genData' },
      { id: 'peek', labelKey: 'msg.act.peek' },
    ],
  }

  const storyItems: MessageActionItem[] = [
    ctx.hidden
      ? { id: 'hide', labelKey: 'msg.act.unhide' }
      : { id: 'hide', labelKey: 'msg.act.hide' },
  ]

  if (ctx.isCutoff && ctx.compactions > 0) {
    storyItems.push({ id: 'undoSummary', labelKey: 'msg.act.undoSummary' })
  } else if (!ctx.isCutoff && ctx.index > 0) {
    storyItems.push({ id: 'summarize', labelKey: 'msg.act.summarize' })
  }

  if (ctx.index > 0) {
    storyItems.push({ id: 'moveUp', labelKey: 'msg.act.moveUp' })
  }
  if (ctx.index < ctx.count - 1) {
    storyItems.push({ id: 'moveDown', labelKey: 'msg.act.moveDown' })
  }

  const story: MessageActionGroup = {
    id: 'story',
    labelKey: 'msg.grp.story',
    items: storyItems,
  }

  const deleteItems: MessageActionItem[] = [
    { id: 'delete', labelKey: 'msg.act.delete', danger: true },
  ]
  if (ctx.index < ctx.count - 1) {
    deleteItems.push({
      id: 'deleteBelow',
      labelKey: 'msg.act.deleteBelow',
      danger: true,
    })
  }

  const deleteGroup: MessageActionGroup = {
    id: 'delete',
    labelKey: 'msg.grp.delete',
    items: deleteItems,
  }

  return [message, story, deleteGroup].filter(
    (group): group is MessageActionGroup => group.items.length > 0,
  )
}
