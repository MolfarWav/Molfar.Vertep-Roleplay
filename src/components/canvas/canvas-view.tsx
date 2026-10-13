import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowCounterClockwise, ArrowClockwise, Sparkle, FrameCorners, PencilSimple, Eye, ListBullets, Graph as GraphIcon, CaretRight, Info, LinkBreak, Trash, EyeSlash, Eye as EyeIcon, ArrowsClockwise, Plus } from '@phosphor-icons/react'
import { takeCanvasFocus } from './canvas-focus'
import { CanvasBoard } from '@/canvas-kit/canvas-board'
import { CHAT_LINKS, boardFromChats, linkChanges } from '@/canvas-kit/boards/chat-links'
import { fetchLitChats, setLitLink, type LitChatItem } from '@/components/library/litopys-api'
import { historyOf, commit, undo as undoHistory, redo as redoHistory, layoutForest, canConnect, connect as applyConnect, removeEdge, removeNode, moveNode } from '@/canvas-kit/graph'
import type { CanvasNode, Graph, History } from '@/canvas-kit/graph'
import { Button } from '@/components/ui/button'
import { useRelativeTime, useT } from '@/hooks/use-t'
import type { MsgKey } from '@/lib/i18n'
import { useIsMobile } from '@/hooks/use-mobile'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

type ChatInfo = LitChatItem

const storage = {
  get<T>(key: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(key)
      return raw ? (JSON.parse(raw) as T) : fallback
    } catch {
      return fallback
    }
  },
  set(key: string, value: unknown) {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch {}
  },
}

const TOAST_KEY: Record<string, MsgKey> = {
  tidy: 'canvas.tidy', connect: 'canvas.connect', disconnect: 'canvas.disconnect', move: 'canvas.move', remove: 'canvas.removed', insert: 'canvas.insert',
}

const POSITIONS_KEY = 'rp.canvas.chatLinks.positions'
const HIDDEN_KEY = 'rp.canvas.chatLinks.hidden'

