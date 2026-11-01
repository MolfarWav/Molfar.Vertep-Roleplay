// Quests and threads from your recent chats: "the adventures and decisions that still wait for you". One request asks the
// dashboard for the open threads of the latest chats; a row opens the chat it came from. Nothing is drawn until the
// answer is in.

import { useEffect, useMemo, useState } from 'react'
import { Flag } from '@phosphor-icons/react'
import { Chip } from '@/components/ui/section'
import { useApp } from '@/lib/store'
import { useT } from '@/hooks/use-t'
import { j } from '@/lib/engine'
import type { Thread } from '@/lib/dashboard'
import { gatherQuests, type ChatThreads } from '@/lib/home-pick'
import { BlockCard, BlockHead, EmptyLine } from '@/components/home/home-frame'

export interface QuestItem {
  id: string
  text: string
  kind: 'main' | 'side' | 'everyday'
  chatId: string
  chatTitle: string
}

export interface QuestsViewProps {
  ready: boolean
  items: QuestItem[]
  /** every open thread in the chats asked about, shown or not */
  total: number
  onOpen: (chatId: string) => void
}

const KIND_TONE = { main: 'pink', side: 'sky', everyday: 'slate' } as const

/** How many chats are asked about, and how many rows Home shows. */
export const QUEST_CHATS = 12
export const QUEST_ROWS = 6

export function QuestsView({ ready, items, total, onOpen }: QuestsViewProps) {
  const t = useT()
  const more = Math.max(0, total - items.length)
  return (
    <BlockCard>
      <BlockHead tone="pink" icon={Flag} title={t('home.quests')} aside={total > 0 ? <span className="text-caption tabular-nums">{total}</span> : null} />
      {!ready ? null : items.length === 0 ? (
        <>
          <p className="px-4 pt-4 text-body font-medium">{t('home.questsEmpty')}</p>
          <EmptyLine>{t('home.questsEmptyHint')}</EmptyLine>
        </>
      ) : (
        <>
          <ul className="flex flex-1 flex-col">
            {items.map((q) => (
              <li key={`${q.chatId}:${q.id}`} className="border-t border-border first:border-t-0">
                <button type="button" onClick={() => onOpen(q.chatId)} className="flex min-h-12 w-full items-center gap-3 px-4 py-2 text-left transition-colors hover:bg-accent">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body">{q.text}</span>
                    <span className="block truncate text-caption text-muted-foreground">{t('home.questsFrom', { chat: q.chatTitle })}</span>
                  </span>
                  <Chip tone={KIND_TONE[q.kind]}>{t(`dash.quest.kind.${q.kind}`)}</Chip>
                </button>
              </li>
            ))}
          </ul>
          {more > 0 && <p className="border-t border-border px-4 py-2 text-caption text-muted-foreground">{t('home.questsMore', { n: more })}</p>}
        </>
      )}
    </BlockCard>
  )
}

interface CrossQuests {
  ready: boolean
  items: QuestItem[]
  total: number
}

/** The open threads of the most recent chats, in one request (GET /dashboard/quests). A failed request reads as none. */
export function useRecentQuests(): CrossQuests {
  const chats = useApp((s) => s.chats)
  const characters = useApp((s) => s.characters)
  const recent = useMemo(
    () => [...chats].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, QUEST_CHATS),
    [chats],
  )
  const idsKey = recent.map((c) => c.id).join(',')
  const [got, setGot] = useState<{ key: string; chats: { chatId: string; threads: Thread[] }[] } | null>(null)
  useEffect(() => {
    if (!idsKey) return
    let live = true
    j<{ chats?: { chatId: string; threads?: Thread[] }[] }>(`/dashboard/quests?chatIds=${encodeURIComponent(idsKey)}`).then(
      (r) => { if (live) setGot({ key: idsKey, chats: (r.chats ?? []).map((c) => ({ chatId: c.chatId, threads: Array.isArray(c.threads) ? c.threads : [] })) }) },
      () => { if (live) setGot({ key: idsKey, chats: [] }) },
    )
    return () => { live = false }
  }, [idsKey])
  return useMemo(() => {
    if (!idsKey) return { ready: true, items: [], total: 0 }
    if (got?.key !== idsKey) return { ready: false, items: [], total: 0 }
    const byId = new Map(recent.map((c) => [c.id, c]))
    const withTitles: ChatThreads<Thread>[] = got.chats.flatMap((c) => {
      const chat = byId.get(c.chatId)
      if (!chat) return []
      const title = chat.title.trim() || characters.find((x) => x.id === chat.characterId)?.name || ''
      return [{ chatId: c.chatId, chatTitle: title, threads: c.threads }]
    })
    // the server answers in the order asked, which is the order of `recent`
    const { items, total } = gatherQuests(withTitles, QUEST_ROWS)
    return {
      ready: true,
      total,
      items: items.map((q) => ({ id: q.thread.id, text: q.thread.text, kind: q.thread.kind ?? 'side', chatId: q.chatId, chatTitle: q.chatTitle })),
    }
  }, [got, idsKey, recent, characters])
}

export function QuestsBlock() {
  const openChat = useApp((s) => s.openChat)
  const q = useRecentQuests()
  return <QuestsView ready={q.ready} items={q.items} total={q.total} onOpen={openChat} />
}
