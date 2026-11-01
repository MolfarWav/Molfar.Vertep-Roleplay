// Continue: the most recent chat, its character's art behind the text. The page's one filled button. With no chat
// yet it offers the start actions instead (New character is then the filled one).

import { useMemo } from 'react'
import { GitBranch, Play, UserCircle } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/section'
import { useApp } from '@/lib/store'
import { useRelativeTime, useT } from '@/hooks/use-t'
import { ChatQuote } from '@/components/chat/chat-preview-text'
import { DEFAULT_AVATAR } from '@/lib/utils'
import { CreateButtons } from '@/components/home/home-actions'
import { BlockCard } from '@/components/home/home-frame'

export function ContinueBlock() {
  const t = useT()
  const when = useRelativeTime()
  const chats = useApp((s) => s.chats)
  const characters = useApp((s) => s.characters)
  const personas = useApp((s) => s.personas)
  const lorebooks = useApp((s) => s.lorebooks)
  const openChat = useApp((s) => s.openChat)
  const openBranchTree = useApp((s) => s.openBranchTree)

  const chat = useMemo(() => [...chats].sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? null, [chats])
  const character = chat ? characters.find((c) => c.id === chat.characterId) ?? null : null

  if (!chat || !character) {
    return (
      <BlockCard aria-label={t('home.emptyTitle')} className="p-6 md:p-8">
        <h2 className="font-heading text-title">{t('home.emptyTitle')}</h2>
        <p className="mt-2 max-w-xl text-body text-muted-foreground">{t('home.emptyText')}</p>
        <div className="mt-5">
          <CreateButtons primary />
        </div>
      </BlockCard>
    )
  }

  const persona = personas.find((p) => p.id === chat.personaId)
  const bookId = character.embeddedLorebookId ?? character.linkedLorebookIds?.[0] ?? null
  const book = bookId ? lorebooks.find((b) => b.id === bookId) : null
  const count = chat.messages.length > 0 ? chat.messages.length : chat.messageCount ?? 0
  const title = chat.title.trim() || character.name

  return (
    <BlockCard aria-label={t('home.pickUp')} className="relative isolate min-h-[300px] overflow-hidden md:min-h-[260px]">
      {/* the art: full-bleed behind the text on phones, the right 44 % on desktop */}
      <img
        src={character.avatar || DEFAULT_AVATAR}
        alt=""
        aria-hidden="true"
        className="absolute inset-0 -z-10 size-full object-cover object-[center_30%] md:left-auto md:w-[44%]"
      />
      <div aria-hidden="true" className="absolute inset-0 -z-10 bg-gradient-to-t from-card via-card/90 to-card/60 md:bg-gradient-to-r md:from-card md:from-[56%] md:via-card/60 md:to-transparent" />
      <div className="mt-auto flex w-full flex-col gap-2 p-5 md:mt-0 md:max-w-[62%] md:p-6">
        <p className="flex items-center gap-2 text-caption font-medium text-muted-foreground">
          <span aria-hidden="true" className="inline-block size-2 shrink-0 rotate-45 bg-primary" /> {t('home.pickUp')}
        </p>
        <h2 className="font-heading text-display">{title}</h2>
        <ChatQuote chat={chat} max={140} className="font-heading text-heading leading-snug text-foreground/90" />
        <div className="flex flex-wrap items-center gap-2">
          {persona && (
            <Chip tone="violet" className="bg-card/90">
              <UserCircle className="size-3.5 shrink-0" aria-hidden="true" />
              {t('home.persona')}: {persona.name}
            </Chip>
          )}
          {book && <Chip className="bg-card/90">{t('home.lorebook')}: {book.name}</Chip>}
        </div>
        <p className="text-caption text-foreground/75">
          {character.name} · {count} {t('home.msgs')} · {when(chat.updatedAt)}
        </p>
        <div className="mt-1 flex flex-wrap gap-2">
          <Button size="lg" onClick={() => openChat(chat.id)} data-testid="home-continue">
            <Play weight="fill" aria-hidden="true" /> {t('home.continue')}
          </Button>
          <Button size="lg" variant="outline" onClick={() => openBranchTree(chat.id)}>
            <GitBranch aria-hidden="true" /> {t('home.branches')}
          </Button>
        </div>
      </div>
    </BlockCard>
  )
}
