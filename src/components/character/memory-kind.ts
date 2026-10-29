import type { MsgKey } from '@/lib/i18n'
import type { MemoryKind } from './memory-api'

/** The strings that read differently for a card, a persona and a saved world. Everything else in the
 *  Memory panel, the story lines and the import dialog is shared, so the card's own wording stays as it was. */
export interface MemoryText {
  intro: MsgKey
  emptyText: MsgKey
  removeText: MsgKey
  injectTitle: MsgKey
  injectSwitch: MsgKey
  injectHint: MsgKey
  injectOff: MsgKey
  dlgPick: MsgKey
  dlgNoChats: MsgKey
  dlgAfter: MsgKey
  sumHint: MsgKey
}

export const MEMORY_TEXT: Record<MemoryKind, MemoryText> = {
  card: {
    intro: 'mem.intro',
    emptyText: 'mem.empty.text',
    removeText: 'mem.remove.text',
    injectTitle: 'mem.inject',
    injectSwitch: 'mem.inject.switch',
    injectHint: 'mem.inject.hint',
    injectOff: 'mem.inject.off',
    dlgPick: 'mem.dlg.pick',
    dlgNoChats: 'mem.dlg.noChats',
    dlgAfter: 'mem.dlg.after',
    sumHint: 'mem.dlg.sumHint',
  },
  persona: {
    intro: 'memp.intro',
    emptyText: 'memp.empty.text',
    removeText: 'memp.remove.text',
    injectTitle: 'memx.inject',
    injectSwitch: 'memp.inject.switch',
    injectHint: 'memp.inject.hint',
    injectOff: 'memp.inject.off',
    dlgPick: 'memp.dlg.pick',
    dlgNoChats: 'memp.dlg.noChats',
    dlgAfter: 'memx.dlg.after',
    sumHint: 'memx.dlg.sumHint',
  },
  world: {
    intro: 'memw.intro',
    emptyText: 'memw.empty.text',
    removeText: 'memw.remove.text',
    injectTitle: 'memx.inject',
    injectSwitch: 'memw.inject.switch',
    injectHint: 'memw.inject.hint',
    injectOff: 'memw.inject.off',
    dlgPick: 'memw.dlg.pick',
    dlgNoChats: 'memw.dlg.noChats',
    dlgAfter: 'memx.dlg.after',
    sumHint: 'memx.dlg.sumHint',
  },
}
