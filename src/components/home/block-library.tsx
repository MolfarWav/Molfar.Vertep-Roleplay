// From your library: one character card, drawn once per visit. "Another" draws again. The button starts a chat, or
// continues the card's latest one.

import { useMemo } from 'react'
import { ArrowsClockwise, ChatCircle, UserCircle } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/section'
import { useApp } from '@/lib/store'
import { useT } from '@/hooks/use-t'
import { DEFAULT_AVATAR } from '@/lib/utils'
import type { Chat, Character } from '@/lib/types'
import { BlockCard, BlockHead, EmptyLine } from '@/components/home/home-frame'
import { useVisitPick } from '@/components/home/use-visit-pick'

/** The character's first sentence, for a one-line tagline. */
export function taglineOf(c: Pick<Character, 'description' | 'creatorNotes'>): string {
  const text = (c.description || c.creatorNotes || '').replace(/\s+/g, ' ').trim()
  const cut = text.search(/[.!?](\s|$)/)
  return cut > 0 && cut < 160 ? text.slice(0, cut + 1) : text.slice(0, 160)
}

/** The card's most recent chat, if it has one. */
export function latestChatOf(chats: readonly Chat[], characterId: string): Chat | null {
  let best: Chat | null = null
  for (const c of chats) if (c.characterId === characterId && (!best || c.updatedAt > best.updatedAt)) best = c
  return best
}

export interface LibraryViewProps {
  name: string
  tagline: string
  portrait: string | null
  chats: number
  lorebooks: number
  /** "Start chat", or "Continue" when the card has a chat */
  action: string
  onAction: () => void
  onAnother: () => void
}

/** The card itself: portrait, name, tagline, two counts, the tonal button and Another. */
export function LibraryView({ name, tagline, portrait, chats, lorebooks, action, onAction, onAnother }: LibraryViewProps) {
  const t = useT()
  return (
    <div className="flex flex-1 flex-col gap-4 p-4 sm:flex-row">
      <img
        src={portrait || DEFAULT_AVATAR}
        alt=""
        aria-hidden="true"
        className="aspect-[3/4] w-28 shrink-0 rounded-xl border border-border object-cover max-sm:w-full max-sm:max-w-40"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <h4 className="font-heading text-title leading-tight">{name}</h4>
        {tagline && <p className="line-clamp-3 text-body text-muted-foreground">{tagline}</p>}
        <div className="flex flex-wrap gap-1.5">
          <Chip>{t('home.chatsN', { n: chats })}</Chip>
          {lorebooks > 0 && <Chip>{t('home.lorebooksN', { n: lorebooks })}</Chip>}
        </div>
        <div className="mt-auto flex flex-wrap gap-2 pt-2">
          <Button variant="tonal" className="max-md:h-10" onClick={onAction}>
            <ChatCircle aria-hidden="true" /> {action}
          </Button>
          <Button variant="ghost" className="max-md:h-10" onClick={onAnother}>
            <ArrowsClockwise aria-hidden="true" /> {t('home.another')}
          </Button>
        </div>
      </div>
    </div>
  )
}

export function LibraryBlock() {
  const t = useT()
  const characters = useApp((s) => s.characters)
  const solo = useMemo(() => characters.filter((c) => !c.isGroup), [characters])
  const { index, another } = useVisitPick(solo.length)
  const card = index >= 0 ? solo[index] : undefined
  return (
    <BlockCard>
      <BlockHead tone="violet" icon={UserCircle} title={t('home.library')} />
      {card ? <LibraryOf card={card} onAnother={another} /> : <EmptyLine>{t('home.libraryEmpty')}</EmptyLine>}
    </BlockCard>
  )
}

/** The chosen card with its chats and its start or continue action. */
function LibraryOf({ card, onAnother }: { card: Character; onAnother: () => void }) {
  const t = useT()
  const chats = useApp((s) => s.chats)
  const openChat = useApp((s) => s.openChat)
  const startChatAndOpen = useApp((s) => s.startChatAndOpen)
  const latest = latestChatOf(chats, card.id)
  const count = chats.filter((c) => c.characterId === card.id).length
  const books = (card.embeddedLorebookId ? 1 : 0) + (card.linkedLorebookIds?.length ?? 0)
  return (
    <LibraryView
      name={card.name}
      tagline={taglineOf(card)}
      portrait={card.avatar}
      chats={count}
      lorebooks={books}
      action={latest ? t('home.continue') : t('home.startChat')}
      onAction={() => (latest ? openChat(latest.id) : void startChatAndOpen(card.id))}
      onAnother={onAnother}
    />
  )
}
