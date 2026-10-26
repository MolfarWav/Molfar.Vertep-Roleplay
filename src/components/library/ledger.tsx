import { useEffect, useRef, useState } from 'react'
import { Scroll } from '@phosphor-icons/react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Button } from '@/components/ui/button'
import { useT } from '@/hooks/use-t'
import { useApp } from '@/lib/store'
import { cn } from '@/lib/utils'
import { announceEarned } from '@/lib/habit-earned-toast'
import { habitCounts } from '@/lib/habit-earned'
import { distinctName, fetchLitChat, type LitChat } from './litopys-api'
import { WorkerLine } from './worker-line'
import { ArcNotice } from './arcs'
import { FactsTab } from './ledger-facts'
import { ChaptersTab } from './ledger-chapters'
import { ProposalsTab } from './ledger-proposals'
import { ActivityTab } from './ledger-activity'
import { HabitsTab } from './ledger-habits'
import { OverviewBody } from './overview'

const TAB_IDS = ['chapters', 'facts', 'proposals', 'habits', 'activity'] as const
type TabId = (typeof TAB_IDS)[number]

function tabLabel(id: TabId): 'lit.chapters' | 'lit.facts' | 'lit.proposals' | 'lit.habits' | 'lit.activity' {
  switch (id) {
    case 'chapters': return 'lit.chapters'
    case 'facts': return 'lit.facts'
    case 'proposals': return 'lit.proposals'
    case 'habits': return 'lit.habits'
    case 'activity': return 'lit.activity'
  }
}

function readStoredTab(): TabId {
  try {
    const v = localStorage.getItem('rp.ledgerTab')
    return TAB_IDS.includes(v as TabId) ? (v as TabId) : 'chapters'
  } catch {
    return 'chapters'
  }
}

