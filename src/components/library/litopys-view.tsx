import { useCallback, useEffect, useState } from 'react'
import { ArrowsClockwise, Scroll } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { MasterDetail } from '@/components/shell/master-detail'
import { PaneTitle, SectionPage } from '@/components/shell/section-page'
import { useRelativeTime, useT } from '@/hooks/use-t'
import { cn } from '@/lib/utils'
import { fetchLitChats, type LitChatItem } from './litopys-api'
import { LedgerChat } from './ledger'
import { WorkerDot } from './worker-dot'

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e))

/**
 * The Library section (section id `litopys`, so the rail position stays): what Litopys keeps per
 * chat. Left, the chats with the worker's state; right, the chosen chat's Ledger, where chapters,
 * facts and proposals are edited. Overview (M4c) comes next.
 */
export function LitopysView() {
  const t = useT()
  const [items, setItems] = useState<LitChatItem[] | null>(null)
  const [listError, setListError] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [tick, setTick] = useState(0)

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
        detail={
          selectedId ? (
            <LedgerChat chatId={selectedId} refreshKey={tick} />
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

/** Overview | Ledger. Overview is the next step (M4c): shown, not yet usable. */
function ModeSwitch() {
  const t = useT()
  return (
    <div className="flex gap-1 rounded-md bg-muted p-0.5 text-xs" role="group" aria-label={t('lit.mode')}>
      <Tooltip>
        <TooltipTrigger
          render={
            <button type="button" disabled aria-pressed={false} className="min-h-8 flex-1 cursor-not-allowed rounded px-2 text-muted-foreground opacity-60">
              {t('lit.mode.overview')}
            </button>
          }
        />
        <TooltipContent>{t('lit.mode.overviewSoon')}</TooltipContent>
      </Tooltip>
      <button type="button" aria-pressed className="min-h-8 flex-1 rounded bg-background px-2 font-medium shadow-sm" data-testid="mode-ledger">
        {t('lit.mode.ledger')}
      </button>
    </div>
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
      <div className="flex flex-col gap-2 border-b border-border px-3 py-2">
        <ModeSwitch />
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
