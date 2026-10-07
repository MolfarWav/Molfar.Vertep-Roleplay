import { useEffect, useRef, useState } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useT } from '@/hooks/use-t'
import { cn } from '@/lib/utils'
import { fetchLitChat, type LitChat } from './litopys-api'
import { WorkerLine } from './worker-line'
import { FactsTab } from './ledger-facts'
import { ChaptersTab } from './ledger-chapters'
import { ProposalsTab } from './ledger-proposals'
import { ActivityTab } from './ledger-activity'
import { OverviewBody } from './overview'

const TAB_IDS = ['chapters', 'facts', 'proposals', 'activity'] as const
type TabId = (typeof TAB_IDS)[number]

function tabLabel(id: TabId): 'lit.chapters' | 'lit.facts' | 'lit.proposals' | 'lit.activity' {
  switch (id) {
    case 'chapters': return 'lit.chapters'
    case 'facts': return 'lit.facts'
    case 'proposals': return 'lit.proposals'
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
  const [chat, setChat] = useState<LitChat | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<TabId>(readStoredTab)
  const [bump, setBump] = useState(0)
  const seq = useRef(0)

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

  const tabs: { id: TabId; count: number }[] = [
    { id: 'chapters', count: chat.chapters.length },
    { id: 'facts', count: activeFacts },
    { id: 'proposals', count: pending },
    { id: 'activity', count: chat.activity.length },
  ]

  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="flex min-w-0 flex-col gap-3 p-3 md:p-5">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <h2 className="min-w-0 break-words font-heading text-lg leading-tight">{chat.title}</h2>
            {chat.name && <span className="text-sm text-muted-foreground">{chat.name}</span>}
          </div>
          <div className="text-xs text-muted-foreground">
            {t('lit.counts', { chapters: chat.chapters.length, facts: activeFacts, proposals: pending })}
          </div>
        </div>

        <WorkerLine worker={chat.worker} rebuilding={chat.rebuilding} rebuildScenes={chat.rebuildScenes} />

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
          </div>
        )}

        {!chat.hasData ? (
          <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
            {t('lit.noData')}
          </div>
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
            {tab === 'activity' && <ActivityTab chat={chat} onChat={onChat} onRefresh={refresh} />}
          </>
        )}
      </div>
    </ScrollArea>
  )
}
