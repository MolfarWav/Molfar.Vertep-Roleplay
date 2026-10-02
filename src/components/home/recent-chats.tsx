import { useMemo, useState } from 'react'
import { Trash } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useApp } from '@/lib/store'
import { useRelativeTime, useT } from '@/hooks/use-t'
import { cleanPreview } from '@/lib/preview'
import { NO_FILTER, filterChats, isFiltering, type ChatFilter } from '@/lib/chat-filters'
import { DEFAULT_AVATAR, cn } from '@/lib/utils'
import { ChatFilters } from '@/components/chat/chat-filters'
import { BlockLabel, Chip } from '@/components/home/home-ui'

const SHOWN = 8

/** The latest chats, each with its player persona; filter by persona and
 *  character, delete one, or select several and delete them together. */
export function RecentChats() {
  const t = useT()
  const when = useRelativeTime()
  const chats = useApp((s) => s.chats)
  const characters = useApp((s) => s.characters)
  const personas = useApp((s) => s.personas)
  const generatingId = useApp((s) => s.streaming?.chatId ?? null)
  const openChat = useApp((s) => s.openChat)
  const deleteChat = useApp((s) => s.deleteChat)
  const setView = useApp((s) => s.setView)

  const [filter, setFilter] = useState<ChatFilter>(NO_FILTER)
  const [showAll, setShowAll] = useState(false)
  const [selecting, setSelecting] = useState(false)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [confirm, setConfirm] = useState<string[] | null>(null)

  const filtered = useMemo(
    () => filterChats([...chats].sort((a, b) => b.updatedAt - a.updatedAt), characters, filter),
    [chats, characters, filter],
  )
  // what is on screen is what "select all" selects: nothing out of sight gets deleted
  const shown = showAll ? filtered : filtered.slice(0, SHOWN)
  // ids that no longer exist (deleted elsewhere) drop out of the selection
  const live = shown.filter((c) => picked.has(c.id)).map((c) => c.id)
  const allPicked = shown.length > 0 && live.length === shown.length

  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const stopSelecting = () => { setSelecting(false); setPicked(new Set()) }

  const ask = (ids: string[]) => {
    if (ids.length === 1 && ids[0] === generatingId) { toast.error(t('home.busy')); return }
    setConfirm(ids)
  }
  const doDelete = () => {
    const ids = (confirm ?? []).filter((id) => id !== generatingId)
    if ((confirm ?? []).length !== ids.length) toast.message(t('home.busySkipped'))
    for (const id of ids) deleteChat(id)
    if (ids.length) toast.success(ids.length === 1 ? t('home.deletedOne') : t('home.deletedMany', { n: ids.length }))
    setConfirm(null)
    setPicked(new Set())
    if (ids.length > 1) setSelecting(false)
  }
  const confirmName = confirm?.length === 1 ? chats.find((c) => c.id === confirm[0])?.title ?? '' : ''

  return (
    <section aria-label={t('home.recent')} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <BlockLabel>{t('home.recent')}</BlockLabel>
        <div className="ml-auto flex items-center gap-3">
          {chats.length > 0 && (
            <button
              type="button"
              onClick={() => (selecting ? stopSelecting() : setSelecting(true))}
              aria-pressed={selecting}
              className={cn('font-heading text-[13px] transition-colors hover:text-foreground', selecting ? 'text-foreground' : 'text-muted-foreground')}
            >
              {selecting ? t('home.cancel') : t('home.select')}
            </button>
          )}
          <button type="button" onClick={() => setView('chats')} className="font-heading text-[13px] text-muted-foreground hover:text-foreground">
            {t('home.allChats')} →
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <ChatFilters value={filter} onChange={(f) => { setFilter(f); setPicked(new Set()) }} />
        {selecting && (
          <div className="ml-auto flex items-center gap-2">
            <label className="flex cursor-pointer items-center gap-2 font-heading text-[13px] text-muted-foreground">
              <Checkbox
                checked={allPicked}
                onCheckedChange={(v) => setPicked(v ? new Set(shown.map((c) => c.id)) : new Set())}
                aria-label={t('home.selectAll')}
              />
              {t('home.selectAll')}{isFiltering(filter) ? ` (${shown.length})` : ''}
            </label>
            <span className="text-xs text-muted-foreground" aria-live="polite">{t('home.selectedN', { n: live.length })}</span>
            <Button variant="destructive" size="sm" disabled={live.length === 0} onClick={() => ask(live)}>
              <Trash aria-hidden="true" /> {t('home.deleteN', { n: live.length })}
            </Button>
          </div>
        )}
      </div>

      {shown.length === 0 ? (
        <p className="rounded border border-dashed border-border p-4 text-sm text-muted-foreground">
          {chats.length === 0 ? t('home.noChatsYet') : t('home.noMatch')}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {shown.map((chat) => {
            const char = characters.find((c) => c.id === chat.characterId)
            const persona = personas.find((p) => p.id === chat.personaId)
            const last = chat.messages[chat.messages.length - 1]
            const text = last?.swipes[last.activeSwipe]?.content ?? chat.preview ?? ''
            const count = chat.messages.length > 0 ? chat.messages.length : chat.messageCount ?? 0
            const title = chat.title.trim() || char?.name || ''
            const isPicked = picked.has(chat.id)
            return (
              <li
                key={chat.id}
                className={cn(
                  'group flex items-center gap-1 rounded border bg-card transition-colors hover:border-primary/50',
                  isPicked ? 'border-primary/70 bg-primary/5' : 'border-border',
                )}
              >
                {selecting && (
                  <label className="flex shrink-0 cursor-pointer items-center self-stretch pl-3">
                    <Checkbox checked={isPicked} onCheckedChange={() => toggle(chat.id)} aria-label={title} />
                  </label>
                )}
                <button
                  type="button"
                  onClick={() => (selecting ? toggle(chat.id) : openChat(chat.id))}
                  className="flex min-w-0 flex-1 items-center gap-3 p-3 text-left"
                >
                  <Avatar className="size-11 rounded-[3px]">
                    <AvatarImage src={char?.avatar || DEFAULT_AVATAR} alt="" />
                    <AvatarFallback>{char?.name.slice(0, 2)}</AvatarFallback>
                  </Avatar>
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    {persona && <Chip tone="red" className="self-start">{t('home.persona')}: {persona.name}</Chip>}
                    <span className="truncate font-heading text-[18px] leading-tight">{title}</span>
                    <span className="line-clamp-1 text-[12.5px] text-muted-foreground">{cleanPreview(text, 160)}</span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-0.5 font-mono text-[11.5px] text-muted-foreground">
                    <span>{when(chat.updatedAt)}</span>
                    <span>{count} {t('home.msgs')}</span>
                  </span>
                </button>
                {!selecting && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="mr-2 shrink-0 text-muted-foreground hover:text-destructive"
                    aria-label={`${t('home.deleteChat')}: ${title}`}
                    onClick={() => ask([chat.id])}
                  >
                    <Trash aria-hidden="true" />
                  </Button>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {!showAll && filtered.length > SHOWN && (
        <button type="button" onClick={() => setShowAll(true)} className="self-start font-heading text-[13px] text-muted-foreground hover:text-foreground">
          {t('home.showAll', { n: filtered.length })}
        </button>
      )}

      <AlertDialog open={confirm !== null} onOpenChange={(o) => { if (!o) setConfirm(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm?.length === 1 ? t('home.confirmOne') : t('home.confirmMany', { n: confirm?.length ?? 0 })}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.length === 1 ? t('home.confirmBodyOne', { name: confirmName }) : t('home.confirmBodyMany', { n: confirm?.length ?? 0 })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('home.cancel')}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={doDelete}>{t('home.delete')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
