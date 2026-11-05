// "What fired" (#253): one panel for what went into the prompt of the chat's last reply and, counted, of the whole chat. It replaces
// the old "Lorebook activity" sheet (a dry run of the next reply) and opens from the chat header's Fired button.
// Tabs are the sources (lorebooks, Litopys, Data Bank, vectors); each source keeps its hue. The data is
// `fired-log/<chatId>.json` (engine plugin), `litopys/fired/<chatId>.json` and the memory trace; the rows are the ones the
// Canvas memory view and the lorebook panel already draw.

import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowClockwise, ArrowRight, Copy, Lightning } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { ScrollStrip } from '@/components/ui/scroll-strip'
import { TONES } from '@/components/ui/tone'
import { useRelativeTime, useT } from '@/hooks/use-t'
import { cn, copyText } from '@/lib/utils'
import { useApp } from '@/lib/store'
import { openMemoryTrace } from '@/lib/memory-trace-open'
import { buildFiredReport } from '@/lib/fired'
import { loadFired, type FiredAll } from '@/lib/fired-load'
import type { MsgKey } from '@/lib/i18n'
import {
  BankChat, BankLast, ChronChat, ChronLast, LoreChat, LoreLast, Notice, TAB_ICON, TAB_TONE, VectorsTab,
  type FiredScope, type FiredTab,
} from '@/components/chat/fired-tabs'

const TABS: readonly FiredTab[] = ['lore', 'chron', 'bank', 'vec']
const TAB_KEY = 'rp.fired.tab'
const SCOPE_KEY = 'rp.fired.scope'

function readPick<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const v = localStorage.getItem(key)
    return allowed.includes(v as T) ? (v as T) : fallback
  } catch {
    return fallback
  }
}
function writePick(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* storage is optional: the panel opens on the first tab next time */
  }
}

/** The number on a tab: how many things of that source went in (last reply) or were counted (whole chat). null = nothing to show. */
function tabCount(tab: FiredTab, scope: FiredScope, all: FiredAll | null): number | null {
  if (!all) return null
  if (tab === 'lore') return scope === 'last' ? (all.log.data?.last?.fired.length ?? null) : all.log.data ? Object.keys(all.log.data.lore).length : null
  if (tab === 'bank') return scope === 'last' ? (all.trace.databank ? all.trace.databank.hits.filter((h) => h.state === 'in').length : null) : all.log.data ? Object.keys(all.log.data.bank).length : null
  if (tab === 'chron') {
    if (scope === 'chat') return all.lit.data ? all.lit.data.factsTotal + all.lit.data.chaptersTotal : null
    const lit = all.trace.litopys
    return lit ? lit.facts.filter((f) => f.state === 'in').length + lit.chapters.filter((c) => c.state === 'in').length : null
  }
  return null
}

