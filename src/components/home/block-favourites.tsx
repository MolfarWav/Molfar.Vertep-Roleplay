// Favourites: the starred solo cards. A tile starts a chat with the card, or continues its latest one.

import { Star } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { useApp } from '@/lib/store'
import { useT } from '@/hooks/use-t'
import { DEFAULT_AVATAR } from '@/lib/utils'
import { BlockCard, BlockHead, EmptyLine } from '@/components/home/home-frame'
import { latestChatOf } from '@/components/home/block-library'

export interface FavouriteItem {
  id: string
  name: string
  avatar: string | null
}

export interface FavouritesViewProps {
  items: FavouriteItem[]
  onOpen: (id: string) => void
  onAll: () => void
}

export function FavouritesView({ items, onOpen, onAll }: FavouritesViewProps) {
  const t = useT()
  return (
    <BlockCard>
      <BlockHead
        tone="violet"
        icon={Star}
        title={t('home.favourites')}
        aside={
          <>
            {items.length > 0 && <span className="text-caption tabular-nums">{items.length}</span>}
            <Button variant="ghost" size="sm" className="max-md:h-10" onClick={onAll}>{t('home.allCharacters')}</Button>
          </>
        }
      />
      {items.length === 0 ? (
        <EmptyLine>{t('home.favouritesEmpty')}</EmptyLine>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-3 p-4">
          {items.map((c) => (
            <li key={c.id} className="min-w-0">
              <button type="button" onClick={() => onOpen(c.id)} className="flex w-full min-w-0 flex-col gap-1.5 rounded-lg p-1 text-left transition-colors hover:bg-accent">
                <span className="relative block aspect-[3/4] w-full overflow-hidden rounded-lg border border-border">
                  <img src={c.avatar || DEFAULT_AVATAR} alt="" aria-hidden="true" className="size-full object-cover" />
                  <Star aria-hidden="true" weight="fill" className="absolute top-1.5 right-1.5 size-4 rounded-full bg-black/50 p-0.5 text-amber-400" />
                </span>
                <span className="truncate text-caption font-medium">{c.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </BlockCard>
  )
}

export function FavouritesBlock() {
  const characters = useApp((s) => s.characters)
  const chats = useApp((s) => s.chats)
  const openChat = useApp((s) => s.openChat)
  const startChatAndOpen = useApp((s) => s.startChatAndOpen)
  const navigate = useApp((s) => s.navigate)
  const favs = characters.filter((c) => c.favorite && !c.isGroup)
  const items = favs.map((c) => ({ id: c.id, name: c.name, avatar: c.avatar || null }))
  return (
    <FavouritesView
      items={items}
      onAll={() => navigate('characters')}
      onOpen={(id) => {
        const latest = latestChatOf(chats, id)
        if (latest) openChat(latest.id)
        else void startChatAndOpen(id)
      }}
    />
  )
}
