import { useMemo } from 'react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useApp } from '@/lib/store'
import { useRelativeTime, useT } from '@/hooks/use-t'
import { cleanPreview } from '@/lib/preview'
import { DEFAULT_AVATAR } from '@/lib/utils'
import { BlockLabel, Chip } from '@/components/home/home-ui'

const SHOWN = 8

/** The latest chats, each with its player persona. */
export function RecentChats() {
  const t = useT()
  const when = useRelativeTime()
  const chats = useApp((s) => s.chats)
  const characters = useApp((s) => s.characters)
  const personas = useApp((s) => s.personas)
  const openChat = useApp((s) => s.openChat)
  const setView = useApp((s) => s.setView)
  const recent = useMemo(() => [...chats].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, SHOWN), [chats])

  return (
    <section aria-label={t('home.recent')} className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <BlockLabel>{t('home.recent')}</BlockLabel>
        <button type="button" onClick={() => setView('chats')} className="ml-auto font-heading text-[13px] text-muted-foreground hover:text-foreground">
          {t('home.allChats')} →
        </button>
      </div>
      {recent.length === 0 ? (
        <p className="rounded border border-dashed border-border p-4 text-sm text-muted-foreground">{t('home.noChatsYet')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {recent.map((chat) => {
            const char = characters.find((c) => c.id === chat.characterId)
            const persona = personas.find((p) => p.id === chat.personaId)
            const last = chat.messages[chat.messages.length - 1]
            const text = last?.swipes[last.activeSwipe]?.content ?? chat.preview ?? ''
            const count = chat.messages.length > 0 ? chat.messages.length : chat.messageCount ?? 0
            return (
              <li key={chat.id}>
                <button
                  type="button"
                  onClick={() => openChat(chat.id)}
                  className="flex w-full items-center gap-3 rounded border border-border bg-card p-3 text-left transition-colors hover:border-primary/50"
                >
                  <Avatar className="size-11 rounded-[3px]">
                    <AvatarImage src={char?.avatar || DEFAULT_AVATAR} alt="" />
                    <AvatarFallback>{char?.name.slice(0, 2)}</AvatarFallback>
                  </Avatar>
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    {persona && <Chip tone="red" className="self-start">{t('home.persona')}: {persona.name}</Chip>}
                    <span className="truncate font-heading text-[18px] leading-tight">{chat.title.trim() || char?.name}</span>
                    <span className="line-clamp-1 text-[12.5px] text-muted-foreground">{cleanPreview(text, 160)}</span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-0.5 font-mono text-[11.5px] text-muted-foreground">
                    <span>{when(chat.updatedAt)}</span>
                    <span>{count} {t('home.msgs')}</span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
