import { useEffect, useMemo, useState } from 'react'
import { Robot } from '@phosphor-icons/react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useT } from '@/hooks/use-t'
import { insertIntoComposer, useAgentsLive, type AgentPanel, type AgentPanelSet, type PanelPlace, type PanelWidget } from '@/lib/agents'
import { cn } from '@/lib/utils'

const PLACES: PanelPlace[] = ['top1', 'top2', 'float']
const EMPTY: AgentPanelSet[] = []

/** The place a panel is shown in: the one the chat chose for the agent, else the panel's own, else the floating button. */
const placeOf = (set: AgentPanelSet, p: AgentPanel): PanelPlace =>
  (PLACES as string[]).includes(set.show ?? '') ? (set.show as PanelPlace) : p.place ?? 'float'

const fmt = (v: unknown): string => (typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toFixed(1)) : typeof v === 'boolean' ? (v ? '✓' : '–') : String(v ?? '—'))
const rows = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object') : [])

/** One widget of a panel. The checker has vetted the file; a field that is missing still shows as a dash. */
function Widget({ w, set, chatId, compact }: { w: PanelWidget; set: AgentPanelSet; chatId: string; compact?: boolean }) {
  const t = useT()
  const field = w.bind ? set.schema[w.bind] : undefined
  const value = w.bind ? set.own[w.bind] : undefined
  const label = w.label ?? w.bind ?? ''

  if (w.w === 'actions') {
    return (
      <div className="flex flex-wrap gap-1.5">
        {(w.items ?? []).map((it) => (
          <button key={it.label} type="button" onClick={() => insertIntoComposer(chatId, it.send)}
            className="rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium hover:border-primary/60 hover:bg-accent max-md:min-h-10">
            {it.label}
          </button>
        ))}
      </div>
    )
  }
  if (w.w === 'html') return <p className="text-[11px] text-muted-foreground">{t('ag.widget.html')}</p>

  if (w.w === 'meter' || w.w === 'counter' || w.w === 'number') {
    const n = typeof value === 'number' ? value : 0
    const prev = typeof set.prev?.[w.bind ?? ''] === 'number' ? (set.prev?.[w.bind ?? ''] as number) : null
    const diff = w.w === 'number' && w.delta && prev !== null && prev !== n ? n - prev : 0
    const max = w.w === 'counter' ? (w.of ?? n) : field?.max ?? Math.max(n, 1)
    const min = w.w === 'counter' ? 0 : field?.min ?? 0
    const shown = w.w === 'counter' ? t('ag.widget.of', { n: fmt(n), max: fmt(max) }) : w.w === 'meter' && field?.max !== undefined ? `${fmt(n)} / ${fmt(max)}` : fmt(n)
    if (compact) {
      return (
        <span className="whitespace-nowrap">
          <span className="text-muted-foreground">{label} </span><span className="font-semibold tabular-nums">{shown}</span>
        </span>
      )
    }
    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-baseline justify-between gap-2 text-xs">
          <span className="text-muted-foreground">{label}</span>
          <span className="font-semibold tabular-nums">
            {shown}
            {diff !== 0 && <span className={cn('ml-1.5 text-[10px] font-medium', diff > 0 ? 'text-emerald-500' : 'text-amber-500')}>{diff > 0 ? '+' : ''}{fmt(diff)}</span>}
          </span>
        </div>
        {w.w !== 'number' && (
          <div role="meter" aria-label={label} aria-valuemin={min} aria-valuemax={max} aria-valuenow={n} className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-violet-500" style={{ width: `${max > min ? Math.max(0, Math.min(100, ((n - min) / (max - min)) * 100)) : 0}%` }} />
          </div>
        )}
      </div>
    )
  }

  if (compact) {
    if (w.w === 'text' && typeof value === 'string' && value) return <span className="truncate"><span className="text-muted-foreground">{label} </span>{value}</span>
    return null
  }

  if (w.w === 'text') {
    return (
      <div className="flex flex-col gap-0.5 text-xs">
        {label && <span className="text-muted-foreground">{label}</span>}
        <p className="whitespace-pre-wrap leading-relaxed">{typeof value === 'string' && value ? value : '—'}</p>
      </div>
    )
  }

  // table, list, log: a list of entries
  const list = rows(value)
  const cols = w.w === 'table' ? w.columns ?? Object.keys(field?.item ?? {}) : Object.keys(field?.item ?? {})
  const shownRows = w.w === 'log' ? list.slice(-(w.last ?? 5)) : list.slice(0, 20)
  return (
    <div className="flex flex-col gap-1 text-xs">
      {label && <span className="text-muted-foreground">{label}</span>}
      {shownRows.length === 0 ? <span className="text-[11px] text-muted-foreground">—</span> : w.w === 'table' ? (
        <table className="w-full text-left">
          <thead><tr>{cols.map((c) => <th key={c} className="pr-2 pb-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{c}</th>)}</tr></thead>
          <tbody>{shownRows.map((r, i) => <tr key={i}>{cols.map((c) => <td key={c} className="pr-2 py-0.5 tabular-nums">{fmt(r[c])}</td>)}</tr>)}</tbody>
        </table>
      ) : (
        <ul className="flex flex-col gap-0.5">
          {shownRows.map((r, i) => <li key={i} className="leading-snug">{cols.map((c) => fmt(r[c])).join(' · ')}</li>)}
        </ul>
      )}
    </div>
  )
}

/** The agents' panels that live in one of the two bars above the chat: one row of values per bar. */
export function AgentBars({ chatId }: { chatId: string }) {
  const sets = useAgentsLive((s) => s.panels[chatId]) ?? EMPTY
  const bars = (['top1', 'top2'] as PanelPlace[]).map((place) => ({
    place,
    parts: sets.flatMap((set) => set.panels.filter((p) => placeOf(set, p) === place).flatMap((p) => p.widgets.map((w, i) => ({ key: `${set.agent}-${p.id}-${i}`, w, set })))),
  })).filter((b) => b.parts.length)
  if (!bars.length) return null
  return (
    <div className="relative z-10 flex flex-col border-b border-border bg-card" data-testid="agent-bars">
      {bars.map((b) => (
        <div key={b.place} className="flex flex-wrap items-center gap-x-4 gap-y-0.5 px-3 py-1 text-xs">
          {b.parts.map((x) => <Widget key={x.key} w={x.w} set={x.set} chatId={chatId} compact />)}
        </div>
      ))}
    </div>
  )
}

const seenKey = (chatId: string) => `vertep:agents-panel-seen:${chatId}`
const readSeen = (chatId: string): number => {
  try {
    const v = Number(localStorage.getItem(seenKey(chatId)))
    if (v > 0) return v
    localStorage.setItem(seenKey(chatId), String(Date.now()))
  } catch { /* storage blocked: every change counts as seen */ }
  return Date.now()
}

/** The floating button over the composer: a number of changes since it was last opened; a tap opens the panels that sit there. */
export function AgentFloat({ chatId }: { chatId: string }) {
  const t = useT()
  const sets = useAgentsLive((s) => s.panels[chatId]) ?? EMPTY
  const runs = useAgentsLive((s) => s.runs[chatId])
  const [open, setOpen] = useState(false)
  const [seen, setSeen] = useState(() => readSeen(chatId))
  useEffect(() => { setSeen(readSeen(chatId)) }, [chatId])
  const shown = useMemo(() => sets.map((set) => ({ set, panels: set.panels.filter((p) => placeOf(set, p) === 'float') })).filter((x) => x.panels.length), [sets])
  const agents = new Set(shown.map((x) => x.set.agent))
  const unseen = (runs ?? []).filter((r) => agents.has(r.agent) && r.status === 'ok' && r.at > seen && (r.writes?.length ?? 0) > 0).length
  if (!shown.length) return null

  const onOpen = (v: boolean) => {
    setOpen(v)
    if (v) {
      const now = Date.now()
      setSeen(now)
      try { localStorage.setItem(seenKey(chatId), String(now)) } catch { /* storage blocked */ }
    }
  }
  return (
    <div className="pointer-events-none absolute -top-11 right-3 z-20 flex justify-end max-md:-top-12">
      <Popover open={open} onOpenChange={onOpen}>
        <PopoverTrigger
          className="pointer-events-auto relative flex size-9 items-center justify-center rounded-full border border-border bg-card text-violet-500 shadow-md hover:bg-accent max-md:size-11"
          aria-label={unseen ? t('ag.panel.openNew', { n: unseen }) : t('ag.panel.open')}
          title={t('ag.panel.open')}
          data-testid="agent-float"
        >
          <Robot className="size-5" aria-hidden="true" />
          {unseen > 0 && <span className="absolute -top-1 -right-1 flex min-w-4 items-center justify-center rounded-full bg-violet-500 px-1 text-[10px] font-bold text-white tabular-nums">{unseen}</span>}
        </PopoverTrigger>
        <PopoverContent side="top" align="end" className="max-h-[70dvh] w-[min(360px,calc(100vw-16px))] overflow-y-auto p-3">
          <div className="flex flex-col gap-4">
            {shown.map(({ set, panels }) => panels.map((p) => (
              <section key={`${set.agent}-${p.id}`} className="flex flex-col gap-2" aria-label={p.title}>
                <h3 className="text-xs font-semibold">{p.title}<span className="ml-1.5 font-normal text-muted-foreground">{set.name}</span></h3>
                {p.widgets.map((w, i) => <Widget key={i} w={w} set={set} chatId={chatId} />)}
              </section>
            )))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
