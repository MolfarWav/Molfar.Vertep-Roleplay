// Quests and threads: the open ones of the latest chat (the only chat the dashboard data is read for; there is no
// endpoint that lists them across chats). A row opens that chat. Nothing is drawn until the answer is in.

import { useEffect, useState } from 'react'
import { Flag } from '@phosphor-icons/react'
import { Chip } from '@/components/ui/section'
import { useApp } from '@/lib/store'
import { useT } from '@/hooks/use-t'
import { j } from '@/lib/engine'
import type { Thread } from '@/lib/dashboard'
import { openQuests } from '@/lib/home-pick'
import { BlockCard, BlockHead, EmptyLine } from '@/components/home/home-frame'

export interface QuestItem {
  id: string
  text: string
  kind: 'main' | 'side' | 'everyday'
}

export interface QuestsViewProps {
  ready: boolean
  chatTitle: string | null
  items: QuestItem[]
  onOpen: () => void
}

const KIND_TONE = { main: 'pink', side: 'sky', everyday: 'slate' } as const

export function QuestsView({ ready, chatTitle, items, onOpen }: QuestsViewProps) {
  const t = useT()
  return (
    <BlockCard>
      <BlockHead tone="pink" icon={Flag} title={t('home.quests')} aside={items.length > 0 ? <span className="text-caption tabular-nums">{items.length}</span> : null} />
      {!ready ? null : items.length === 0 ? (
        <>
          <p className="px-4 pt-4 text-body font-medium">{t('home.questsEmpty')}</p>
          <EmptyLine>{t('home.questsEmptyHint')}</EmptyLine>
        </>
      ) : (
        <ul className="flex flex-1 flex-col">
          {items.map((q) => (
            <li key={q.id} className="border-t border-border first:border-t-0">
              <button type="button" onClick={onOpen} className="flex min-h-12 w-full items-center gap-3 px-4 py-2 text-left transition-colors hover:bg-accent">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-body">{q.text}</span>
                  {chatTitle && <span className="block truncate text-caption text-muted-foreground">{t('home.questsFrom', { chat: chatTitle })}</span>}
                </span>
                <Chip tone={KIND_TONE[q.kind]}>{t(`dash.quest.kind.${q.kind}`)}</Chip>
              </button>
            </li>
          ))}
        </ul>
      )}
    </BlockCard>
  )
}

interface LatestQuests {
  chatId: string | null
  chatTitle: string | null
  ready: boolean
  items: QuestItem[]
}

/** The open threads of the latest chat, read once per chat (GET /dashboard/state with the settled view). */
export function useLatestQuests(): LatestQuests {
  const chats = useApp((s) => s.chats)
  const characters = useApp((s) => s.characters)
  const latest = [...chats].sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? null
  const chatId = latest?.id ?? null
  const chatTitle = latest ? latest.title.trim() || characters.find((c) => c.id === latest.characterId)?.name || null : null
  const [got, setGot] = useState<{ chatId: string; threads: Thread[] } | null>(null)
  useEffect(() => {
    if (!chatId) return
    let live = true
    j<{ view?: { threads?: Thread[] } | null }>(`/dashboard/state?chatId=${encodeURIComponent(chatId)}&view=1`).then(
      (r) => { if (live) setGot({ chatId, threads: Array.isArray(r.view?.threads) ? r.view!.threads! : [] }) },
      () => { if (live) setGot({ chatId, threads: [] }) },
    )
    return () => { live = false }
  }, [chatId])
  const ready = chatId !== null && got?.chatId === chatId
  const items = ready
    ? openQuests(got!.threads).map((th) => ({ id: th.id, text: th.text, kind: th.kind ?? 'side' }))
    : []
  return { chatId, chatTitle, ready: chatId === null ? true : ready, items }
}

export function QuestsBlock() {
  const openChat = useApp((s) => s.openChat)
  const q = useLatestQuests()
  return (
    <QuestsView
      ready={q.ready}
      chatTitle={q.chatTitle}
      items={q.items}
      onOpen={() => { if (q.chatId) openChat(q.chatId) }}
    />
  )
}
