import { useEffect, useMemo, useState } from 'react'
import { CaretRight, GearSix, GlobeHemisphereWest } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { MasterDetail } from '@/components/shell/master-detail'
import { PaneTitle, SectionPage } from '@/components/shell/section-page'
import { useRelativeTime, useT } from '@/hooks/use-t'
import { cn } from '@/lib/utils'
import { useApp } from '@/lib/store'
import { listWorldChats, useWorldLive, type WorldChat } from '@/lib/world'
import { formatK, LevelChip } from '@/components/world/world-common'
import { WorldControls } from '@/components/world/world-controls'
import { WorldRuns } from '@/components/world/world-runs'
import { WorldSettingsDialog } from '@/components/world/world-settings'

const TAB_KEY = 'rp.worldTab'

const isTab = (v: string | null): v is 'overview' | 'runs' => v === 'overview' || v === 'runs'

function readTab(): 'overview' | 'runs' {
  try {
    const v = sessionStorage.getItem(TAB_KEY)
    return isTab(v) ? v : 'overview'
  } catch {
    return 'overview'
  }
}

function saveTab(v: 'overview' | 'runs') {
  try {
    sessionStorage.setItem(TAB_KEY, v)
  } catch {
    // storage is optional
  }
}

type ChatListProps = {
  items: WorldChat[] | null | 'missing'
  listError: string
  selectedId: string | null
  onSelect: (id: string) => void
  onOpenSettings: () => void
}