export function FiredPanel({ chatId, title, open, onOpenChange, wantTab, onOpenCarries }: {
  chatId: string | null
  /** the chat's title, for the copied report */
  title: string
  open: boolean
  onOpenChange: (open: boolean) => void
  /** a tab asked for by whoever opened the panel (the carries panel's "Why?" asks for Litopys) */
  wantTab?: FiredTab | null
  onOpenCarries: () => void
}) {
  const t = useT()
  const ago = useRelativeTime()
  const [tab, setTab] = useState<FiredTab>(() => readPick(TAB_KEY, TABS, 'lore'))
  const [scope, setScope] = useState<FiredScope>(() => readPick(SCOPE_KEY, ['last', 'chat'] as const, 'last'))
  const [all, setAll] = useState<FiredAll | null>(null)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const seq = useRef(0)

  const load = useCallback(async () => {
    if (!chatId) return
    const mine = ++seq.current
    setLoading(true)
    setFailed(false)
    try {
      const next = await loadFired(chatId)
      if (mine === seq.current) setAll(next)
    } catch {
      if (mine === seq.current) setFailed(true)
    } finally {
      if (mine === seq.current) setLoading(false)
    }
  }, [chatId])

  // each opening reads the files again; a chat switch drops what the old chat had
  useEffect(() => {
    setAll(null)
  }, [chatId])
  useEffect(() => {
    if (open) void load()
  }, [open, load])
  useEffect(() => {
    if (open && wantTab) setTab(wantTab)
  }, [open, wantTab])

  const pickTab = (next: FiredTab) => {
    setTab(next)
    writePick(TAB_KEY, next)
  }
  const pickScope = (next: FiredScope) => {
    setScope(next)
    writePick(SCOPE_KEY, next)
  }
  const refresh = () => {
    setRefreshKey((n) => n + 1)
    void load()
  }
  const copy = async () => {
    if (!all) return
    const ok = await copyText(buildFiredReport(title, all.log.data, all.trace, all.lit.data))
    if (ok) toast.success(t('fired.copied'))
    else toast.error(t('fired.copyFailed'))
  }
  const date = (ts: number) => new Date(ts).toLocaleDateString()
  const goLorebooks = () => {
    onOpenChange(false)
    useApp.getState().navigate('lorebooks')
  }

  const last = all?.log.data?.last ?? null
  const showScope = tab !== 'vec'
  const meta = showScope && scope === 'last' && tab === 'lore' && last ? t('fired.meta.last', { when: ago(last.at), by: last.by || '—' }) : null

  const body = () => {
    if (!chatId) return <Notice title={t('fired.noChat')} />
    if (failed) {
      return (
        <Notice title={t('fired.loadFailed')} action={<Button variant="outline" size="sm" className="min-h-10 sm:min-h-8" onClick={refresh}>{t('fired.retry')}</Button>} />
      )
    }
    if (!all) return <Skeleton />
    const downNote = (what: 'log' | 'lit') => (
      <Notice title={t(what === 'log' ? 'fired.down.logTitle' : 'fired.down.litTitle')} action={<Button variant="outline" size="sm" className="min-h-10 sm:min-h-8" onClick={refresh}>{t('fired.retry')}</Button>}>
        {t(what === 'log' ? 'fired.down.log' : 'fired.down.lit')}
      </Notice>
    )
    const fresh = (
      <Notice title={t('fired.fresh.title')}>{t('fired.fresh.body')}</Notice>
    )
    if (tab === 'vec') return <VectorsTab chatId={chatId} all={all} refreshKey={refreshKey} t={t} />
    if (tab === 'lore') {
      if (all.log.down) return downNote('log')
      const log = all.log.data
      if (!log) return fresh
      if (scope === 'chat') return <LoreChat log={log} t={t} date={date} />
      if (!log.last) return fresh
      if (log.last.fired.length === 0 && log.last.blocked.length === 0 && log.last.skipped.length === 0) {
        return (
          <Notice
            title={t('fired.lore.emptyTitle')}
            action={<Button variant="outline" size="sm" className="min-h-10 sm:min-h-8" onClick={goLorebooks}>{t('fired.lore.emptyAction')}</Button>}
          >
            {t('fired.lore.emptyBody')}
          </Notice>
        )
      }
      return <LoreLast log={log} t={t} />
    }
    if (tab === 'chron') {
      if (scope === 'chat') {
        if (all.lit.down) return downNote('lit')
        return all.lit.data ? <ChronChat lit={all.lit.data} t={t} date={date} /> : fresh
      }
      return <ChronLast all={all} t={t} />
    }
    if (scope === 'chat') {
      if (all.log.down) return downNote('log')
      return all.log.data ? <BankChat log={all.log.data} t={t} date={date} /> : fresh
    }
    return <BankLast all={all} t={t} />
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 sm:max-w-lg" data-testid="fired-panel">
        <SheetHeader className="border-b border-border pb-3">
          <SheetTitle className="flex items-center gap-2">
            <Lightning className={cn('size-5', TONES.sky.ink)} aria-hidden="true" />
            {t('fired.title')}
          </SheetTitle>
          <SheetDescription>{t('fired.subtitle')}</SheetDescription>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {showScope && (
              <div role="group" aria-label={t('fired.scope')} className="inline-flex rounded-lg bg-muted p-[3px]" data-testid="fired-scope">
                {(['last', 'chat'] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={scope === s}
                    onClick={() => pickScope(s)}
                    className={cn(
                      'min-h-10 rounded-md px-3 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/60 sm:min-h-8',
                      scope === s ? 'bg-background text-foreground shadow-sm' : 'text-foreground/60 hover:text-foreground',
                    )}
                  >
                    {t(s === 'last' ? 'fired.scope.last' : 'fired.scope.chat')}
                  </button>
                ))}
              </div>
            )}
            <span className="ml-auto flex items-center gap-1.5">
              <Button variant="outline" size="sm" className="min-h-10 sm:min-h-8" onClick={refresh} disabled={loading} aria-label={t('fired.refresh')} title={t('fired.refresh')}>
                <ArrowClockwise className={cn('size-4', loading && 'animate-spin motion-reduce:animate-none')} aria-hidden="true" />
              </Button>
              <Button variant="outline" size="sm" className="min-h-10 sm:min-h-8" onClick={() => void copy()} disabled={!all} aria-label={t('fired.copy')} title={t('fired.copy')}>
                <Copy className="size-4" aria-hidden="true" />
              </Button>
            </span>
          </div>
        </SheetHeader>

        <ScrollStrip className="border-b border-border px-3 py-2">
          <div role="tablist" aria-label={t('fired.tabs')} className="flex w-max gap-1.5">
            {TABS.map((k) => {
              const Icon = TAB_ICON[k]
              const n = showScope ? tabCount(k, scope, all) : null
              const on = tab === k
              return (
                <button
                  key={k}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  data-tab={k}
                  onClick={() => pickTab(k)}
                  className={cn(
                    'inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/60 sm:min-h-9',
                    on ? TONES[TAB_TONE[k]].fill : 'border-transparent text-foreground/70 hover:bg-accent hover:text-foreground',
                  )}
                >
                  <span aria-hidden="true" className={cn('size-2 shrink-0 rounded-sm', TONES[TAB_TONE[k]].square)} />
                  <Icon className={cn('size-4 shrink-0', on && TONES[TAB_TONE[k]].ink)} aria-hidden="true" />
                  {t(`fired.tab.${k}` as MsgKey)}
                  {n ? <span className="rounded-full bg-background/70 px-1.5 text-caption tabular-nums">{n}</span> : null}
                </button>
              )
            })}
          </div>
        </ScrollStrip>

        <div className="min-h-0 flex-1 overflow-y-auto p-3" data-testid="fired-body">
          <div className="flex flex-col gap-3 [&>*]:shrink-0">
            {meta ? <p className="px-1 text-caption text-muted-foreground">{meta}</p> : null}
            {body()}
          </div>
        </div>

        <div className="flex flex-col gap-1 border-t border-border px-3 py-2 sm:flex-row sm:justify-between">
          <Button variant="ghost" size="sm" className="min-h-10 justify-start sm:min-h-8" onClick={() => { onOpenChange(false); onOpenCarries() }}>
            {t('fired.link.carries')}
            <ArrowRight className="size-4" aria-hidden="true" />
          </Button>
          {chatId ? (
            <Button variant="ghost" size="sm" className="min-h-10 justify-start sm:min-h-8" onClick={() => { onOpenChange(false); openMemoryTrace(chatId) }}>
              {t('fired.link.canvas')}
              <ArrowRight className="size-4" aria-hidden="true" />
            </Button>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  )
}

function Skeleton() {
  return (
    <div className="flex flex-col gap-3" aria-hidden="true" data-testid="fired-skeleton">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-16 animate-pulse rounded-xl bg-muted-foreground/15 motion-reduce:animate-none" />
      ))}
    </div>
  )
}
