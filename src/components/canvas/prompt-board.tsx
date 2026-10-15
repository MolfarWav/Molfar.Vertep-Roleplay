import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Crown,
  IdentificationCard,
  User,
  BookOpen,
  ChatsCircle,
  SlidersHorizontal,
  ClockCounterClockwise,
  Database,
  NotePencil,
  Scroll,
  Heartbeat,
  ArrowCounterClockwise,
  ArrowClockwise,
  CaretRight,
  Eye,
  EyeSlash
} from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useT } from '@/hooks/use-t'
import { toast } from 'sonner'
import {
  promptPreview,
  getChatPromptBoard,
  setChatPromptBoard,
  DEFAULT_PROMPT_HISTORY,
  type PromptSources,
  type PromptBoardItem,
  type PromptBoardHistory,
  type PromptBoardConfig
} from '@/lib/engine'
import { estimateTokens, formatTokens } from '@/lib/tokens'

interface PromptBoardProps {
  chatId: string | null
  chats: { id: string; title: string; name: string }[]
  onPickChat: (id: string) => void
  editable: boolean
  phoneList: boolean
}

interface BoardState {
  off: string[]
  history: PromptBoardHistory
}

interface WirePoint {
  x: number
  y: number
}

const KIND_ICONS: Record<PromptBoardItem['kind'], React.ComponentType<{ className?: string }>> = {
  main: Crown,
  card: IdentificationCard,
  persona: User,
  lorebook: BookOpen,
  example: ChatsCircle,
  preset: SlidersHorizontal,
  history: ClockCounterClockwise,
  databank: Database,
  note: NotePencil,
  memory: Scroll,
  dashboard: Heartbeat
}

const iconFor = (kind: PromptBoardItem['kind']) => {
  const Icon = KIND_ICONS[kind] ?? NotePencil
  return <Icon className="h-4 w-4" />
}

const stateText = (item: PromptBoardItem, t: (k: any, vars?: any) => string): string | null => {
  switch (item.state) {
    case 'preset-off': return t('canvas.prompt.state.presetOff')
    case 'condition': return t('canvas.prompt.state.condition')
    case 'not-this-generation': return t('canvas.prompt.state.notThisGen')
    case 'empty': return t('canvas.prompt.state.empty')
    case 'off': return null
    default: return null
  }
}

/** A part the chat can switch: on or off now (a part the preset or a condition left out has no switch). */
const switchable = (item: PromptBoardItem): boolean => item.kind !== 'history' && (item.state === 'on' || item.state === 'off')

const isOn = (item: PromptBoardItem, off: string[]): boolean => {
  if (item.kind === 'history') return true
  if (item.state !== 'on' && item.state !== 'off') return false
  return !off.includes(item.key)
}

const historySummary = (h: PromptBoardHistory, t: (k: any, vars?: any) => string): string => {
  if (h.lastN === 0 && h.only === 'all' && h.thinking) return t('canvas.prompt.history.summary.all')
  const parts: string[] = []
  if (h.lastN > 0) parts.push(t('canvas.prompt.history.summary.lastN', { n: h.lastN }))
  if (h.only === 'user') parts.push(t('canvas.prompt.history.summary.onlyUser'))
  if (h.only === 'char') parts.push(t('canvas.prompt.history.summary.onlyChar'))
  if (!h.thinking) parts.push(t('canvas.prompt.history.summary.noThinking'))
  return parts.join(' · ')
}

const equalHistory = (a: PromptBoardHistory, b: PromptBoardHistory): boolean =>
  a.lastN === b.lastN && a.only === b.only && a.thinking === b.thinking

const cleanConfig = (state: BoardState): PromptBoardConfig | null => {
  const off = state.off.length > 0 ? state.off : undefined
  const history = equalHistory(state.history, DEFAULT_PROMPT_HISTORY) ? undefined : state.history
  if (!off && !history) return null
  return { v: 1, ...(off ? { off } : {}), ...(history ? { history } : {}) }
}

