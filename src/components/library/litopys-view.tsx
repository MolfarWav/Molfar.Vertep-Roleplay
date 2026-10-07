import { useCallback, useEffect, useState } from 'react'
import { ArrowsClockwise, Scroll, WarningCircle } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { MasterDetail } from '@/components/shell/master-detail'
import { PaneTitle, SectionPage } from '@/components/shell/section-page'
import { useRelativeTime, useT } from '@/hooks/use-t'
import { cn } from '@/lib/utils'
import { fetchLitChat, fetchLitChats, type LitChat, type LitChatItem } from './litopys-api'
import { ChapterList } from './chapters-list'
import { FactList } from './facts-list'
import { ProposalList } from './proposals-list'
import { WorkerLine } from './worker-line'

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e))

/**
 * The Litopys section: a read-only look at what the memory worker has built per
 * chat. Left, the chats; right, the chosen chat's chapters, facts, proposals
 * and the worker's last run. Nothing here edits anything.
 */
export function LitopysView() {
  const [items, setItems] = useState<LitChatItem[] | null>(null)
  const [listError, setListError] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [chat, setChat] = useState<LitChat | null>(null)
  const [chatError, setChatError] = useState('')
  const [loading, setLoading] = useState(false)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let live = true
    fetchLitChats()
      .then((r) => {
        if (!live) return
        setItems(r.items)
        setListError('')
        setSelectedId((cur) => cur ?? r.items.find((x) => x.hasData)?.id ?? r.items[0]?.id ?? null)
      })
      .catch((e: unknown) => {
        if (live) setListError(errorText(e))
      })
    return () => {
      live = false
    }
  }, [tick])

  useEffect(() => {
    if (!selectedId) {
      setChat(null)
      return
    }
    let live = true
    setLoading(true)
    fetchLitChat(selectedId)
      .then((r) => {
        if (!live) return
        setChat(r)
        setChatError('')
      })
      .catch((e: unknown) => {
        if (!live) return
        setChat(null)
        setChatError(errorText(e))
      })
      .finally(() => {
        if (live) setLoading(false)
      })
    return () => {
      live = false
    }
  }, [selectedId, tick])

  const refresh = useCallback(() => setTick((n) => n + 1), [])
  const select = (id: string) => {
    setSelectedId(id)
    setDetailOpen(true)
  }
  const withData = items ? items.filter((x) => x.hasData).length : undefined
  const current = items?.find((x) => x.id === selectedId)

  return (
    <SectionPage section="litopys" count={withData} hideOnPhone={detailOpen && !!selectedId}>
      <MasterDetail
        detailOpen={detailOpen && !!selectedId}
        onBack={() => setDetailOpen(false)}
        detailTitle={current?.title}
        masterWidth="w-72"
        master={<ChatPicker items={items} error={listError} selectedId={selectedId} onSelect={select} onRefresh={refresh} />}
        detail={<ChatDetail chat={chat} loading={loading} error={chatError} hasChats={!!items?.length} refreshKey={tick} />}
      />
    </SectionPage>
  )
}

function ChatPicker({
  items,
  error,
  selectedId,
  onSelect,
  onRefresh,
}: {
  items: LitChatItem[] | null
  error: string
  selectedId: string | null
  onSelect: (id: string) => void
  onRefresh: () => void
}) {
  const t = useT()
  const rel = useRelativeTime()
  return (
    <aside className="flex h-full min-h-0 flex-col" aria-label={t('lit.chat')}>
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <PaneTitle section="litopys" icon={<Scroll className="size-4 text-primary" aria-hidden="true" />} />
        <Button variant="ghost" size="sm" className="ml-auto size-9 p-0 md:size-7" onClick={onRefresh} aria-label={t('lit.refresh')}>
          <ArrowsClockwise className="size-4" aria-hidden="true" />
        </Button>
      </div>
      <p className="border-b border-border px-3 py-2 text-[11px] text-muted-foreground">{t('lit.hint')}</p>
      <ScrollArea className="min-h-0 flex-1">
        {error && <p className="p-3 text-xs text-destructive">{t('lit.loadError', { error })}</p>}
        {items && items.length === 0 && !error && <p className="p-3 text-xs text-muted-foreground">{t('lit.noChats')}</p>}
        <ul className="flex flex-col p-1.5">
          {(items ?? []).map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => onSelect(c.id)}
                aria-current={c.id === selectedId ? 'true' : undefined}
                className={cn(
                  'flex min-h-11 w-full flex-col justify-center gap-0.5 rounded-md px-2 py-1.5 text-left text-sm',
                  c.id === selectedId ? 'bg-accent' : 'hover:bg-accent/50',
                  !c.hasData && 'opacity-60',
                )}
              >
                <span className="flex min-w-0 items-center gap-1.5 font-medium">
                  <span className="min-w-0 truncate">{c.title}</span>
                  {c.worker && !c.worker.ok && <WarningCircle className="size-3.5 shrink-0 text-destructive" aria-label={t('lit.worker.failed')} />}
                </span>
                <span className="truncate text-[11px] text-muted-foreground">
                  {c.name ? `${c.name} · ` : ''}
                  {c.hasData ? t('lit.counts', { chapters: c.chapters, facts: c.facts, proposals: c.proposals }) : t('lit.noData')}
                </span>
                {c.updatedAt > 0 && <span className="text-[10px] text-muted-foreground">{rel(c.updatedAt)}</span>}
              </button>
            </li>
          ))}
        </ul>
      </ScrollArea>
    </aside>
  )
}