export function LedgerChat({
  chatId,
  refreshKey = 0,
  onLoaded,
  mode = 'ledger',
}: {
  chatId: string
  refreshKey?: number
  onLoaded?: (c: LitChat) => void
  /** overview: the timeline and character cards (M4c) instead of the tabs */
  mode?: 'ledger' | 'overview'
}) {
  const t = useT()
  const openChat = useApp((s) => s.openChat)
  const [chat, setChat] = useState<LitChat | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<TabId>(readStoredTab)
  const [bump, setBump] = useState(0)
  const seq = useRef(0)
  // the "earned a habit" toast asks for the Habits tab
  const tabRequest = useApp((s) => s.ledgerTabRequest)
  useEffect(() => {
    if (!tabRequest) return
    useApp.setState({ ledgerTabRequest: null })
    if (TAB_IDS.includes(tabRequest as TabId)) setTab(tabRequest as TabId)
  }, [tabRequest])
  const tabNow = useRef(tab)
  tabNow.current = tab

  // poll faster while the worker writes or a rebuild runs
  const active = chat?.worker?.state === 'working' || !!chat?.rebuilding

  useEffect(() => {
    let cancelled = false
    const my = ++seq.current

    const load = async () => {
      try {
        const data = await fetchLitChat(chatId)
        if (!cancelled && seq.current === my) {
          setChat(data)
          setError(null)
          onLoaded?.(data)
          // a habit earned since this browser last showed one: one toast (quiet while the Habits tab is open)
          announceEarned(chatId, data.habits, { quiet: tabNow.current === 'habits' })
        }
      } catch (e) {
        if (!cancelled && seq.current === my) {
          setError(e instanceof Error ? e.message : String(e))
        }
      }
    }

    void load()
    const id = setInterval(() => {
      if (!document.hidden) void load()
    }, active ? 5000 : 15000)

    return () => {
      cancelled = true
      clearInterval(id)
    }
    // onLoaded is the parent's callback; refetching on its identity would loop
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId, refreshKey, bump, active])

  const storeTab = (next: TabId) => {
    setTab(next)
    try {
      localStorage.setItem('rp.ledgerTab', next)
    } catch {
      // ignore
    }
  }

  const onChat = (c: LitChat) => {
    // an edit's answer is newer than any poll still in flight
    seq.current++
    setChat(c)
    onLoaded?.(c)
    // what the user just did (accepting a candidate early) is not news
    announceEarned(c.chatId, c.habits, { quiet: true })
  }

  const refresh = () => setBump((n) => n + 1)

  if (error) {
    return <div className="p-3 text-sm text-destructive">{t('lit.loadError', { error })}</div>
  }
  if (!chat) {
    return <div className="p-3 text-sm text-muted-foreground">…</div>
  }

  const pending = chat.proposals.filter((p) => p.status === 'pending').length
  const activeFacts = chat.facts.filter((f) => f.status === 'active').length
  // a record file with nothing in it yet reads as empty: one explanation instead of three "none yet" lines
  const empty = !chat.hasData || (chat.chapters.length === 0 && activeFacts === 0 && pending === 0)

  const sk = habitCounts(chat.habits)
  const tabs: { id: TabId; count: number }[] = [
    { id: 'chapters', count: chat.chapters.length },
    { id: 'facts', count: activeFacts },
    { id: 'proposals', count: pending },
    { id: 'habits', count: sk.earned },
    { id: 'activity', count: chat.activity.length },
  ]

  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="flex min-w-0 flex-col gap-3 p-3 md:p-5">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <h2 className="min-w-0 break-words font-heading text-lg leading-tight">{chat.title}</h2>
            {distinctName(chat.title, chat.name) && <span className="text-sm text-muted-foreground">{chat.name}</span>}
          </div>
          <div className="text-xs text-muted-foreground">
            {t('lit.counts', { chapters: chat.chapters.length, facts: activeFacts, proposals: pending })}
          </div>
        </div>

        {/* with no record yet, an idle chronicler's "Up to date" would contradict the empty state below */}
        {(!empty || chat.rebuilding || (chat.worker && chat.worker.state !== 'idle')) && <WorkerLine worker={chat.worker} rebuilding={chat.rebuilding} rebuildScenes={chat.rebuildScenes} />}
        <ArcNotice chat={chat} onChat={onChat} onRefresh={refresh} />

        {chat.cut.count > 0 && (
          <div className="text-xs text-muted-foreground">
            {t('lit.cutLine', { n: chat.cut.count })}
          </div>
        )}
        {chat.lastInsert && (
          <div className="text-xs text-muted-foreground">
            {t('lit.lastInsert', {
              tokens: chat.lastInsert.tokens,
              facts: chat.lastInsert.facts,
              chapters: chat.lastInsert.chapters,
            })}
            {(chat.lastInsert.arcs ?? 0) > 0 && (
              <span>{t('lit.arc.inInsert', { n: chat.lastInsert.arcs ?? 0 })}</span>
            )}
            {chat.lastInsert.full === true && <span>{t('lit.fullRecord')}</span>}
          </div>
        )}

        {empty ? (
          <Empty className="flex-none border" data-testid="lit-empty">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Scroll aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>{t('lit.empty.title')}</EmptyTitle>
              <EmptyDescription>{t('lit.empty.body')}</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button variant="outline" size="sm" className="max-md:h-10" onClick={() => openChat(chat.chatId)}>{t('lit.empty.openChat')}</Button>
            </EmptyContent>
          </Empty>
        ) : mode === 'overview' ? (
          <OverviewBody chat={chat} onChat={onChat} onRefresh={refresh} />
        ) : (
          <>
            <div className="flex flex-wrap gap-1">
              {tabs.map(({ id, count }) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={tab === id}
                  data-testid={`ledger-tab-${id}`}
                  onClick={() => storeTab(id)}
                  className={cn(
                    'inline-flex min-h-9 items-center gap-1.5 rounded-md border px-2.5 text-xs transition-colors',
                    tab === id
                      ? 'border-primary/50 bg-accent text-foreground'
                      : 'border-border text-muted-foreground hover:bg-accent/50'
                  )}
                >
                  {t(tabLabel(id))}
                  {(id !== 'proposals' || count === 0) && <span className="text-[10px] tabular-nums opacity-70">{count}</span>}
                  {id === 'habits' && sk.candidates > 0 && (
                    <span className="rounded-full bg-violet-600 px-1.5 py-px text-[10px] leading-none text-white" title={t('lit.habits.candPill', { n: sk.candidates })} data-testid="habits-candidates-pill">
                      +{sk.candidates}
                    </span>
                  )}
                  {id === 'proposals' && count > 0 && (
                    <span className="rounded-full bg-primary px-1.5 py-px text-[10px] leading-none text-primary-foreground">
                      {count}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {tab === 'chapters' && <ChaptersTab chat={chat} onChat={onChat} onRefresh={refresh} />}
            {tab === 'facts' && <FactsTab chat={chat} onChat={onChat} onRefresh={refresh} />}
            {tab === 'proposals' && <ProposalsTab chat={chat} onChat={onChat} onRefresh={refresh} />}
            {tab === 'habits' && <HabitsTab chat={chat} onChat={onChat} onRefresh={refresh} />}
            {tab === 'activity' && <ActivityTab chat={chat} onChat={onChat} onRefresh={refresh} />}
          </>
        )}
      </div>
    </ScrollArea>
  )
}