export function PromptBoard({ chatId, chats, onPickChat, editable, phoneList }: PromptBoardProps) {
  const t = useT()
  const [sources, setSources] = useState<PromptSources | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [showText, setShowText] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(true)
  const [boardState, setBoardState] = useState<BoardState>({ off: [], history: { ...DEFAULT_PROMPT_HISTORY } })
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'idle'>('idle')
  const [past, setPast] = useState<BoardState[]>([])
  const [future, setFuture] = useState<BoardState[]>([])
  const [expandedPhoneKey, setExpandedPhoneKey] = useState<string | null>(null)

  const requestCounter = useRef(0)
  // `t` is a new function on every render; the loader reads it through a ref so it stays stable
  const tRef = useRef(t)
  tRef.current = t
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const boardRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const [wires, setWires] = useState<WirePoint[][]>([])
  const [cardRects, setCardRects] = useState<Map<string, DOMRect>>(new Map())

  const loadData = useCallback(async (id: string) => {
    const counter = ++requestCounter.current
    setPreviewLoading(true)
    try {
      const [preview, config] = await Promise.all([
        promptPreview(id),
        getChatPromptBoard(id)
      ])
      if (counter !== requestCounter.current) return
      setSources(preview.sources ?? null)
      if (config) {
        setBoardState({
          off: config.off ?? [],
          history: config.history ?? { ...DEFAULT_PROMPT_HISTORY }
        })
      } else {
        setBoardState({ off: [], history: { ...DEFAULT_PROMPT_HISTORY } })
      }
      setPast([])
      setFuture([])
    } catch {
      if (counter === requestCounter.current) toast(tRef.current('canvas.loadFailed'))
    } finally {
      if (counter === requestCounter.current) setPreviewLoading(false)
    }
  }, [])

  // after a saved change only the preview is fetched again: the switches and the undo stack stay
  const refreshPreview = useCallback(async (id: string) => {
    const counter = ++requestCounter.current
    setPreviewLoading(true)
    try {
      const preview = await promptPreview(id)
      if (counter === requestCounter.current) setSources(preview.sources ?? null)
    } catch {
      /* the last preview stays on screen */
    } finally {
      if (counter === requestCounter.current) setPreviewLoading(false)
    }
  }, [])

  useEffect(() => {
    if (chatId) loadData(chatId)
    else {
      setSources(null)
      setBoardState({ off: [], history: { ...DEFAULT_PROMPT_HISTORY } })
      setPast([])
      setFuture([])
    }
  }, [chatId, loadData])

  const save = useCallback(async (next: BoardState, prev: BoardState) => {
    if (!chatId) return
    setSaveState('saving')
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      try {
        await setChatPromptBoard(chatId, cleanConfig(next))
        setSaveState('saved')
        void refreshPreview(chatId)
      } catch {
        setBoardState(prev)
        setSaveState('saved')
        toast(t('canvas.saveFailed'))
      }
    }, 300)
  }, [chatId, t, refreshPreview])

  const commit = useCallback((next: BoardState) => {
    setPast(p => [...p, boardState].slice(-80))
    setFuture([])
    setBoardState(next)
    if (chatId) save(next, boardState)
  }, [boardState, chatId, save])

  const toggle = useCallback((key: string) => {
    const next = { ...boardState, off: boardState.off.includes(key) ? boardState.off.filter(k => k !== key) : [...boardState.off, key] }
    commit(next)
  }, [boardState, commit])

  const setHistory = useCallback((patch: Partial<PromptBoardHistory>) => {
    const next = { ...boardState, history: { ...boardState.history, ...patch } }
    commit(next)
  }, [boardState, commit])

  const undo = useCallback(() => {
    if (past.length === 0) return
    const prev = past[past.length - 1]
    setPast(p => p.slice(0, -1))
    setFuture(f => [boardState, ...f])
    setBoardState(prev)
    if (chatId) save(prev, boardState)
  }, [past, future, boardState, chatId, save])

  const redo = useCallback(() => {
    if (future.length === 0) return
    const next = future[0]
    setFuture(f => f.slice(1))
    setPast(p => [...p, boardState])
    setBoardState(next)
    if (chatId) save(next, boardState)
  }, [past, future, boardState, chatId, save])

  const turnAllOn = useCallback(() => {
    commit({ ...boardState, off: [] })
  }, [boardState, commit])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!boardRef.current?.contains(e.target as Node)) return
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA') return
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        redo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo])

  const boardItems = sources?.board
  const unsupported = sources !== null && !boardItems

  const itemsWithMeta = useMemo(() => {
    if (!boardItems) return []
    return boardItems.map(item => {
      const parts = sources?.parts.filter(p => p.key === item.key) ?? []
      const omitted = sources?.omitted.filter(o => o.key === item.key) ?? []
      const tokens = parts.reduce((sum, p) => sum + estimateTokens(p.text), 0)
      const isLitopys = item.key === 'plugin:litopys'
      const isDashboard = item.key === 'plugin:relations'
      const on = isOn(item, boardState.off)
      return { item, parts, omitted, tokens, on, isLitopys: isLitopys || isDashboard }
    })
  }, [boardItems, sources, boardState.off])

  const totalTokens = useMemo(() => {
    if (!sources) return 0
    return sources.parts.reduce((sum, p) => sum + estimateTokens(p.text), 0)
  }, [sources])

  const outputRows = useMemo(() => {
    return itemsWithMeta.filter(m => m.on && (m.tokens > 0 || m.isLitopys))
  }, [itemsWithMeta])

  // wires are drawn in the content's own coordinates, so they scroll with it
  const recomputeWires = useCallback(() => {
    if (!contentRef.current || phoneList) return
    const scrollRect = contentRef.current.getBoundingClientRect()
    const points: WirePoint[][] = []
    for (const row of outputRows) {
      const cardEl = cardRefs.current.get(row.item.key)
      const rowEl = rowRefs.current.get(row.item.key)
      if (!cardEl || !rowEl) continue
      const cardRect = cardEl.getBoundingClientRect()
      const rowRect = rowEl.getBoundingClientRect()
      const start: WirePoint = { x: cardRect.right - scrollRect.left, y: cardRect.top + cardRect.height / 2 - scrollRect.top }
      const end: WirePoint = { x: rowRect.left - scrollRect.left, y: rowRect.top + rowRect.height / 2 - scrollRect.top }
      points.push([start, end])
    }
    setWires(points)
  }, [outputRows, phoneList, sources, boardState.off])

  useEffect(() => {
    recomputeWires()
  }, [recomputeWires])

  useEffect(() => {
    if (!contentRef.current) return
    const ro = new ResizeObserver(() => recomputeWires())
    ro.observe(contentRef.current)
    return () => ro.disconnect()
  }, [recomputeWires])

  if (!chatId) {
    return (
      <div className="flex h-full flex-col" ref={boardRef}>
        <header className="flex flex-wrap items-center gap-2 border-b border-border bg-card px-3 py-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t('canvas.prompt.title')}
          </span>
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">{t('canvas.prompt.chat')}</span>
            <select
              data-guide="prompt.chat"
              className="h-8 rounded-md border border-border bg-background px-2 text-sm"
              value=""
              onChange={e => e.target.value && onPickChat(e.target.value)}
            >
              <option value="">{t('canvas.prompt.pickChat')}</option>
              {chats.map(c => (
                <option key={c.id} value={c.id}>{c.title}{c.name ? ` – ${c.name}` : ''}</option>
              ))}
            </select>
          </label>
        </header>
        <div className="flex flex-1 items-center justify-center p-8 text-center">
          <p className="text-sm text-muted-foreground">{t('canvas.prompt.pickChat')}</p>
        </div>
      </div>
    )
  }

  const chat = chats.find(c => c.id === chatId)
  const selected = itemsWithMeta.find(m => m.item.key === selectedKey) ?? null

  return (
    <div className="flex h-full flex-col" ref={boardRef}>
      <header className="flex flex-wrap items-center gap-2 border-b border-border bg-card px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t('canvas.prompt.title')}
        </span>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">{t('canvas.prompt.chat')}</span>
          <select
            data-guide="prompt.chat"
            className="h-8 rounded-md border border-border bg-background px-2 text-sm"
            value={chatId}
            onChange={e => onPickChat(e.target.value)}
          >
            {chats.map(c => (
              <option key={c.id} value={c.id}>{c.title}{c.name ? ` – ${c.name}` : ''}</option>
            ))}
          </select>
        </label>
        <div className="mx-1 h-5 w-px bg-border" />
        <Button variant="ghost" size="icon" onClick={undo} disabled={past.length === 0} title={t('canvas.undo')}>
          <ArrowCounterClockwise className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={redo} disabled={future.length === 0} title={t('canvas.redo')}>
          <ArrowClockwise className="h-4 w-4" />
        </Button>
        {boardState.off.length > 0 && (
          <Button variant="outline" size="sm" onClick={turnAllOn} disabled={!editable}>
            {t('canvas.prompt.turnAllOn')}
          </Button>
        )}
        <div className="flex-1" />
        <span className="text-xs text-muted-foreground" aria-live="polite">
          {saveState === 'saving' ? t('canvas.prompt.saving') : saveState === 'saved' ? t('canvas.prompt.saved') : ''}
        </span>
        {previewLoading && <span className="text-xs text-muted-foreground">{t('canvas.prompt.updating')}</span>}
        {!phoneList && (
          <Button
            data-guide="prompt.details"
            variant="ghost"
            size="icon"

            onClick={() => setDetailsOpen(v => !v)}
            title={t('canvas.prompt.details')}
          >
            <CaretRight className="h-4 w-4" />
          </Button>
        )}
      </header>

      {unsupported ? (
        <div className="flex flex-1 items-center justify-center p-8 text-center">
          <p className="text-sm text-muted-foreground">{t('canvas.prompt.unsupported')}</p>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          <div className={cn('min-w-0 flex-1', phoneList && 'overflow-y-auto')}>
            {phoneList ? (
              <div className="flex flex-col gap-2 p-3">
                {itemsWithMeta.map((m, mi) => (
                  <div key={m.item.key}>
                    <div
                      data-guide={m.item.kind === 'history' ? 'prompt.history' : mi === 0 ? 'prompt.part' : undefined}
                      className={cn(
                        'flex min-h-[40px] items-center gap-2 rounded-lg border border-border bg-card p-3',
                        !m.on && 'opacity-60',
                        expandedPhoneKey === m.item.key && 'ring-2 ring-primary'
                      )}
                      role="button"
                      tabIndex={0}
                      onClick={() => setExpandedPhoneKey(k => k === m.item.key ? null : m.item.key)}
                      onKeyDown={e => e.key === 'Enter' && setExpandedPhoneKey(k => k === m.item.key ? null : m.item.key)}
                    >
                      <span className="flex h-7 w-7 items-center justify-center rounded-md bg-muted">{iconFor(m.item.kind)}</span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold">{m.item.label}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          {m.on ? (
                            m.isLitopys ? t('canvas.prompt.atSend') : m.tokens === 0 ? t('canvas.prompt.state.empty') : `${formatTokens(m.tokens)} ${t('canvas.prompt.tokens')}`
                          ) : t('canvas.prompt.state.off')}
                        </div>
                      </div>
                      {switchable(m.item) && (
                        <button
                          role="switch"
                          aria-checked={m.on}
                          aria-label={m.item.label}
                          className={cn(
                            'relative h-6 w-11 rounded-full transition-colors',
                            m.on ? 'bg-primary' : 'bg-muted-foreground/30',
                            !editable && 'opacity-50'
                          )}
                          disabled={!editable}
                          onClick={e => { e.stopPropagation(); toggle(m.item.key) }}
                        >
                          <span className={cn(
                            'absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-background shadow transition-transform',
                            m.on && 'translate-x-5'
                          )} />
                        </button>
                      )}
                    </div>
                    {expandedPhoneKey === m.item.key && (
                      <div className="mt-1 rounded-lg border border-border bg-card p-3">
                        <PhoneDetails item={m} t={t} showText={showText} setShowText={setShowText} />
                      </div>
                    )}
                  </div>
                ))}
                <div data-guide="prompt.total" className="flex items-center justify-between border-t border-border px-3 py-2 text-sm">
                  <span className="text-muted-foreground">{t('canvas.prompt.total')}</span>
                  <strong>{formatTokens(totalTokens)} {t('canvas.prompt.tokens')}</strong>
                </div>
              </div>
            ) : (
              <div className="h-full overflow-auto p-4">
               <div className="relative" ref={contentRef} style={{ minWidth: 700 }}>
                <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" style={{ zIndex: 0 }}>
                  {wires.map((pts, i) => {
                    const [a, b] = pts
                    const dx = Math.max(40, Math.abs(b.x - a.x) * 0.5)
                    const d = `M${a.x},${a.y} C${a.x + dx},${a.y} ${b.x - dx},${b.y} ${b.x},${b.y}`
                    return <path key={i} d={d} fill="none" stroke="currentColor" strokeWidth={2} className="text-muted-foreground/40" />
                  })}
                </svg>
                <div className="relative z-10 flex items-start gap-24" style={{ minWidth: 700 }}>
                  <div className="flex flex-col gap-2" style={{ width: 260 }}>
                    {itemsWithMeta.map((m, mi) => {
                      const disabledReason = stateText(m.item, t)
                      const isHistory = m.item.kind === 'history'
                      const canToggle = !isHistory && editable && switchable(m.item)
                      return (
                        <div
                          key={m.item.key}
                          ref={el => { if (el) cardRefs.current.set(m.item.key, el) }}
                          data-guide={isHistory ? 'prompt.history' : mi === 0 ? 'prompt.part' : undefined}
                          className={cn(
                            'rounded-lg border border-border bg-card p-3 shadow-sm transition-all',
                            !m.on && 'opacity-60',
                            selectedKey === m.item.key && 'ring-2 ring-primary',
                            !canToggle && 'cursor-default'
                          )}
                          role="button"
                          tabIndex={0}
                          onClick={() => { setSelectedKey(m.item.key); setShowText(false) }}
                          onKeyDown={e => e.key === 'Enter' && setSelectedKey(m.item.key)}
                        >
                          <div className="flex items-center gap-2">
                            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-muted">{iconFor(m.item.kind)}</span>
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-semibold">{m.item.label}</div>
                              <div className="truncate text-xs text-muted-foreground">{t(`canvas.prompt.kind.${m.item.kind}` as any)}</div>
                            </div>
                          </div>
                          <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                            <span>
                              {disabledReason ? (
                                <span className="text-destructive/80">{disabledReason}</span>
                              ) : isHistory ? (
                                historySummary(boardState.history, t)
                              ) : m.on ? (
                                m.isLitopys ? t('canvas.prompt.atSend') : m.tokens === 0 ? t('canvas.prompt.state.empty') : `${formatTokens(m.tokens)} ${t('canvas.prompt.tokens')}`
                              ) : (
                                t('canvas.prompt.state.off')
                              )}
                            </span>
                            {m.item.kind !== 'history' && (
                              <button
                                role="switch"
                                aria-checked={m.on}
                                aria-label={m.item.label}
                                className={cn(
                                  'relative h-5 w-9 rounded-full transition-colors',
                                  m.on ? 'bg-primary' : 'bg-muted-foreground/30',
                                  !canToggle && 'cursor-not-allowed opacity-50'
                                )}
                                disabled={!canToggle}
                                onClick={e => { e.stopPropagation(); toggle(m.item.key) }}
                              >
                                <span className={cn(
                                  'absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-background shadow transition-transform',
                                  m.on && 'translate-x-4'
                                )} />
                              </button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  <div className="w-[340px] shrink-0">
                    <div data-guide="prompt.total" className="rounded-lg border border-border bg-card p-3 shadow-sm">
                      <div className="text-sm font-semibold">{t('canvas.prompt.output')}</div>
                      <div className="text-xs text-muted-foreground">{chat?.title ?? ''}</div>
                      <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                        <span>{t('canvas.prompt.total')}</span>
                        <strong>{formatTokens(totalTokens)} {t('canvas.prompt.tokens')}</strong>
                      </div>
                      <div className="mt-3 flex flex-col gap-1">
                        {outputRows.map((m, i) => (
                          <div
                            key={m.item.key}
                            ref={el => { if (el) rowRefs.current.set(m.item.key, el) }}
                            className="flex items-center gap-2 py-1 text-sm"
                          >
                            <span className="flex h-5 w-5 items-center justify-center rounded bg-muted text-xs font-semibold">{i + 1}</span>
                            <span className="flex-1 truncate">{m.item.label}</span>
                            <span className="text-xs text-muted-foreground">
                              {m.isLitopys ? t('canvas.prompt.atSend') : `${formatTokens(m.tokens)} ${t('canvas.prompt.tokens')}`}
                            </span>
                          </div>
                        ))}
                        {outputRows.length === 0 && (
                          <div className="py-4 text-center text-xs text-muted-foreground">
                            {t('canvas.prompt.nothingOn')}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
               </div>
              </div>
            )}
          </div>

          {!phoneList && detailsOpen && selected && (
            <aside className="w-[300px] shrink-0 border-l border-border bg-card">
              <div className="flex items-center justify-between border-b border-border px-3 py-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t('canvas.prompt.details')}
                </span>
                <Button variant="ghost" size="icon-xs" onClick={() => setDetailsOpen(false)}>
                  <CaretRight className="h-4 w-4" />
                </Button>
              </div>
              <DetailsPanel
                item={selected}
                t={t}
                showText={showText}
                setShowText={setShowText}
                history={boardState.history}
                setHistory={setHistory}
                editable={editable}
              />
            </aside>
          )}
        </div>
      )}
    </div>
  )
}

function PhoneDetails({ item, t, showText, setShowText }: {
  item: { item: PromptBoardItem; parts: any[]; omitted: any[]; tokens: number; on: boolean; isLitopys: boolean }
  t: (k: any, vars?: any) => string
  showText: boolean
  setShowText: (v: boolean) => void
}) {
  return (
    <div className="space-y-2 text-sm">
      <div className="font-semibold">{item.item.label}</div>
      <div className="text-xs text-muted-foreground">{t(`canvas.prompt.kind.${item.item.kind}` as any)}</div>
      {item.on && item.parts.length > 0 && (
        <>
          <div className="flex flex-col gap-1">
            {item.parts.map((p, i) => (
              <div key={i} className="flex items-baseline justify-between gap-2">
                <span className="min-w-0 flex-1 truncate">{p.label}</span>
                <span className="text-xs text-muted-foreground">{formatTokens(estimateTokens(p.text))}</span>
              </div>
            ))}
          </div>
          {item.omitted.length > 0 && (
            <div className="flex flex-col gap-1 text-xs text-muted-foreground">
              {item.omitted.map((o, i) => (
                <div key={i}>{o.label}: {o.reason}</div>
              ))}
            </div>
          )}
          <Button variant="ghost" size="sm" onClick={() => setShowText(!showText)}>
            {showText ? <EyeSlash className="mr-1.5 h-4 w-4" /> : <Eye className="mr-1.5 h-4 w-4" />}
            {showText ? t('canvas.prompt.hideText') : t('canvas.prompt.showText')}
          </Button>
          {showText && (
            <pre className="max-h-60 overflow-auto rounded-md bg-muted p-2 text-xs whitespace-pre-wrap">
              {item.parts.map(p => p.text).join('\n\n')}
            </pre>
          )}
        </>
      )}
    </div>
  )
}

function DetailsPanel({ item, t, showText, setShowText, history, setHistory, editable }: {
  item: { item: PromptBoardItem; parts: any[]; omitted: any[]; tokens: number; on: boolean; isLitopys: boolean }
  t: (k: any, vars?: any) => string
  showText: boolean
  setShowText: (v: boolean) => void
  history: PromptBoardHistory
  setHistory: (patch: Partial<PromptBoardHistory>) => void
  editable: boolean
}) {
  const isHistory = item.item.kind === 'history'
  const stateWord = item.item.state === 'on' ? (item.on ? t('canvas.prompt.state.on') : t('canvas.prompt.state.off')) : stateText(item.item, t) ?? t(`canvas.prompt.state.${item.item.state}` as any)

  return (
    <div className="space-y-3 p-3 text-sm">
      <div className="font-semibold">{item.item.label}</div>
      <div className="text-xs text-muted-foreground">{t(`canvas.prompt.kind.${item.item.kind}` as any)}</div>
      <div className="text-xs text-muted-foreground">{stateWord}</div>

      {isHistory ? (
        <div className="space-y-4">
          <div className="field">
            <label className="text-xs font-medium">{t('canvas.prompt.history.lastN')}</label>
            <Input
              type="number"
              min={0}
              step={1}
              value={history.lastN}
              onChange={e => setHistory({ lastN: Math.max(0, Number(e.target.value) || 0) })}
              className="mt-1 h-8 text-sm"
              disabled={!editable}
            />
          </div>
          <div className="field">
            <label className="text-xs font-medium">{t('canvas.prompt.history.only')}</label>
            <select
              className="mt-1 h-8 w-full rounded-md border border-border bg-background px-2 text-sm"
              value={history.only}
              onChange={e => setHistory({ only: e.target.value as PromptBoardHistory['only'] })}
              disabled={!editable}
            >
              <option value="all">{t('canvas.prompt.history.onlyAll')}</option>
              <option value="user">{t('canvas.prompt.history.onlyUser')}</option>
              <option value="char">{t('canvas.prompt.history.onlyChar')}</option>
            </select>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium">{t('canvas.prompt.history.thinking')}</span>
            <button
              role="switch"
              aria-checked={history.thinking}
              className={cn(
                'relative h-5 w-9 rounded-full transition-colors',
                history.thinking ? 'bg-primary' : 'bg-muted-foreground/30',
                !editable && 'opacity-50'
              )}
              disabled={!editable}
              onClick={() => setHistory({ thinking: !history.thinking })}
            >
              <span className={cn(
                'absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-background shadow transition-transform',
                history.thinking && 'translate-x-4'
              )} />
            </button>
          </div>
        </div>
      ) : (
        <>
          {item.on && item.parts.length > 0 && (
            <div className="flex flex-col gap-1">
              {item.parts.map((p, i) => (
                <div key={i} className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0 flex-1 truncate">{p.label}</span>
                  <span className="text-xs text-muted-foreground">{formatTokens(estimateTokens(p.text))}</span>
                </div>
              ))}
            </div>
          )}
          {item.omitted.length > 0 && (
            <div className="flex flex-col gap-1 text-xs text-muted-foreground">
              {item.omitted.map((o, i) => (
                <div key={i}>{o.label}: {o.reason}</div>
              ))}
            </div>
          )}
          {item.on && item.parts.length > 0 && (
            <>
              <Button variant="ghost" size="sm" onClick={() => setShowText(!showText)}>
                {showText ? <EyeSlash className="mr-1.5 h-4 w-4" /> : <Eye className="mr-1.5 h-4 w-4" />}
                {showText ? t('canvas.prompt.hideText') : t('canvas.prompt.showText')}
              </Button>
              {showText && (
                <pre className="max-h-60 overflow-auto rounded-md bg-muted p-2 text-xs whitespace-pre-wrap">
                  {item.parts.map(p => p.text).join('\n\n')}
                </pre>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}
