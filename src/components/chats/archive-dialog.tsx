// "Archive this chat?" (#263). One chat: when it has no continuation yet, a second button archives it and starts one
// (the one-click continue of #262). Several chats: a plain confirmation.
import { useEffect, useState } from 'react'
import { ChatCircleText } from '@phosphor-icons/react'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useT } from '@/hooks/use-t'
import { useApp } from '@/lib/store'
import { archiveChats } from '@/lib/archive'
import { continueInNewChat } from '@/lib/continue-chat'
import { fetchLitLinks } from '@/components/library/litopys-api'
import type { ID } from '@/lib/types'

export function ArchiveDialog({ ids, onClose }: { ids: ID[] | null; onClose: () => void }) {
  const t = useT()
  const chats = useApp((s) => s.chats)
  const characters = useApp((s) => s.characters)
  const one = ids && ids.length === 1 ? chats.find((c) => c.id === ids[0]) : undefined
  // does another chat already continue this one? Unknown (no Library, request failed) = no offer
  const [hasNext, setHasNext] = useState<boolean | null>(null)
  useEffect(() => {
    setHasNext(null)
    if (!one) return
    let alive = true
    fetchLitLinks()
      .then((r) => { if (alive) setHasNext(Object.values(r.links ?? {}).some((l) => l.from === one.id)) })
      .catch(() => { if (alive) setHasNext(null) })
    return () => { alive = false }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [one?.id])

  const name = one ? (one.title.trim() || characters.find((c) => c.id === one.characterId)?.name || '') : ''
  const offer = !!one && hasNext === false
  return (
    <AlertDialog open={!!ids} onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{one ? t('chats.archive.title', { name }) : t('chats.archive.titleMany', { n: ids?.length ?? 0 })}</AlertDialogTitle>
          <AlertDialogDescription>{one ? t('chats.archive.desc') : t('chats.archive.descMany')}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('chats.cancel')}</AlertDialogCancel>
          <AlertDialogAction variant={offer ? 'outline' : 'default'} onClick={() => { archiveChats(ids ?? []); onClose() }}>
            {t('chats.archive.confirm')}
          </AlertDialogAction>
          {offer && one && (
            <AlertDialogAction onClick={() => { archiveChats([one.id]); onClose(); void continueInNewChat(one.id) }}>
              <ChatCircleText className="size-4" aria-hidden="true" />{t('chats.archive.confirmContinue')}
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