function ChatDetail({ chat, loading, error, hasChats, refreshKey }: { chat: LitChat | null; loading: boolean; error: string; hasChats: boolean; refreshKey: number }) {
  const t = useT()
  if (error) return <p className="p-4 text-sm text-destructive">{t('lit.loadError', { error })}</p>
  if (!chat) {
    return (
      <div className="flex flex-1 items-center justify-center p-4 text-sm text-muted-foreground">
        {loading ? '…' : hasChats ? t('lit.pick') : t('lit.noChats')}
      </div>
    )
  }
  return <LitopysChatDetail chatId={chat.chatId} refreshKey={refreshKey} />
}

/**
 * The detail part of the Litopys view: worker line, chapters, facts and
 * proposals. Shared with the chat's record sheet.
 */
export function LitopysChatDetail({ chatId, refreshKey = 0, onLoaded }: { chatId: string; refreshKey?: number; onLoaded?: (chat: LitChat) => void }) {
  const t = useT()
  const [chat, setChat] = useState<LitChat | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let live = true
    fetchLitChat(chatId)
      .then((r) => {
        if (!live) return
        setChat(r)
        setError('')
        onLoaded?.(r)
      })
      .catch((e: unknown) => {
        if (live) setError(errorText(e))
      })
    return () => {
      live = false
    }
    // onLoaded is a callback from the parent; refetching on its identity would loop
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId, refreshKey])
  if (error) return <p className="p-4 text-sm text-destructive">{t('lit.loadError', { error })}</p>
  if (!chat) return <div className="flex flex-1 items-center justify-center p-4 text-sm text-muted-foreground">…</div>
  const active = chat.facts.filter((f) => f.status === 'active').length
  const pending = chat.proposals.filter((p) => p.status === 'pending').length
  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="flex min-w-0 flex-col gap-3 p-3 md:p-5">
        <header className="min-w-0">
          <h2 className="truncate font-heading text-lg leading-tight">{chat.title}</h2>
          <p className="text-xs text-muted-foreground">
            {chat.name ? `${chat.name} · ` : ''}
            {t('lit.counts', { chapters: chat.chapters.length, facts: active, proposals: pending })}
          </p>
        </header>
        <WorkerLine worker={chat.worker} facts={chat.worker?.facts} />
        {(chat.cut?.count ?? 0) > 0 || chat.lastInsert || chat.rebuilding ? (
          <ul className="flex flex-col gap-0.5 text-xs text-muted-foreground">
            {(chat.cut?.count ?? 0) > 0 && <li>{t('lit.cutLine', { n: chat.cut!.count })}</li>}
            {chat.lastInsert && (
              <li>{t('lit.lastInsert', { tokens: chat.lastInsert.tokens, facts: chat.lastInsert.facts, chapters: chat.lastInsert.chapters })}</li>
            )}
            {chat.rebuilding && <li className="text-primary">{t('lit.rebuilding', { n: chat.rebuilding.chapters })}</li>}
          </ul>
        ) : null}
        {!chat.hasData ? (
          <p className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">{t('lit.noData')}</p>
        ) : (
          <Tabs defaultValue="chapters" className="min-w-0">
            <TabsList className="h-9 w-max max-w-full">
              <TabsTrigger value="chapters" className="px-3 text-xs">
                {t('lit.chapters')} ({chat.chapters.length})
              </TabsTrigger>
              <TabsTrigger value="facts" className="px-3 text-xs">
                {t('lit.facts')} ({chat.facts.length})
              </TabsTrigger>
              <TabsTrigger value="proposals" className="px-3 text-xs">
                {t('lit.proposals')} ({chat.proposals.length})
              </TabsTrigger>
            </TabsList>
            <TabsContent value="chapters" className="mt-1">
              <ChapterList chapters={chat.chapters} scene={chat.scene} sceneFromNo={chat.sceneFromNo} />
            </TabsContent>
            <TabsContent value="facts" className="mt-1">
              <FactList facts={chat.facts} />
            </TabsContent>
            <TabsContent value="proposals" className="mt-1">
              <ProposalList proposals={chat.proposals} facts={chat.facts} />
            </TabsContent>
          </Tabs>
        )}
      </div>
    </ScrollArea>
  )
}
