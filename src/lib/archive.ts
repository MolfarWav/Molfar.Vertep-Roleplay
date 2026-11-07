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

/** `fromId` just became the earlier chat of another one: archive it, unless the user switched that off in the memory settings, it is already
 *  archived, gone, or still answering. A toast with Undo says so. Failures are silent: a missing Library only means no archiving. */
export async function archiveAfterLink(fromId: ID): Promise<void> {
  try {
    const { fetchLitConfig } = await import('@/components/library/litopys-api')
    const cfg = await fetchLitConfig()
    if (cfg.archiveOnContinue === false) return
  } catch { return }
  const app = useApp.getState()
  const chat = app.chats.find((c) => c.id === fromId)
  if (!chat || isArchived(chat) || app.streaming?.chatId === fromId) return
  app.updateChat(fromId, { archived: true })
  const name = chat.title.trim() || app.characters.find((c) => c.id === chat.characterId)?.name || ''
  toast.success(t('chats.archivedAuto', undefined, { name }), {
    action: { label: t('canvas.undo'), onClick: () => { useApp.getState().updateChat(fromId, { archived: false }) } },
  })
}

export function unarchiveChat(id: ID): void {
  useApp.getState().updateChat(id, { archived: false })
  toast.success(t('chats.unarchived'))
}
