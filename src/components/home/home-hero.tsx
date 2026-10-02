import { useMemo } from 'react'
import { GitBranch, Play, UserCircle } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { useApp } from '@/lib/store'
import { useRelativeTime, useT } from '@/hooks/use-t'
import { firstLine } from '@/lib/preview'
import { DEFAULT_AVATAR } from '@/lib/utils'
import { CreateButtons } from '@/components/home/home-blocks'
import { Chip, Diamond } from '@/components/home/home-ui'

/** "Pick up the story": the most recent chat, the character's art behind it. */
export function HomeHero() {
  const t = useT()
  const when = useRelativeTime()
  const chats = useApp((s) => s.chats)
  const characters = useApp((s) => s.characters)
  const personas = useApp((s) => s.personas)
  const lorebooks = useApp((s) => s.lorebooks)
  const openChat = useApp((s) => s.openChat)
  const openBranchTree = useApp((s) => s.openBranchTree)
  const setView = useApp((s) => s.setView)

  const chat = useMemo(() => [...chats].sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? null, [chats])
  const character = chat ? characters.find((c) => c.id === chat.characterId) ?? null : null

  if (!chat || !character) {
    return (
      <section aria-label={t('home.emptyTitle')} className="relative overflow-hidden rounded border border-primary/30 bg-card p-6 md:p-8">
        <h2 className="font-heading text-[26px] leading-tight md:text-[32px]">{t('home.emptyTitle')}</h2>
        <p className="mt-2 max-w-xl text-sm text-muted-foreground">{t('home.emptyText')}</p>
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <CreateButtons />
          {characters.length > 0 && (
            <Button variant="outline" onClick={() => setView('characters')}>{t('home.pickCharacter')}</Button>
          )}
        </div>
      </section>
    )
  }

  const last = chat.messages[chat.messages.length - 1]
  const lastText = last?.swipes[last.activeSwipe]?.content ?? chat.preview ?? ''
  const quote = firstLine(lastText, 140)
  const persona = personas.find((p) => p.id === chat.personaId)
  const bookId = character.embeddedLorebookId ?? character.linkedLorebookIds?.[0] ?? null
  const book = bookId ? lorebooks.find((b) => b.id === bookId) : null
  const count = chat.messages.length > 0 ? chat.messages.length : chat.messageCount ?? 0
  const title = chat.title.trim() || character.name

  return (
    <section aria-label={t('home.pickUp')} className="relative isolate flex min-h-[300px] flex-col overflow-hidden rounded border border-primary/30 bg-card md:min-h-[232px] md:flex-row">
      {/* the art: full-bleed behind the text on phones, the right 44% on desktop */}
      <img
        src={character.avatar || DEFAULT_AVATAR}
        alt=""
        aria-hidden="true"
        className="absolute inset-0 -z-10 size-full object-cover object-[center_30%] md:left-auto md:w-[44%]"
      />
      <div aria-hidden="true" className="absolute inset-0 -z-10 bg-gradient-to-t from-card via-card/85 to-card/30 md:bg-gradient-to-r md:from-card md:from-[56%] md:via-card/60 md:to-transparent" />
      <div className="mt-auto flex w-full flex-col gap-2 p-5 md:mt-0 md:max-w-[62%] md:p-6">
        <p className="flex items-center gap-2 font-heading text-sm text-muted-foreground">
          <Diamond /> {t('home.pickUp')}
        </p>
        <h2 className="font-heading text-[28px] leading-tight md:text-[32px]">{title}</h2>
        {quote && <p className="font-heading text-[17px] leading-snug text-foreground/90">«{quote}»</p>}
        <div className="flex flex-wrap items-center gap-2">
          {persona && (
            <Chip tone="red" icon={<UserCircle className="size-3.5 shrink-0" aria-hidden="true" />}>{t('home.persona')}: {persona.name}</Chip>
          )}
          {book && <Chip>{t('home.lorebook')}: {book.name}</Chip>}
        </div>
        <p className="font-mono text-[11.5px] text-muted-foreground">
          {character.name} · {count} {t('home.msgs')} · {when(chat.updatedAt)}
        </p>
        <div className="mt-1 flex flex-wrap gap-2">
          <Button size="lg" className="h-10 gap-2 px-5 font-heading text-[15px]" onClick={() => openChat(chat.id)} data-testid="home-continue">
            <Play weight="fill" aria-hidden="true" /> {t('home.continue')}
          </Button>
          <Button size="lg" variant="outline" className="h-10 gap-2 px-4 font-heading text-[15px]" onClick={() => openBranchTree(chat.id)}>
            <GitBranch aria-hidden="true" /> {t('home.branches')}
          </Button>
        </div>
      </div>
    </section>
  )
}