function ChatList({ items, listError, selectedId, onSelect, onOpenSettings }: ChatListProps) {
  const t = useT()
  const rel = useRelativeTime()
  return (
    <aside aria-label={t('world.list.aria')} className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <PaneTitle section="world" icon={<GlobeHemisphereWest className="size-4 text-primary" aria-hidden="true" />} />
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto size-9 p-0 md:size-7"
          onClick={onOpenSettings}
          aria-label={t('world.settings.open')}
          title={t('world.settings.open')}
        >
          <GearSix className="size-4" aria-hidden="true" />
        </Button>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        {listError && <p className="p-3 text-xs text-destructive">{t('world.list.loadError', { error: listError })}</p>}
        {items === 'missing' && <p className="p-3 text-xs text-muted-foreground">{t('world.missing')}</p>}
        {Array.isArray(items) && items.length === 0 && !listError && (
          <div className="flex flex-col items-center justify-center gap-3 p-6 text-center">
            <p className="text-sm text-muted-foreground">{t('world.list.empty')}</p>
            <Button variant="outline" onClick={() => useApp.getState().setView('chats')}>
              {t('world.list.toChats')}
            </Button>
          </div>
        )}
        <ul className="flex flex-col p-1.5">
          {Array.isArray(items) &&
            items.map((c) => {
              const failed = !!c.error
              return (
                <li key={c.chatId}>
                  <button
                    type="button"
                    onClick={() => onSelect(c.chatId)}
                    aria-current={c.chatId === selectedId ? 'true' : undefined}
                    data-testid="world-chat"
                    className={cn(
                      'relative flex min-h-12 w-full flex-col justify-center gap-0.5 rounded-md px-2 py-1.5 text-left text-sm max-md:pr-7',
                      c.chatId === selectedId ? 'bg-accent' : 'hover:bg-accent/50',
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-1.5 font-medium">
                      {failed && <span role="img" aria-label={t('world.list.failed')} className="size-2 shrink-0 rounded-full bg-destructive" />}
                      <span className="min-w-0 truncate">{c.title || c.cards.join(', ')}</span>
                      <LevelChip level={c.level} className="ml-auto" />
                    </span>
                    <span className={cn('truncate text-[11px]', failed ? 'text-destructive' : 'text-muted-foreground')}>
                      {t('world.list.counts', { n: c.records, f: c.fronts })}
                      {' · '}
                      {failed ? t('world.list.failed') : c.lastRunAt ? t('world.list.ran', { when: rel(c.lastRunAt) }) : t('world.list.never')}
                    </span>
                    {c.usage.runs > 0 && (
                      <span className="truncate text-[10px] text-muted-foreground">
                        {t('world.list.tokens', { tokens: formatK(c.usage.input + c.usage.output) })}
                      </span>
                    )}
                    <CaretRight className="absolute right-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground md:hidden" aria-hidden="true" />
                  </button>
                </li>
              )
            })}
        </ul>
      </ScrollArea>
    </aside>
  )
}

type ChatDetailProps = {
  chatId: string
  items: WorldChat[] | null | 'missing'
  tab: 'overview' | 'runs'
  onTabChange: (tab: 'overview' | 'runs') => void
  onOpenSettings: () => void
}

function ChatDetail({ chatId, items, tab, onTabChange, onOpenSettings }: ChatDetailProps) {
  const t = useT()
  const chat = Array.isArray(items) ? items.find((c) => c.chatId === chatId) : undefined
  // a chat with the DM off and no records is not in the list, but a sheet can send you to it
  const storeTitle = useApp((s) => s.chats.find((c) => c.id === chatId)?.title)
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-border p-3 md:p-5">
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <h2 className="truncate font-heading text-xl max-md:sr-only">{chat?.title || storeTitle || ''}</h2>
            {chat && chat.cards.length > 0 && <p className="truncate text-sm text-muted-foreground">{chat.cards.join(', ')}</p>}
          </div>
          <Button variant="outline" onClick={() => useApp.getState().openChat(chatId)} className="self-start max-md:h-10">
            {t('world.openChat')}
          </Button>
        </div>
        <Tabs value={tab} onValueChange={(v) => { if (isTab(v)) onTabChange(v) }} className="mt-3">
          <TabsList className="max-md:h-10 max-md:w-full">
            <TabsTrigger value="overview" className="max-md:h-10">
              {t('world.tab.overview')}
            </TabsTrigger>
            <TabsTrigger value="runs" className="max-md:h-10">
              {t('world.tab.runs')}
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3 md:p-5">
        {tab === 'overview' && <WorldControls key={chatId} chatId={chatId} where="hub" wide onOpenSettings={onOpenSettings} />}
        {tab === 'runs' && <WorldRuns key={chatId} chatId={chatId} />}
      </div>
    </div>
  )
}

export function WorldView() {
  const t = useT()
  const [items, setItems] = useState<WorldChat[] | null | 'missing'>(null)
  const [listError, setListError] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [tab, setTab] = useState<'overview' | 'runs'>(readTab)
  const [tick, setTick] = useState(0)
  const focusChat = useApp((s) => s.focusWorldChatId)
  const liveViews = useWorldLive((s) => s.views)

  const current = Array.isArray(items) ? items.find((c) => c.chatId === selectedId) : undefined
  const count = Array.isArray(items) ? items.length : undefined
  const storeTitle = useApp((s) => s.chats.find((c) => c.id === selectedId)?.title)

  useEffect(() => {
    if (!focusChat) return
    useApp.setState({ focusWorldChatId: null })
    setSelectedId(focusChat)
    setDetailOpen(true)
    setTab('overview')
    saveTab('overview')
  }, [focusChat])

  useEffect(() => {
    let live = true
    const load = () => {
      listWorldChats()
        .then((chats) => {
          if (!live) return
          if (chats === null) {
            setItems('missing')
            return
          }
          setItems(chats)
          setListError('')
          setSelectedId((cur) => {
            if (cur) return cur
            const firstOn = chats.find((c) => c.level !== 'off')
            return firstOn?.chatId ?? chats[0]?.chatId ?? null
          })
        })
        .catch((e: unknown) => {
          if (!live) return
          setListError(e instanceof Error ? e.message : String(e))
        })
    }
    void load()
    const id = setInterval(() => {
      if (!document.hidden) void load()
    }, 15_000)
    return () => {
      live = false
      clearInterval(id)
    }
  }, [tick])

  const selectedViewSig = useMemo(() => {
    const v = selectedId ? liveViews[selectedId] : undefined
    if (!v) return ''
    return [v.lastRunAt, v.lastError?.at, v.settings.level].join('|')
  }, [liveViews, selectedId])

  useEffect(() => {
    if (!selectedViewSig) return
    setTick((n) => n + 1)
  }, [selectedViewSig])

  const selectChat = (id: string) => {
    setSelectedId(id)
    setDetailOpen(true)
  }

  const handleTabChange = (v: 'overview' | 'runs') => {
    setTab(v)
    saveTab(v)
  }

  return (
    <SectionPage section="world" count={count} hideOnPhone={detailOpen && !!selectedId}>
      <MasterDetail
        detailOpen={detailOpen && !!selectedId}
        onBack={() => setDetailOpen(false)}
        detailTitle={current?.title || storeTitle}
        masterWidth="w-72"
        master={<ChatList items={items} listError={listError} selectedId={selectedId} onSelect={selectChat} onOpenSettings={() => setSettingsOpen(true)} />}
        detail={
          selectedId ? (
            <ChatDetail chatId={selectedId} items={items} tab={tab} onTabChange={handleTabChange} onOpenSettings={() => setSettingsOpen(true)} />
          ) : (
            <div className="flex flex-1 items-center justify-center p-4 text-sm text-muted-foreground">
              {items === null ? '…' : t('world.list.pick')}
            </div>
          )
        }
      />
      <WorldSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} chatId={selectedId} chatTitle={current?.title || storeTitle || ''} />
    </SectionPage>
  )
}
