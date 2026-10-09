import { useCallback, useEffect, useState } from 'react'
import { ArrowsClockwise, Graph, Scroll } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { MasterDetail } from '@/components/shell/master-detail'
import { PaneTitle, SectionPage } from '@/components/shell/section-page'
import { useRelativeTime, useT } from '@/hooks/use-t'
import { cn } from '@/lib/utils'
import { fetchLitChats, type LitChat, type LitChatItem } from './litopys-api'
import { LedgerChat } from './ledger'
import { WorkerDot } from './worker-dot'
import { ChatsMap } from './chats-map'

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e))

/**
 * The Library section (section id `litopys`, so the rail position stays): what Litopys keeps per
 * chat. Left, the chats with the worker's state; right, the chosen chat's Ledger, where chapters,
 * facts and proposals are edited. Overview shows the same record as a story.
 */
export function LitopysView() {
  const t = useT()
  const [items, setItems] = useState<LitChatItem[] | null>(null)
  const [listError, setListError] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [tick, setTick] = useState(0)
  const [mode, setModeState] = useState<Mode>(readMode)
  // the map of chats takes the detail pane until a chat is picked on it
  const [showMap, setShowMap] = useState(false)
  // picking Overview or Ledger shows that view of the chat: the map gives way
  const setMode = (m: Mode) => {
    setModeState(m)
    setShowMap(false)
    try {
      localStorage.setItem(MODE_KEY, m)
    } catch {
      // the choice is only a convenience
    }
  }

  useEffect(() => {
    let live = true
    const load = () =>
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
    void load()
    // the dots follow the worker
    const id = setInterval(() => {
      if (!document.hidden) void load()
    }, 15_000)
    return () => {
      live = false
      clearInterval(id)
    }
  }, [tick])

  const refresh = useCallback(() => setTick((n) => n + 1), [])
  const select = (id: string) => {
    setSelectedId(id)
    setShowMap(false)
    setDetailOpen(true)
  }
  // the map button toggles; closed, the pane goes back to the selected chat
  const toggleMap = () => {
    if (showMap) {
      setShowMap(false)
      return
    }
    setShowMap(true)
    setDetailOpen(true)
  }
  // an edit in the Ledger shows in the chat list at once, not at the next poll
  const syncItem = useCallback((c: LitChat) => {
    setItems((cur) =>
      cur?.map((x) =>
        x.id === c.chatId
          ? {
              ...x,
              chapters: c.chapters.length,
              facts: c.facts.filter((f) => f.status === 'active').length,
              proposals: c.proposals.filter((p) => p.status === 'pending').length,
              worker: c.worker ?? x.worker,
            }
          : x,
      ) ?? cur,
    )
  }, [])
  const withData = items ? items.filter((x) => x.hasData).length : undefined
  const current = items?.find((x) => x.id === selectedId)

  return (
    <SectionPage section="litopys" count={withData} hideOnPhone={detailOpen && !!selectedId}>
      <MasterDetail
        detailOpen={detailOpen && (!!selectedId || showMap)}
        onBack={() => setDetailOpen(false)}
        detailTitle={showMap ? t('lit.map.title') : current?.title}
        masterWidth="w-72"
        master={<ChatPicker items={items} error={listError} selectedId={selectedId} onSelect={select} onRefresh={refresh} mode={mode} onMode={setMode} onMap={toggleMap} mapOpen={showMap} />}
        detail={
          showMap ? (
            <div className="min-h-0 flex-1 overflow-y-auto p-3 md:p-5">
              <ChatsMap items={items ?? []} chatId={selectedId} onFocus={setSelectedId} onOpen={select} onLinked={refresh} />
            </div>
          ) : selectedId ? (
            <LedgerChat chatId={selectedId} refreshKey={tick} onLoaded={syncItem} mode={mode} />
          ) : (
            <div className="flex flex-1 items-center justify-center p-4 text-sm text-muted-foreground">
              {items === null ? '…' : items.length ? t('lit.pick') : t('lit.noChats')}
            </div>
          )
        }
      />
    </SectionPage>
  )
}

type Mode = 'overview' | 'ledger'
const MODE_KEY = 'rp.libraryMode'
function readMode(): Mode {
  try {
    return localStorage.getItem(MODE_KEY) === 'ledger' ? 'ledger' : 'overview'
  } catch {
    return 'overview'
  }
}

/** Overview (the story: timeline and characters) | Ledger (the tables). Both edit the same record. */
function ModeSwitch({ mode, onMode }: { mode: Mode; onMode: (m: Mode) => void }) {
  const t = useT()
  const item = (m: Mode, label: string) => (
    <button
      type="button"
      aria-pressed={mode === m}
      data-testid={`mode-${m}`}
      onClick={() => onMode(m)}
      className={cn('min-h-8 flex-1 rounded px-2', mode === m ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground hover:text-foreground')}
    >
      {label}
    </button>
  )
  return (
    <div className="flex gap-1 rounded-md bg-muted p-0.5 text-xs" role="group" aria-label={t('lit.mode')}>
      {item('overview', t('lit.mode.overview'))}
      {item('ledger', t('lit.mode.ledger'))}
    </div>
  )
}

function ChatPicker({
  items,
  error,
  selectedId,
  onSelect,
  onRefresh,
  mode,
  onMode,
  onMap,
  mapOpen,
}: {
  mode: Mode
  onMode: (m: Mode) => void
  onMap: () => void
  mapOpen: boolean
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
        <Button variant="ghost" size="sm" className={cn('ml-auto size-9 p-0 md:size-7', mapOpen && 'bg-accent')} onClick={onMap} aria-label={t('lit.map.open')} title={t('lit.map.open')} aria-pressed={mapOpen} data-testid="map-open">
          <Graph className="size-4" aria-hidden="true" />
        </Button>
        <Button variant="ghost" size="sm" className="size-9 p-0 md:size-7" onClick={onRefresh} aria-label={t('lit.refresh')}>
          <ArrowsClockwise className="size-4" aria-hidden="true" />
        </Button>
      </div>
      <div className="flex flex-col gap-2 border-b border-border px-3 py-2">
        <ModeSwitch mode={mode} onMode={onMode} />
        <p className="text-[11px] text-muted-foreground">{t('lit.hint')}</p>
      </div>
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
                data-testid="ledger-chat"
                className={cn(
                  'flex min-h-11 w-full flex-col justify-center gap-0.5 rounded-md px-2 py-1.5 text-left text-sm',
                  c.id === selectedId ? 'bg-accent' : 'hover:bg-accent/50',
                  !c.hasData && 'opacity-60',
                )}
              >
                <span className="flex min-w-0 items-center gap-1.5 font-medium">
                  {c.hasData && <WorkerDot worker={c.worker} className="shrink-0" />}
                  <span className="min-w-0 truncate">{c.title}</span>
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
