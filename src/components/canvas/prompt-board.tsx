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
  MagnifyingGlass,
  ArrowCounterClockwise,
  ArrowClockwise,
  CaretRight,
  Eye,
  EyeSlash
} from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ChatPicker } from '@/components/canvas/chat-picker'
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
  type PromptBoardConfig,
  type PromptSourcePart,
  type PromptSourceOmitted
} from '@/lib/engine'
import { useApp, useChat } from '@/lib/store'
import { estimateTokens, formatTokens } from '@/lib/tokens'

interface PromptBoardProps {
  chatId: string | null
  chats: { id: string; title: string; name: string; updatedAt?: number }[]
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

/** localStorage, guarded: the board must never die because storage is blocked or full. */
const readLS = (key: string): string | null => {
  try { return localStorage.getItem(key) } catch { return null }
}
const writeLS = (key: string, value: string): void => {
  try { localStorage.setItem(key, value) } catch { /* the board works on without memory */ }
}

/**
 * A part the "Only what is sent" filter hides (#43): left out by the preset
 * or a condition, not for this kind of reply, rendering empty — or switched
 * off for this chat. History always stays: it has no switch and anchors the board.
 */
const hiddenWhenSentOnly = (item: PromptBoardItem): boolean => {
  if (item.kind === 'history') return false
  return item.state === 'preset-off' || item.state === 'condition' ||
    item.state === 'not-this-generation' || item.state === 'empty' || item.state === 'off'
}

interface BoardItemMeta {
  item: PromptBoardItem
  parts: PromptSourcePart[]
  omitted: PromptSourceOmitted[]
  tokens: number
  on: boolean
  isLitopys: boolean
}

interface BoardSingleRow { type: 'single'; m: BoardItemMeta }
/**
 * One preset group: members in board order; visible = members the sent-only
 * filter leaves; sentCount/sentTokens always cover ALL members, even hidden ones.
 */
interface BoardGroupRow {
  type: 'group'
  groupId: string
  name: string
  members: BoardItemMeta[]
  visible: BoardItemMeta[]
  sentCount: number
  sentTokens: number
}
type BoardRow = BoardSingleRow | BoardGroupRow

function BoardSwitch({ checked, onFlip, disabled, label, big }: {
  checked: boolean
  onFlip: () => void
  disabled: boolean
  label: string
  big?: boolean
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={e => { e.stopPropagation(); onFlip() }}
      className={cn(
        'relative shrink-0 rounded-full transition-colors',
        big ? 'h-6 w-11' : 'h-5 w-9',
        checked ? 'bg-primary' : 'bg-muted-foreground/30',
        disabled && 'cursor-not-allowed opacity-50'
      )}
    >
      <span className={cn(
        'absolute left-0.5 top-0.5 rounded-full bg-background shadow transition-transform',
        big ? 'h-5 w-5' : 'h-4 w-4',
        checked && (big ? 'translate-x-5' : 'translate-x-4')
      )} />
    </button>
  )
}

/** One line per part (#43): icon, name, status, switch. Click opens the details. */
function PartRow({ m, guide, highlighted, status, editable, onActivate, onToggle, registerRef, roomy, onHover, nested }: {
  m: BoardItemMeta
  guide?: string
  highlighted: boolean
  status: React.ReactNode
  editable: boolean
  onActivate: () => void
  onToggle: () => void
  registerRef?: (el: HTMLDivElement | null) => void
  roomy?: boolean
  onHover?: (hot: boolean) => void
  /** a part inside an unfolded group: indented under the group's row */
  nested?: boolean
}) {
  return (
    <div
      ref={registerRef}
      data-guide={guide}
      role="button"
      tabIndex={0}
      onClick={onActivate}
      onKeyDown={e => { if (e.key === 'Enter') onActivate() }}
      onMouseEnter={() => onHover?.(true)}
      onMouseLeave={() => onHover?.(false)}
      className={cn(
        'flex items-center gap-2 rounded-md border border-border bg-card text-left transition-colors',
        roomy ? 'min-h-[40px] px-2 py-2' : 'px-2 py-1.5',
        nested && 'ml-4',
        !m.on && 'opacity-60',
        highlighted && 'ring-2 ring-primary'
      )}
    >
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-muted text-muted-foreground">
        {iconFor(m.item.kind)}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm" title={m.item.label}>{m.item.label}</span>
      <span className="shrink-0 text-xs text-muted-foreground">{status}</span>
      {switchable(m.item) && (
        <BoardSwitch checked={m.on} disabled={!editable} label={m.item.label} onFlip={onToggle} big={roomy} />
      )}
    </div>
  )
}

/** "N parts not sent — Show" / "Showing everything — Hide unsent" (#43). */
function UnsentLine({ sentOnly, count, onShow, onHide, t }: {
  sentOnly: boolean
  count: number
  onShow: () => void
  onHide: () => void
  t: (k: any, vars?: any) => string
}) {
  if (count === 0) return null
  return (
    <div className="flex items-center justify-between gap-2 rounded-md bg-muted/60 px-2 py-1.5 text-xs text-muted-foreground">
      <span className="min-w-0 truncate">{sentOnly ? t('canvas.prompt.notSent', { n: count }) : t('canvas.prompt.showingAll')}</span>
      <button
        className="shrink-0 font-semibold text-primary hover:underline"
        onClick={sentOnly ? onShow : onHide}
      >
        {sentOnly ? t('canvas.prompt.showAll') : t('canvas.prompt.hideUnsent')}
      </button>
    </div>
  )
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

/** Placeholder while the newly picked chat's preview loads: the old board is
 * already gone, so the eye sees loading, never yesterday's parts (#39). */
function BoardSkeleton() {
  return (
    <div className="flex flex-col gap-2 p-3" role="status" aria-live="polite">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex min-h-[40px] items-center gap-2 rounded-lg border border-border bg-card p-3">
          <div className="h-7 w-7 animate-pulse rounded-md bg-muted" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3.5 w-2/5 animate-pulse rounded bg-muted" />
            <div className="h-3 w-1/4 animate-pulse rounded bg-muted" />
          </div>
          <div className="h-3.5 w-12 animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
  )
}

export function PromptBoard({ chatId, chats, onPickChat, editable, phoneList }: PromptBoardProps) {
  const t = useT()
  const [sources, setSources] = useState<PromptSources | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  // Linked selection: left ⇄ Request panel. Hover is one key, or `group:<id>` when a group card is hovered.
  const [hoverKey, setHoverKey] = useState<string | null>(null)
  const [showText, setShowText] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(true)
  const [boardState, setBoardState] = useState<BoardState>({ off: [], history: { ...DEFAULT_PROMPT_HISTORY } })
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'idle'>('idle')
  const [past, setPast] = useState<BoardState[]>([])
  const [future, setFuture] = useState<BoardState[]>([])
  const [expandedPhoneKey, setExpandedPhoneKey] = useState<string | null>(null)
  // "Only what is sent", on by default, remembered globally (#43)
  const [sentOnly, setSentOnlyState] = useState<boolean>(() => readLS('promptBoard.sentOnly') !== '0')

  const requestCounter = useRef(0)
  // Which chat the board on screen belongs to. Every async reply checks it
  // before writing state, so a late response for a previous chat can never
  // fill the board of the newly picked one (#39).
  const activeChatRef = useRef<string | null>(chatId)
  const [partQuery, setPartQuery] = useState('')
  // `t` is a new function on every render; the loader reads it through a ref so it stays stable
  const tRef = useRef(t)
  tRef.current = t
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const boardRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const outerScrollRef = useRef<HTMLDivElement>(null)
  const outputScrollRef = useRef<HTMLDivElement>(null)
  const wireRaf = useRef(0)
  const [wires, setWires] = useState<{ key: string; pts: WirePoint[] }[]>([])
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
      if (activeChatRef.current !== id) return
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
      if (counter === requestCounter.current) toast.error(tRef.current('canvas.loadFailed'))
    } finally {
      if (counter === requestCounter.current && activeChatRef.current === id) setPreviewLoading(false)
    }
  }, [])

  // after a saved change only the preview is fetched again: the switches and the undo stack stay
  const refreshPreview = useCallback(async (id: string) => {
    const counter = ++requestCounter.current
    setPreviewLoading(true)
    try {
      const preview = await promptPreview(id)
      if (counter === requestCounter.current && activeChatRef.current === id) setSources(preview.sources ?? null)
    } catch {
      /* the last preview stays on screen */
    } finally {
      if (counter === requestCounter.current && activeChatRef.current === id) setPreviewLoading(false)
    }
  }, [])

  useEffect(() => {
    // The old board leaves the screen the moment the chat changes: the list
    // is cleared at once, so the previous chat's parts never sit under the
    // new chat's name while its own preview loads (#39).
    activeChatRef.current = chatId
    setSelectedKey(null)
    setShowText(false)
    setExpandedPhoneKey(null)
    setPartQuery('')
    cardRefs.current.clear()
    rowRefs.current.clear()
    setWires([])
    if (chatId) {
      setSources(null)
      setBoardState({ off: [], history: { ...DEFAULT_PROMPT_HISTORY } })
      setPast([])
      setFuture([])
      void loadData(chatId)
    } else {
      setSources(null)
      setBoardState({ off: [], history: { ...DEFAULT_PROMPT_HISTORY } })
      setPast([])
      setFuture([])
    }
  }, [chatId, loadData])

  const save = useCallback(async (next: BoardState, prev: BoardState, targetId: string) => {
    if (!targetId) return
    setSaveState('saving')
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      // The user may have picked another chat while this waited: never write
      // to, or refresh, the wrong board.
      if (activeChatRef.current !== targetId) return
      try {
        await setChatPromptBoard(targetId, cleanConfig(next))
        if (activeChatRef.current !== targetId) return
        setSaveState('saved')
        void refreshPreview(targetId)
      } catch {
        if (activeChatRef.current !== targetId) return
        setBoardState(prev)
        setSaveState('saved')
        toast.error(t('canvas.saveFailed'))
      }
    }, 300)
  }, [t, refreshPreview])

  const commit = useCallback((next: BoardState) => {
    if (!chatId) return
    const targetId = chatId
    setPast(p => [...p, boardState].slice(-80))
    setFuture([])
    setBoardState(next)
    void save(next, boardState, targetId)
  }, [boardState, chatId, save])

  const setSentOnly = useCallback((v: boolean) => {
    setSentOnlyState(v)
    writeLS('promptBoard.sentOnly', v ? '1' : '0')
  }, [])

  const toggle = useCallback((key: string) => {
    const next = { ...boardState, off: boardState.off.includes(key) ? boardState.off.filter(k => k !== key) : [...boardState.off, key] }
    commit(next)
  }, [boardState, commit])

  // A whole group rides the same per-part "off for this chat" switches (#43):
  // one commit, one undo step.
  const toggleGroup = useCallback((members: BoardItemMeta[]) => {
    const keys = members.filter(mm => switchable(mm.item)).map(mm => mm.item.key)
    if (keys.length === 0) return
    // all on: the group goes off; any part off: the whole group comes back on
    const allOn = keys.every(k => !boardState.off.includes(k))
    const next = allOn
      ? [...boardState.off, ...keys.filter(k => !boardState.off.includes(k))]
      : boardState.off.filter(k => !keys.includes(k))
    commit({ ...boardState, off: next })
  }, [boardState, commit])

  const setHistory = useCallback((patch: Partial<PromptBoardHistory>) => {
    const next = { ...boardState, history: { ...boardState.history, ...patch } }
    commit(next)
  }, [boardState, commit])

  const undo = useCallback(() => {
    if (past.length === 0) return
    if (!chatId) return
    const prev = past[past.length - 1]
    setPast(p => p.slice(0, -1))
    setFuture(f => [boardState, ...f])
    setBoardState(prev)
    void save(prev, boardState, chatId)
  }, [past, future, boardState, chatId, save])

  const redo = useCallback(() => {
    if (future.length === 0) return
    if (!chatId) return
    const next = future[0]
    setFuture(f => f.slice(1))
    setPast(p => [...p, boardState])
    setBoardState(next)
    void save(next, boardState, chatId)
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

  // Cheap search over the parts (#40): filters both columns by part label,
  // part kind or the labels of the pieces inside. The request total above
  // always stays the full total, never the filtered one.
  const query = partQuery.trim().toLowerCase()
  const filteredItems = useMemo(() => {
    if (!query) return itemsWithMeta
    return itemsWithMeta.filter(m => {
      if (m.item.label.toLowerCase().includes(query)) return true
      if (m.item.kind.toLowerCase().includes(query)) return true
      return m.parts.some(p => (p.label ?? '').toLowerCase().includes(query))
    })
  }, [itemsWithMeta, query])

  const outputRows = useMemo(() => {
    return filteredItems.filter(m => m.on && (m.tokens > 0 || m.isLitopys))
  }, [filteredItems])

  // Fold long presets by group (#43). The board format carries no group info
  // and must not change, so sections join client-side: `section:<id>` meets
  // the chat preset's sections (section id === portable identifier) and their
  // groupId meets groups[]. Presets without groups behave exactly as before.
  const fullChat = useChat(chatId)
  const presetId = fullChat?.presetId ?? null
  const activePreset = useApp(s => (presetId ? s.presets.find(p => p.id === presetId) : undefined))
  const groupOf = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>()
    const groups = activePreset?.groups ?? []
    if (groups.length === 0) return map
    const names = new Map(groups.map(g => [g.id, g.name]))
    for (const s of activePreset?.sections ?? []) {
      const name = s.groupId ? names.get(s.groupId) : undefined
      if (s.groupId && name !== undefined) map.set(`section:${s.id}`, { id: s.groupId, name })
    }
    return map
  }, [activePreset])

  // Fold state remembered per preset, folded by default (#43)
  const [unfoldedGroups, setUnfoldedGroups] = useState<Record<string, boolean>>({})
  useEffect(() => {
    if (!presetId) { setUnfoldedGroups({}); return }
    try {
      const raw = localStorage.getItem(`promptBoard.fold.${presetId}`)
      const parsed: unknown = raw ? JSON.parse(raw) : {}
      setUnfoldedGroups(parsed && typeof parsed === 'object' ? (parsed as Record<string, boolean>) : {})
    } catch { setUnfoldedGroups({}) }
  }, [presetId])
  const toggleGroupFold = useCallback((groupId: string) => {
    setUnfoldedGroups(prev => {
      const next: Record<string, boolean> = { ...prev }
      if (next[groupId]) delete next[groupId]
      else next[groupId] = true
      if (presetId) writeLS(`promptBoard.fold.${presetId}`, JSON.stringify(next))
      return next
    })
  }, [presetId])

  // Groups gather their members at the first member's place — one card per
  // group (#43). Search (#40) applies first, then the sent-only filter.
  const rows = useMemo<BoardRow[]>(() => {
    const out: BoardRow[] = []
    const byGroup = new Map<string, BoardGroupRow>()
    for (const m of filteredItems) {
      const g = m.item.kind === 'preset' ? groupOf.get(m.item.key) : undefined
      if (!g) { out.push({ type: 'single', m }); continue }
      let row = byGroup.get(g.id)
      if (!row) {
        row = { type: 'group', groupId: g.id, name: g.name, members: [], visible: [], sentCount: 0, sentTokens: 0 }
        byGroup.set(g.id, row)
        out.push(row)
      }
      row.members.push(m)
    }
    for (const row of byGroup.values()) {
      row.visible = sentOnly ? row.members.filter(mm => !hiddenWhenSentOnly(mm.item)) : [...row.members]
      row.sentCount = row.members.filter(mm => mm.on).length
      row.sentTokens = row.members.reduce((sum, mm) => sum + (mm.on ? mm.tokens : 0), 0)
    }
    return out
  }, [filteredItems, groupOf, sentOnly])

  // Parts the sent-only filter would hide among the (searched) items (#43)
  const hideableCount = useMemo(
    () => filteredItems.filter(m => hiddenWhenSentOnly(m.item)).length,
    [filteredItems]
  )

  // Wires from a folded group card fan out to every member's output row (#43)
  const registerCardRef = useCallback((el: HTMLDivElement | null, keys: string[]) => {
    if (!el) return undefined
    keys.forEach(k => cardRefs.current.set(k, el))
    return () => { keys.forEach(k => { if (cardRefs.current.get(k) === el) cardRefs.current.delete(k) }) }
  }, [])

  // wires are drawn in the content's own coordinates, so they scroll with it
  const recomputeWires = useCallback(() => {
    if (!contentRef.current || phoneList) return
    const scrollRect = contentRef.current.getBoundingClientRect()
    const points: { key: string; pts: WirePoint[] }[] = []
    for (const row of outputRows) {
      const cardEl = cardRefs.current.get(row.item.key)
      const rowEl = rowRefs.current.get(row.item.key)
      if (!cardEl || !rowEl) continue
      const cardRect = cardEl.getBoundingClientRect()
      const rowRect = rowEl.getBoundingClientRect()
      const start: WirePoint = { x: cardRect.right - scrollRect.left, y: cardRect.top + cardRect.height / 2 - scrollRect.top }
      const end: WirePoint = { x: rowRect.left - scrollRect.left, y: rowRect.top + rowRect.height / 2 - scrollRect.top }
      points.push({ key: row.item.key, pts: [start, end] })
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

  // Linked selection: left ⇄ Request panel (#43 link). Wires go stale on any
  // scroll (both columns live in scrollers), so both scrollers reschedule them.
  const scheduleWires = useCallback(() => {
    if (wireRaf.current) return
    wireRaf.current = requestAnimationFrame(() => {
      wireRaf.current = 0
      recomputeWires()
    })
  }, [recomputeWires])

  useEffect(() => {
    const outer = outerScrollRef.current
    const inner = outputScrollRef.current
    if (outer) outer.addEventListener('scroll', scheduleWires, { passive: true })
    if (inner) inner.addEventListener('scroll', scheduleWires, { passive: true })
    return () => {
      if (outer) outer.removeEventListener('scroll', scheduleWires)
      if (inner) inner.removeEventListener('scroll', scheduleWires)
      cancelAnimationFrame(wireRaf.current)
      wireRaf.current = 0
    }
  }, [scheduleWires, sources])

  // A key is "hot" when selected, hovered, or a member of the hovered group
  const isHotKey = useCallback((key: string): boolean => {
    if (selectedKey === key || hoverKey === key) return true
    if (hoverKey?.startsWith('group:')) {
      return groupOf.get(key)?.id === hoverKey.slice(6)
    }
    return false
  }, [selectedKey, hoverKey, groupOf])

  const scrollElInto = (box: HTMLElement | null, el: HTMLElement | null) => {
    if (!box || !el) return
    const c = box.getBoundingClientRect()
    const r = el.getBoundingClientRect()
    box.scrollTop += (r.top + r.height / 2) - (c.top + c.height / 2)
    scheduleWires()
  }

  const revealOutput = useCallback((key: string) => {
    if (phoneList) return
    scrollElInto(outputScrollRef.current, rowRefs.current.get(key) ?? null)
  }, [phoneList, scheduleWires])

  const revealLeft = useCallback((key: string) => {
    if (phoneList) return
    const g = groupOf.get(key)
    if (g && unfoldedGroups[g.id] !== true) {
      toggleGroupFold(g.id)
      requestAnimationFrame(() => scrollElInto(outerScrollRef.current, cardRefs.current.get(key) ?? null))
    } else {
      scrollElInto(outerScrollRef.current, cardRefs.current.get(key) ?? null)
    }
  }, [phoneList, groupOf, unfoldedGroups, toggleGroupFold, scheduleWires])

  const selectPart = useCallback((key: string) => {
    setSelectedKey(key)
    setShowText(false)
    revealOutput(key)
  }, [revealOutput])

  const selectFromOutput = useCallback((key: string) => {
    setSelectedKey(key)
    setShowText(false)
    setDetailsOpen(true)
    revealLeft(key)
  }, [revealLeft])

  if (!chatId) {
    return (
      <div className="flex h-full flex-col" ref={boardRef}>
        <header className="flex flex-wrap items-center gap-2 border-b border-border bg-card px-3 py-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t('canvas.prompt.title')}
          </span>
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">{t('canvas.prompt.chat')}</span>
            <ChatPicker chats={chats} value={null} onChange={onPickChat} />
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
  // A fresh pick clears the old board at once (#39): while the new preview
  // loads there is nothing stale to read, only this placeholder.
  const loadingBoard = sources === null

  return (
    <div className="flex h-full flex-col" ref={boardRef}>
      <header className="flex flex-wrap items-center gap-2 border-b border-border bg-card px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t('canvas.prompt.title')}
        </span>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">{t('canvas.prompt.chat')}</span>
          <ChatPicker chats={chats} value={chatId} onChange={onPickChat} />
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
        {sources && !loadingBoard && (
          <span className="rounded-md bg-muted px-2 py-1 text-xs font-semibold" aria-live="polite">
            {t('canvas.prompt.total')}: {formatTokens(totalTokens)} {t('canvas.prompt.tokens')}
          </span>
        )}
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
      {!unsupported && (
        <div className="flex items-center gap-2 border-b border-border bg-card px-3 py-1.5">
          <div className="relative min-w-0 flex-1">
            <MagnifyingGlass className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              value={partQuery}
              onChange={e => setPartQuery(e.target.value)}
              placeholder={t('canvas.prompt.searchParts')}
              aria-label={t('canvas.prompt.searchParts')}
              className="h-8 pl-7 text-sm"
            />
          </div>
          {query && (
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground" aria-live="polite">
              {filteredItems.length} / {itemsWithMeta.length}
            </span>
          )}
          <label className="flex shrink-0 cursor-pointer items-center gap-1.5 py-1 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={sentOnly}
              onChange={e => setSentOnly(e.target.checked)}
              className="h-3.5 w-3.5 accent-primary"
            />
            {t('canvas.prompt.sentOnly')}
          </label>
        </div>
      )}

      {unsupported ? (
        <div className="flex flex-1 items-center justify-center p-8 text-center">
          <p className="text-sm text-muted-foreground">{t('canvas.prompt.unsupported')}</p>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          <div className={cn('min-w-0 flex-1', phoneList && 'overflow-y-auto')}>
            {phoneList ? (
              loadingBoard ? (
                <BoardSkeleton />
              ) : (
              <div className="flex flex-col gap-2 p-3">
                <div data-guide="prompt.total" className="sticky top-0 z-10 -mx-3 -mt-3 flex items-center justify-between gap-2 border-b border-border bg-background/95 px-3 py-2 backdrop-blur" aria-live="polite">
                  <span className="min-w-0 truncate text-xs text-muted-foreground">{chat?.title ?? ''}</span>
                  <strong className="shrink-0 text-sm">{formatTokens(totalTokens)} {t('canvas.prompt.tokens')}</strong>
                </div>
                <UnsentLine sentOnly={sentOnly} count={hideableCount} onShow={() => setSentOnly(false)} onHide={() => setSentOnly(true)} t={t} />
                {rows.map((row, ri) => {
                  const guide = ri === 0 ? 'prompt.part' : undefined
                  if (row.type === 'single') {
                    const m = row.m
                    const status = m.on ? (
                      m.isLitopys ? t('canvas.prompt.atSend') : m.tokens === 0 ? t('canvas.prompt.state.empty') : `${formatTokens(m.tokens)} ${t('canvas.prompt.tokens')}`
                    ) : t('canvas.prompt.state.off')
                    return (
                      <div key={m.item.key}>
                        <PartRow
                          m={m}
                          guide={m.item.kind === 'history' ? 'prompt.history' : guide}
                          highlighted={expandedPhoneKey === m.item.key}
                          status={status}
                          editable={editable}
                          onActivate={() => setExpandedPhoneKey(k => k === m.item.key ? null : m.item.key)}
                          onToggle={() => toggle(m.item.key)}
                          roomy
                        />
                        {expandedPhoneKey === m.item.key && (
                          <div className="mt-1 rounded-lg border border-border bg-card p-3">
                            <PhoneDetails item={m} t={t} showText={showText} setShowText={setShowText} />
                          </div>
                        )}
                      </div>
                    )
                  }
                  const open = unfoldedGroups[row.groupId] === true
                  const gKeys = row.members.filter(mm => switchable(mm.item)).map(mm => mm.item.key)
                  const gAllOn = gKeys.length > 0 && gKeys.every(k => !boardState.off.includes(k))
                  return (
                    <div key={`group:${row.groupId}`} className="rounded-lg border border-border bg-card shadow-sm">
                      <div
                        data-guide={guide}
                        role="button"
                        tabIndex={0}
                        onClick={() => toggleGroupFold(row.groupId)}
                        onKeyDown={e => { if (e.key === 'Enter') toggleGroupFold(row.groupId) }}
                        title={open ? t('canvas.prompt.fold') : t('canvas.prompt.unfold')}
                        className="flex min-h-[40px] cursor-pointer items-start gap-2 px-2 py-2"
                      >
                        <CaretRight className={cn('mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-90')} aria-hidden="true" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold" title={row.name}>{row.name}</span>
                          <span className="mt-0.5 block text-xs tabular-nums text-muted-foreground">{t('canvas.prompt.groupSent', { a: row.sentCount, b: row.members.length })} · {formatTokens(row.sentTokens)} {t('canvas.prompt.tokens')}</span>
                        </span>
                        {gKeys.length > 0 && (
                          <span className="mt-0.5 shrink-0">
                            <BoardSwitch checked={gAllOn} disabled={!editable} label={row.name} onFlip={() => toggleGroup(row.members)} big />
                          </span>
                        )}
                      </div>
                      {open && (
                        <div className="flex flex-col gap-1 px-2 pb-2">
                          {row.visible.map(mm => {
                            const mStatus = mm.on ? (
                              mm.isLitopys ? t('canvas.prompt.atSend') : mm.tokens === 0 ? t('canvas.prompt.state.empty') : `${formatTokens(mm.tokens)} ${t('canvas.prompt.tokens')}`
                            ) : t('canvas.prompt.state.off')
                            return (
                              <div key={mm.item.key}>
                                <PartRow
                                  m={mm}
                                  highlighted={expandedPhoneKey === mm.item.key}
                                  status={mStatus}
                                  editable={editable}
                                  onActivate={() => setExpandedPhoneKey(k => k === mm.item.key ? null : mm.item.key)}
                                  onToggle={() => toggle(mm.item.key)}
                                  roomy
                                  nested
                                />
                                {expandedPhoneKey === mm.item.key && (
                                  <div className="mt-1 rounded-lg border border-border bg-card p-3">
                                    <PhoneDetails item={mm} t={t} showText={showText} setShowText={setShowText} />
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
                {query && filteredItems.length === 0 && (
                  <div className="py-6 text-center text-sm text-muted-foreground">{t('canvas.prompt.noPartsMatch')}</div>
                )}
              </div>
              )
            ) : (
              loadingBoard ? (
                <div className="min-w-0 flex-1 overflow-hidden"><BoardSkeleton /></div>
              ) : (
              <div className="h-full overflow-auto p-4" ref={outerScrollRef}>
               <div className="relative" ref={contentRef} style={{ minWidth: 740 }}>
                <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" style={{ zIndex: 0 }}>
                  {wires.map(w => {
                    const [a, b] = w.pts
                    const dx = Math.max(40, Math.abs(b.x - a.x) * 0.5)
                    const d = `M${a.x},${a.y} C${a.x + dx},${a.y} ${b.x - dx},${b.y} ${b.x},${b.y}`
                    const hot = isHotKey(w.key)
                    return <path key={w.key} d={d} fill="none" stroke="currentColor" strokeWidth={hot ? 2.5 : 2} className={hot ? 'text-primary' : 'text-muted-foreground/40'} />
                  })}
                </svg>
                <div className="relative z-10 flex items-start gap-12" style={{ minWidth: 740 }}>
                  <div className="flex flex-col gap-1" style={{ width: 320 }}>
                    <UnsentLine sentOnly={sentOnly} count={hideableCount} onShow={() => setSentOnly(false)} onHide={() => setSentOnly(true)} t={t} />
                    {rows.map((row, ri) => {
                      const guide = ri === 0 ? 'prompt.part' : undefined
                      if (row.type === 'single') {
                        const m = row.m
                        const disabledReason = stateText(m.item, t)
                        const status = disabledReason ? (
                          <span className="text-destructive/80">{disabledReason}</span>
                        ) : m.item.kind === 'history' ? (
                          historySummary(boardState.history, t)
                        ) : m.on ? (
                          m.isLitopys ? t('canvas.prompt.atSend') : m.tokens === 0 ? t('canvas.prompt.state.empty') : `${formatTokens(m.tokens)} ${t('canvas.prompt.tokens')}`
                        ) : (
                          t('canvas.prompt.state.off')
                        )
                        return (
                          <PartRow
                            key={m.item.key}
                            m={m}
                            guide={m.item.kind === 'history' ? 'prompt.history' : guide}
                            highlighted={selectedKey === m.item.key || isHotKey(m.item.key)}
                            status={status}
                            editable={editable}
                            onActivate={() => selectPart(m.item.key)}
                            onToggle={() => toggle(m.item.key)}
                            onHover={hot => setHoverKey(hot ? m.item.key : null)}
                            registerRef={el => registerCardRef(el, [m.item.key])}
                          />
                        )
                      }
                      const open = unfoldedGroups[row.groupId] === true
                      const gKeys = row.members.filter(mm => switchable(mm.item)).map(mm => mm.item.key)
                      const gAllOn = gKeys.length > 0 && gKeys.every(k => !boardState.off.includes(k))
                      const selectedInside = row.members.some(mm => mm.item.key === selectedKey)
                      return (
                        <div
                          key={`group:${row.groupId}:${open ? 'open' : 'shut'}`}
                          ref={el => registerCardRef(el, row.members.map(mm => mm.item.key))}
                          data-guide={guide}
                          className={cn(
                            'rounded-lg border border-border bg-card shadow-sm transition-all',
                            selectedInside && 'ring-2 ring-primary'
                          )}
                        >
                          <div
                            role="button"
                            tabIndex={0}
                            onClick={() => toggleGroupFold(row.groupId)}
                            onKeyDown={e => { if (e.key === 'Enter') toggleGroupFold(row.groupId) }}
                            onMouseEnter={() => setHoverKey(`group:${row.groupId}`)}
                            onMouseLeave={() => setHoverKey(null)}
                            title={open ? t('canvas.prompt.fold') : t('canvas.prompt.unfold')}
                            className="flex cursor-pointer items-start gap-2 px-2 py-1.5"
                          >
                            <CaretRight className={cn('mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-90')} aria-hidden="true" />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-semibold" title={row.name}>{row.name}</span>
                              <span className="mt-0.5 block text-xs tabular-nums text-muted-foreground">{t('canvas.prompt.groupSent', { a: row.sentCount, b: row.members.length })} · {formatTokens(row.sentTokens)} {t('canvas.prompt.tokens')}</span>
                            </span>
                            {gKeys.length > 0 && (
                              <span className="mt-0.5 shrink-0" onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
                                <BoardSwitch checked={gAllOn} disabled={!editable} label={row.name} onFlip={() => toggleGroup(row.members)} />
                              </span>
                            )}
                          </div>
                          {open && (
                            <div className="flex flex-col gap-1 px-2 pb-2 pl-7">
                              {row.visible.map(mm => {
                                const mmReason = stateText(mm.item, t)
                                const mmStatus = mmReason ? (
                                  <span className="text-destructive/80">{mmReason}</span>
                                ) : mm.on ? (
                                  mm.isLitopys ? t('canvas.prompt.atSend') : mm.tokens === 0 ? t('canvas.prompt.state.empty') : `${formatTokens(mm.tokens)} ${t('canvas.prompt.tokens')}`
                                ) : (
                                  t('canvas.prompt.state.off')
                                )
                                return (
                                  <PartRow
                                    key={mm.item.key}
                                    m={mm}
                                    highlighted={selectedKey === mm.item.key || isHotKey(mm.item.key)}
                                    status={mmStatus}
                                    editable={editable}
                                    onActivate={() => selectPart(mm.item.key)}
                                    onToggle={() => toggle(mm.item.key)}
                                    onHover={hot => setHoverKey(hot ? mm.item.key : null)}
                                    registerRef={el => registerCardRef(el, [mm.item.key])}
                                    nested
                                  />
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )
                    })}
                    {query && filteredItems.length === 0 && (
                      <div className="py-6 text-center text-sm text-muted-foreground">{t('canvas.prompt.noPartsMatch')}</div>
                    )}
                  </div>
                  <div className="w-[340px] shrink-0 self-start sticky top-4">
                    <div data-guide="prompt.total" className="rounded-lg border border-border bg-card p-3 shadow-sm">
                      <div className="text-sm font-semibold">{t('canvas.prompt.output')}</div>
                      <div className="text-xs text-muted-foreground">{chat?.title ?? ''}</div>
                      <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                        <span>{t('canvas.prompt.total')}</span>
                        <strong>{formatTokens(totalTokens)} {t('canvas.prompt.tokens')}</strong>
                      </div>
                      <div className="mt-3 flex max-h-[55vh] flex-col gap-1 overflow-y-auto" ref={outputScrollRef}>
                        {outputRows.map((m, i) => {
                          const hot = selectedKey === m.item.key || isHotKey(m.item.key)
                          return (
                          <div
                            key={m.item.key}
                            ref={el => { if (el) rowRefs.current.set(m.item.key, el) }}
                            role="button"
                            tabIndex={0}
                            title={m.item.label}
                            onClick={() => selectFromOutput(m.item.key)}
                            onKeyDown={e => { if (e.key === 'Enter') selectFromOutput(m.item.key) }}
                            onMouseEnter={() => setHoverKey(m.item.key)}
                            onMouseLeave={() => setHoverKey(null)}
                            className={cn(
                              'flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm transition-colors hover:bg-muted/60',
                              hot && 'bg-primary/10 ring-1 ring-primary'
                            )}
                          >
                            <span className="flex h-5 w-5 items-center justify-center rounded bg-muted text-xs font-semibold">{i + 1}</span>
                            <span className="flex-1 truncate">{m.item.label}</span>
                            <span className="text-xs text-muted-foreground">
                              {m.isLitopys ? t('canvas.prompt.atSend') : `${formatTokens(m.tokens)} ${t('canvas.prompt.tokens')}`}
                            </span>
                          </div>
                          )
                        })}
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
              )
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
