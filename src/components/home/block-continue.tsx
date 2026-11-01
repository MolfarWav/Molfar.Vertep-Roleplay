// Continue: the most recent chat, its character's portrait in a frame beside the text. The page's one filled button. With no chat
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
  // a card with no picture of its own carries the default one; a summary's portrait may still be on its way
  const hasArt = (!!character.avatar && character.avatar !== DEFAULT_AVATAR) || character.avatarLazy === true

  return (
    <BlockCard aria-label={t('home.pickUp')} className="overflow-hidden">
      <div className="flex gap-4 p-5 md:p-6">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <p className="flex items-center gap-2 text-caption font-medium text-muted-foreground">
            <span aria-hidden="true" className="inline-block size-2 shrink-0 rotate-45 bg-primary" /> {t('home.pickUp')}
          </p>
          <h2 className="font-heading text-display">{title}</h2>
          <ChatQuote chat={chat} max={140} className="font-heading text-heading leading-snug text-foreground/90" />
          <div className="flex flex-wrap items-center gap-2">
            {persona && (
              <Chip tone="violet">
                <UserCircle className="size-3.5 shrink-0" aria-hidden="true" />
                {t('home.persona')}: {persona.name}
              </Chip>
            )}
            {book && <Chip tone="amber">{t('home.lorebook')}: {book.name}</Chip>}
          </div>
          <p className="text-caption text-muted-foreground">
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
        {/* the card's picture in a frame at its own size, never stretched across the block (a small image would blur);
            a card with no picture of its own shows none rather than the grey silhouette */}
        {hasArt && (
          <img
            src={character.avatar || DEFAULT_AVATAR}
            alt=""
            aria-hidden="true"
            className="aspect-[3/4] w-24 shrink-0 self-start rounded-xl border border-border object-cover sm:w-32 md:w-36"
          />
        )}
      </div>
    </BlockCard>
  )
}
