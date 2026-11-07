// Archiving chats (#263): a status on the chat, not a move. The chat file stays where it is, so everything keyed by
// the chat id (Canvas links, Litopys, snapshot books, the backstory chain) keeps working. The engine refuses writes
// to an archived chat (409 "archived"); this is the client side of it.
import { toast } from 'sonner'
import { t } from '@/lib/i18n'
import { useApp } from '@/lib/store'
import type { ID } from '@/lib/types'

import { isArchived } from '@/lib/chat-list'
export { isArchived, suggestArchive } from '@/lib/chat-list'

/** Archive these chats and say so, with an Undo. */
export function archiveChats(ids: ID[]): void {
  const app = useApp.getState()
  const done = ids.filter((id) => app.chats.some((c) => c.id === id && !isArchived(c)))
  if (!done.length) return
  for (const id of done) app.updateChat(id, { archived: true })
  toast.success(done.length === 1 ? t('chats.archived') : t('chats.archivedMany', undefined, { n: done.length }), {
    action: { label: t('canvas.undo'), onClick: () => { for (const id of done) useApp.getState().updateChat(id, { archived: false }) } },
  })
}

/** What a toast says about chats the links route archived (#263). */
export function linkArchivedLine(ids: ID[]): string {
  const app = useApp.getState()
  const names = ids
    .map((id) => {
      const c = app.chats.find((x) => x.id === id)
      return c ? c.title.trim() || app.characters.find((x) => x.id === c.characterId)?.name || '' : ''
    })
    .filter(Boolean)
  return t('chats.archivedAuto', undefined, { name: names.join('”, “') })
}

export function unarchiveChats(ids: ID[]): void {
  for (const id of ids) useApp.getState().updateChat(id, { archived: false })
}

/** The links route moved these chats to the Archive because another chat now continues them: load their new meta and, unless `quiet`
 *  (the caller has a toast of its own, the Canvas), say so with an Undo. An older plugin answers no `archived`: nothing moved. */
export function noteLinkArchived(ids: ID[] | undefined, opts: { quiet?: boolean } = {}): void {
  if (!ids?.length) return
  const line = linkArchivedLine(ids)
  for (const id of ids) void useApp.getState().reloadChat(id)
  if (opts.quiet) return
  toast.success(line, { action: { label: t('canvas.undo'), onClick: () => unarchiveChats(ids) } })
}

export function unarchiveChat(id: ID): void {
  useApp.getState().updateChat(id, { archived: false })
  toast.success(t('chats.unarchived'))
}