export function CanvasView() {
  const t = useT()
  const isMobile = useIsMobile()
  const [chats, setChats] = useState<ChatInfo[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [graph, setGraph] = useState<Graph>({ nodes: [], edges: [] })
  const [history, setHistory] = useState<History>(historyOf({ nodes: [], edges: [] }))
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editable, setEditable] = useState(!isMobile)
  const [phoneList, setPhoneList] = useState(isMobile)
  const [infoOpen, setInfoOpen] = useState(true)
  const [fitSignal, setFitSignal] = useState(0)
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set(storage.get<string[]>(HIDDEN_KEY, [])))
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>(
    storage.get(POSITIONS_KEY, {})
  )
  // the phone flag can arrive after the first render: phones start in View mode with the List
  useEffect(() => {
    if (isMobile) {
      setEditable(false)
      setPhoneList(true)
    }
  }, [isMobile])
  const loadedRef = useRef(false)
  const undoRef = useRef<() => void>(() => {})
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const allChats = useMemo(() => chats || [], [chats])
  const visibleChats = useMemo(
    () => allChats.filter((c) => !hiddenIds.has(c.id)),
    [allChats, hiddenIds]
  )

  const rel = useRelativeTime()
  const nodeMeta = useCallback(
    (n: CanvasNode) => {
      const chat = allChats.find((c) => c.id === n.id)
      if (!chat) return ''
      return [chat.facts ? t('canvas.facts', { n: chat.facts }) : '', chat.updatedAt ? rel(chat.updatedAt) : ''].filter(Boolean).join(' · ')
    },
    [allChats, rel, t]
  )

  const reasonText = useCallback(
    (coreReason: string) => {
      if (coreReason.includes('loop')) return t('canvas.why.loop')
      if (coreReason.includes('itself')) return t('canvas.why.self')
      if (coreReason.includes('output to an input')) return t('canvas.why.direction')
      if (coreReason.includes('do not fit')) return t('canvas.why.type')
      if (coreReason.includes('Already connected')) return t('canvas.why.dup')
      return t('canvas.why.unknown')
    },
    [t]
  )

  // `t` is a new function on every render; the loader reads it through a ref so it stays stable
  const tRef = useRef(t)
  tRef.current = t

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { items } = await fetchLitChats()
      setChats(items)
      const focus = takeCanvasFocus()
      if (focus && items.some((c) => c.id === focus)) setSelectedId(focus)
      const pos = storage.get<Record<string, { x: number; y: number }>>(POSITIONS_KEY, {})
      setPositions(pos)
      const hidden = new Set(storage.get<string[]>(HIDDEN_KEY, []))
      const g = boardFromChats(items.filter((c) => !hidden.has(c.id)), pos)
      setGraph(g)
      setHistory(historyOf(g))
      loadedRef.current = true
      setFitSignal((s) => s + 1)
    } catch (e) {
      setError(tRef.current('canvas.loadFailed'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const persistGraph = useCallback(
    async (prev: Graph, next: Graph, toastLabel?: string) => {
      const changes = linkChanges(prev, next)
      try {
        for (const ch of changes) {
          await setLitLink(ch.chatId, ch.from)
        }
        if (toastLabel && TOAST_KEY[toastLabel]) {
          toast(t(TOAST_KEY[toastLabel]), {
            action: {
              label: t('canvas.undo'),
              onClick: () => undoRef.current(),
            },
          })
        }
      } catch (e) {
        setGraph(prev)
        setHistory(historyOf(prev))
        toast(t('canvas.saveFailed'))
      }
    },
    [t]
  )

  const handleChange = useCallback(
    (next: Graph, label: string) => {
      const prev = graph
      const newHistory = commit(history, next)
      setHistory(newHistory)
      setGraph(next)
      const pos: Record<string, { x: number; y: number }> = {}
      next.nodes.forEach((n) => {
        pos[n.id] = { x: n.x, y: n.y }
      })
      setPositions(pos)
      storage.set(POSITIONS_KEY, pos)
      persistGraph(prev, next, label)
    },
    [graph, history, persistGraph]
  )

  const handleRemoveNode = useCallback(
    (id: string) => {
      const chat = allChats.find((c) => c.id === id)
      if (!chat) return
      const newHidden = new Set(hiddenIds)
      newHidden.add(id)
      setHiddenIds(newHidden)
      storage.set(HIDDEN_KEY, Array.from(newHidden))
      const next = removeNode(graph, id)
      handleChange(next, 'remove')
      if (selectedId === id) setSelectedId(null)
    },
    [allChats, hiddenIds, graph, handleChange, selectedId]
  )

  const handleOpenNode = useCallback((id: string) => {
    setSelectedId(id)
    setInfoOpen(true)
  }, [])

  const handleUndo = useCallback(() => {
    const next = undoHistory(history)
    if (next.present === history.present) return
    setHistory(next)
    setGraph(next.present)
    const changes = linkChanges(history.present, next.present)
    Promise.all(changes.map((c) => setLitLink(c.chatId, c.from))).catch(() => {
      toast(t('canvas.saveFailed'))
    })
  }, [history, t])

  undoRef.current = handleUndo

  const handleRedo = useCallback(() => {
    const next = redoHistory(history)
    if (next.present === history.present) return
    setHistory(next)
    setGraph(next.present)
    const changes = linkChanges(history.present, next.present)
    Promise.all(changes.map((c) => setLitLink(c.chatId, c.from))).catch(() => {
      toast(t('canvas.saveFailed'))
    })
  }, [history, t])

  const handleTidy = useCallback(() => {
    const next = layoutForest(graph)
    handleChange(next, 'tidy')
  }, [graph, handleChange])

  // Reload from the server: the saved links are the truth, and hidden chats bring theirs back with them.
  const handleShowHidden = useCallback(() => {
    setHiddenIds(new Set())
    storage.set(HIDDEN_KEY, [])
    void loadData()
  }, [loadData])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA') return
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) handleRedo()
        else handleUndo()
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        handleRedo()
      } else if (e.key === ']') {
        setInfoOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handleUndo, handleRedo])

  const selectedChat = useMemo(
    () => (selectedId ? allChats.find((c) => c.id === selectedId) : null),
    [selectedId, allChats]
  )
  const selectedNode = useMemo(
    () => (selectedId ? graph.nodes.find((n) => n.id === selectedId) : null),
    [selectedId, graph]
  )
  const selectedParent = useMemo(() => {
    if (!selectedId) return null
    const edge = graph.edges.find((e) => e.to === `${selectedId}:prev`)
    if (!edge) return null
    const fromId = edge.from.split(':')[0]
    return allChats.find((c) => c.id === fromId) || null
  }, [selectedId, graph, allChats])

  const handleUnlink = useCallback(() => {
    if (!selectedId) return
    const edge = graph.edges.find((e) => e.to === `${selectedId}:prev`)
    if (!edge) return
    const next = removeEdge(graph, edge.id)
    handleChange(next, 'disconnect')
  }, [selectedId, graph, handleChange])

  const handleListChange = useCallback(
    (chatId: string, fromId: string | null) => {
      const from = fromId ? `${fromId}:next` : null
      const to = `${chatId}:prev`
      const existing = graph.edges.find((e) => e.to === to)
      let next = existing ? removeEdge(graph, existing.id) : graph
      if (from) {
        const verdict = canConnect(CHAT_LINKS, next, from, to)
        if (verdict.ok) {
          next = applyConnect(CHAT_LINKS, next, from, to, `e-${Date.now()}`).graph
        }
      }
      handleChange(next, 'connect')
    },
    [graph, handleChange]
  )

  // A chat may continue any other chat that does not create a loop, judged on the board as it is now
  // without this chat's own current link; its current parent always stays in the list.
  const canBeParent = useCallback(
    (chatId: string, parentId: string): boolean => {
      const base: Graph = { nodes: graph.nodes, edges: graph.edges.filter((e) => e.to !== `${chatId}:prev`) }
      return canConnect(CHAT_LINKS, base, `${parentId}:next`, `${chatId}:prev`).ok
    },
    [graph]
  )

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        {t('canvas.loading')}
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <div className="text-sm text-destructive">{error}</div>
        <Button variant="outline" onClick={loadData}>
          <ArrowsClockwise className="mr-2 h-4 w-4" />
          {t('canvas.retry')}
        </Button>
      </div>
    )
  }

  if (allChats.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
        <div className="text-lg font-semibold">{t('canvas.empty.title')}</div>
        <div className="text-sm text-muted-foreground">{t('canvas.empty.body')}</div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col" role="application" aria-label={t('canvas.title')}>
      <header className="flex flex-wrap items-center gap-2 border-b border-border bg-card px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t('canvas.boards')}
        </span>
        <div className="flex rounded-lg bg-muted p-0.5">
          <button
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold text-foreground',
              'bg-primary text-primary-foreground shadow-sm'
            )}
            aria-pressed="true"
          >
            <LinkBreak className="h-4 w-4" />
            {t('canvas.board.links')}
          </button>
          <button
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold text-muted-foreground"
            aria-pressed="false"
            title={t('canvas.board.promptSoon')}
          >
            <GraphIcon className="h-4 w-4" />
            {t('canvas.board.prompt')}
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              {t('canvas.soon')}
            </span>
          </button>
        </div>

        {!isMobile && (
          <>
            <div className="mx-1 h-5 w-px bg-border" />
            <Button variant="ghost" size="icon" onClick={handleUndo} title={t('canvas.undo')}>
              <ArrowCounterClockwise className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={handleRedo} title={t('canvas.redo')}>
              <ArrowClockwise className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="bg-violet-500/15 text-violet-600 hover:bg-violet-500/25 dark:text-violet-400"
              onClick={handleTidy}
              disabled={!editable}
            >
              <Sparkle className="mr-1.5 h-4 w-4" />
              {t('canvas.tidy')}
            </Button>
          </>
        )}

        <div className="flex-1" />

        <div className={cn('rounded-lg bg-muted p-0.5', isMobile ? 'hidden' : 'flex')}>
          <button
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold',
              editable ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
            )}
            aria-pressed={editable}
            onClick={() => setEditable(true)}
          >
            <PencilSimple className="h-4 w-4" />
            {t('canvas.mode.edit')}
          </button>
          <button
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold',
              !editable ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
            )}
            aria-pressed={!editable}
            onClick={() => setEditable(false)}
          >
            <Eye className="h-4 w-4" />
            {t('canvas.mode.view')}
          </button>
        </div>

        {hiddenIds.size > 0 && (
          <Button variant="outline" size="sm" onClick={handleShowHidden} title={t('canvas.showHidden', { n: hiddenIds.size })}>
            <EyeSlash className="mr-1.5 h-4 w-4" />
            {t('canvas.showHidden', { n: hiddenIds.size })}
          </Button>
        )}

        <Button
          variant="ghost"
          size="icon"
          onClick={() => setFitSignal((s) => s + 1)}
          title={t('canvas.fit')}
        >
          <FrameCorners className="h-4 w-4" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className={isMobile ? 'hidden' : undefined}
          onClick={() => setInfoOpen((v) => !v)}
          title={t('canvas.info')}
        >
          <Info className="h-4 w-4" />
        </Button>
      </header>

      {isMobile && (
        <div className="flex items-center gap-2 border-b border-border bg-muted/50 px-3 py-2">
          <span className="text-xs text-muted-foreground">{t('canvas.phoneNote')}</span>
          <div className="ml-auto flex rounded-lg bg-muted p-0.5">
            <button
              className={cn(
                'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold',
                !phoneList ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
              )}
              aria-pressed={!phoneList}
              onClick={() => setPhoneList(false)}
            >
              <GraphIcon className="h-4 w-4" />
              {t('canvas.graph')}
            </button>
            <button
              className={cn(
                'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold',
                phoneList ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
              )}
              aria-pressed={phoneList}
              onClick={() => setPhoneList(true)}
            >
              <ListBullets className="h-4 w-4" />
              {t('canvas.list')}
            </button>
          </div>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <div className={cn('min-w-0 flex-1', !isMobile && infoOpen && 'pr-0')}>
          {isMobile && phoneList ? (
            <div className="h-full overflow-auto p-3">
              {visibleChats.map((chat) => {
                const parentEdge = graph.edges.find((e) => e.to === `${chat.id}:prev`)
                const parentId = parentEdge ? parentEdge.from.split(':')[0] : null
                const validParents = allChats.filter(
                  (c) => c.id !== chat.id && !hiddenIds.has(c.id) && canBeParent(chat.id, c.id)
                )
                return (
                  <div key={chat.id} className="mb-2 flex flex-col gap-2 rounded-lg border border-border bg-card p-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">{chat.title}</div>
                      {chat.name && <div className="truncate text-xs text-muted-foreground">{chat.name}</div>}
                    </div>
                    <label className="text-xs font-medium text-muted-foreground" htmlFor={`continues-${chat.id}`}>{t('canvas.continues')}</label>
                    <select
                      id={`continues-${chat.id}`}
                      className="w-full rounded-md border border-border bg-background px-2 py-2 text-sm"
                      value={parentId || ''}
                      onChange={(e) => handleListChange(chat.id, e.target.value || null)}
                      aria-label={`${t('canvas.continues')} ${chat.title}`}
                    >
                      <option value="">{t('canvas.continuesNone')}</option>
                      {validParents.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.title}
                        </option>
                      ))}
                    </select>
                  </div>
                )
              })}
            </div>
          ) : (
            <CanvasBoard
              board={CHAT_LINKS}
              graph={graph}
              editable={!isMobile && editable}
              onChange={handleChange}
              onRemoveNode={handleRemoveNode}
              onOpenNode={handleOpenNode}
              reasonText={reasonText}
              selectedId={selectedId}
              onSelect={setSelectedId}
              fitSignal={fitSignal}
              nodeMeta={nodeMeta}
            />
          )}
        </div>

        {!isMobile && infoOpen && (
          <aside className="w-[300px] shrink-0 border-l border-border bg-card">
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t('canvas.info')}
              </span>
              <Button variant="ghost" size="icon-xs" onClick={() => setInfoOpen(false)}>
                <CaretRight className="h-4 w-4" />
              </Button>
            </div>
            <div className="space-y-3 p-3 text-sm">
              {!selectedChat && (
                <>
                  <p className="text-muted-foreground">{t('canvas.help.1')}</p>
                  <p className="text-muted-foreground">{t('canvas.help.2')}</p>
                  <p className="text-muted-foreground">{t('canvas.help.3')}</p>
                </>
              )}
              {selectedChat && (
                <>
                  <div className="font-semibold">{selectedChat.title}</div>
                  <div className="text-muted-foreground">{selectedChat.name}</div>
                  <div className="flex gap-4 text-sm">
                    <span><strong>{selectedChat.facts}</strong> {t('canvas.facts', { n: selectedChat.facts })}</span>
                    <span><strong>{selectedChat.chapters}</strong> {t('canvas.chapters', { n: selectedChat.chapters })}</span>
                  </div>
                  <div className="text-sm">
                    <span className="text-muted-foreground">{t('canvas.continues')}: </span>
                    {selectedParent ? selectedParent.title : t('canvas.continuesNone')}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleUnlink}
                      disabled={!selectedParent}
                    >
                      <LinkBreak className="mr-1.5 h-4 w-4" />
                      {t('canvas.unlink')}
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleRemoveNode(selectedChat.id)}
                      title={t('canvas.removeHint')}
                    >
                      <Trash className="mr-1.5 h-4 w-4" />
                      {t('canvas.remove')}
                    </Button>
                  </div>
                </>
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  )
}
