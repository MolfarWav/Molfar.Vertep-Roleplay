import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowCounterClockwise, ArrowClockwise, Sparkle, FrameCorners, PencilSimple, Eye, ListBullets, Graph as GraphIcon, CaretRight, Info, LinkBreak, Trash, ArrowsClockwise, Robot, ListChecks } from '@phosphor-icons/react'
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
import { useApp } from '@/lib/store'
import { toast } from 'sonner'
import { ChatShelf } from './chat-shelf'
import { BoardMenu } from './board-menu'
import { PromptBoard } from './prompt-board'
import { AgentForge } from './agent-forge'
import { AgentSets } from './forge/agent-sets'
import { useGuidePlace } from '@/components/guide/place'
import { BOARD_KEY, useCanvasBoard, writeCanvasBoard, type CanvasBoardKey } from '@/lib/canvas-board'

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
const PLACED_KEY = 'rp.canvas.chatLinks.placed'
const DRAG_TYPE = 'application/x-vertep-chat'
const SHELF_COLLAPSED_KEY = 'rp.canvas.shelf.collapsed'
export { BOARD_KEY }
const PROMPT_CHAT_KEY = 'rp.canvas.prompt.chatId'

/** The Chat links board (which chats sit on it, and where) lives in the app's settings, so it comes
 *  back on every open and follows the user to another device; the browser copy of older versions is
 *  read once and moved over by the first save. */
type BoardState = { placed: string[]; positions: Record<string, { x: number; y: number }> }
const boardState = (): BoardState => {
  const saved = useApp.getState().settings.canvasBoard
  return {
    placed: saved?.placed ?? storage.get<string[]>(PLACED_KEY, []),
    positions: saved?.positions ?? storage.get<Record<string, { x: number; y: number }>>(POSITIONS_KEY, {}),
  }
}
const saveBoardState = (part: Partial<BoardState>) => {
  const cur = useApp.getState().settings.canvasBoard
  // the board's id, name and order (named boards) ride along with what changed
  const next = { ...cur, ...boardState(), ...part }
  if (JSON.stringify(next) === JSON.stringify(cur)) return
  useApp.getState().updateSettings({ canvasBoard: next })
}

/** Every chat linked to `id` through "continues" or "forked from", in either direction (`id` first). */
const chainIn = (chats: LitChatItem[], id: string): string[] => {
  const near = new Map<string, string[]>()
  const tie = (a: string, b: string) => {
    near.set(a, [...(near.get(a) ?? []), b])
    near.set(b, [...(near.get(b) ?? []), a])
  }
  const ids = new Set(chats.map((c) => c.id))
  for (const c of chats) {
    if (c.continues && ids.has(c.continues)) tie(c.id, c.continues)
    if (c.parentChatId && ids.has(c.parentChatId)) tie(c.id, c.parentChatId)
  }
  const seen = new Set([id])
  const queue = [id]
  while (queue.length) {
    for (const n of near.get(queue.shift() as string) ?? []) {
      if (!seen.has(n)) {
        seen.add(n)
        queue.push(n)
      }
    }
  }
  return [...seen]
}

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
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>(
    boardState().positions
  )
  const [shelfCollapsed, setShelfCollapsed] = useState(
    storage.get<boolean>(SHELF_COLLAPSED_KEY, false)
  )
  const [shelfDropActive, setShelfDropActive] = useState(false)
  const shelfRef = useRef<HTMLDivElement>(null)
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

  // the open board is shared with the rail (its Agents item opens this board), so it lives in lib/canvas-board
  const board = useCanvasBoard()
  const pickBoard = useCallback((b: CanvasBoardKey) => writeCanvasBoard(b), [])
  // the guide's tours follow the board on screen; "Show me" can switch it
  useEffect(() => {
    const onBoard = (e: Event) => {
      const b = (e as CustomEvent).detail
      if (b === 'links' || b === 'prompt' || b === 'agents' || b === 'sets') pickBoard(b)
    }
    window.addEventListener('rp-guide-board', onBoard)
    return () => window.removeEventListener('rp-guide-board', onBoard)
  }, [pickBoard])
  const [promptChatPick, setPromptChatPick] = useState<string | null>(storage.get<string | null>(PROMPT_CHAT_KEY, null))
  const pickPromptChat = useCallback((id: string) => {
    setPromptChatPick(id)
    storage.set(PROMPT_CHAT_KEY, id)
  }, [])
  // the picked chat while it exists, else the most recently active one
  const promptChatId = useMemo(() => {
    if (promptChatPick && allChats.some((c) => c.id === promptChatPick)) return promptChatPick
    return allChats.reduce<LitChatItem | null>((a, c) => (!a || c.updatedAt > a.updatedAt ? c : a), null)?.id ?? null
  }, [promptChatPick, allChats])
  const onBoard = useMemo(() => new Set(graph.nodes.map((n) => n.id)), [graph])
  const shelfChats = useMemo(
    () => allChats.filter((c) => !onBoard.has(c.id)),
    [allChats, onBoard]
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
      if (coreReason.includes('Replaces')) return t('canvas.why.replace')
      return t('canvas.why.unknown')
    },
    [t]
  )

  // `t` is a new function on every render; the loader reads it through a ref so it stays stable
  const tRef = useRef(t)
  tRef.current = t

  const chainOf = useCallback((id: string) => chainIn(allChats, id), [allChats])
  // a chat has a chain when another chat continues it or forks from it, or it does so itself
  const hasChain = useCallback(
    (id: string) => allChats.some((c) => (c.id === id && (c.continues || c.parentChatId)) || c.continues === id || c.parentChatId === id),
    [allChats]
  )


  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { items } = await fetchLitChats()
      setChats(items)
      const focus = takeCanvasFocus()
      const known = items.some((c) => c.id === focus)
      if (focus && known) setSelectedId(focus)
      const pos = boardState().positions
      setPositions(pos)
      const placedIds = new Set(boardState().placed.filter((id) => items.some((c) => c.id === id)))
      // the Library's "Edit links on the canvas" lands on its chat: one not on the board comes with its chain
      if (focus && known && !placedIds.has(focus)) for (const id of chainIn(items, focus)) placedIds.add(id)
      const g = boardFromChats(items.filter((c) => placedIds.has(c.id)), pos)
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

  // Persist placed ids whenever graph changes after load
  useEffect(() => {
    if (loadedRef.current) {
      const placedIds = graph.nodes.map((n) => n.id)
      saveBoardState({ placed: placedIds })
    }
  }, [graph])

  // Write the links that differ from what is stored (putting a chat on the board brings its stored
  // links back, which are no change), and keep the stored copy current for the next comparison.
  const writeLinks = useCallback(
    async (prev: Graph, next: Graph) => {
      const stored = new Map(allChats.map((c) => [c.id, c.continues ?? null]))
      for (const ch of linkChanges(prev, next)) {
        if (!stored.has(ch.chatId) || stored.get(ch.chatId) === ch.from) continue
        await setLitLink(ch.chatId, ch.from)
        setChats((cs) => (cs ? cs.map((c) => (c.id === ch.chatId ? { ...c, continues: ch.from } : c)) : cs))
      }
    },
    [allChats]
  )

  const persistGraph = useCallback(
    async (prev: Graph, next: Graph, toastLabel?: string) => {
      try {
        await writeLinks(prev, next)
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
        toast.error(t('canvas.saveFailed'))
      }
    },
    [t, writeLinks]
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
      saveBoardState({ positions: pos })
      persistGraph(prev, next, label)
    },
    [graph, history, persistGraph]
  )
  const placeChats = useCallback(
    (ids: string[], at?: { x: number; y: number }) => {
      const validIds = ids.filter((id) => allChats.some((c) => c.id === id) && !onBoard.has(id))
      if (validIds.length === 0) return
      // the new cards keep their own tree shape (laid out alone), set beside the cards already there:
      // a dropped card goes under the pointer, a "+" or a chain to the right of the right-most card
      const own = boardFromChats(allChats.filter((c) => validIds.includes(c.id)))
      const minX = Math.min(...own.nodes.map((n) => n.x))
      const minY = Math.min(...own.nodes.map((n) => n.y))
      const first = own.nodes.find((n) => n.id === validIds[0])
      let dx: number
      let dy: number
      if (at && first) {
        dx = at.x - 100 - first.x
        dy = at.y - 37 - first.y
      } else {
        const rightMost = graph.nodes.reduce((max, n) => Math.max(max, n.x), -Infinity)
        const top = graph.nodes.reduce((min, n) => Math.min(min, n.y), Infinity)
        dx = (rightMost === -Infinity ? 0 : rightMost + 260) - minX
        dy = (top === Infinity ? 0 : top) - minY
      }
      const newPositions: Record<string, { x: number; y: number }> = {}
      for (const n of own.nodes) newPositions[n.id] = { x: Math.round(n.x + dx), y: Math.round(n.y + dy) }
      const positionsWithNew = { ...positions, ...newPositions }
      setPositions(positionsWithNew)
      saveBoardState({ positions: positionsWithNew })
      const newOnBoard = new Set([...onBoard, ...validIds])
      const next = boardFromChats(
        allChats.filter((c) => newOnBoard.has(c.id)),
        positionsWithNew
      )
      handleChange(next, 'add')
      setSelectedId(validIds[0])
      // a card dropped by hand is where the user looks; one added by a button may be off screen
      if (!at) setFitSignal((s) => s + 1)
    },
    [allChats, onBoard, positions, graph, handleChange]
  )

  const handleRemoveNode = useCallback(
    (id: string) => {
      const chat = allChats.find((c) => c.id === id)
      if (!chat) return
      const next = removeNode(graph, id)
      handleChange(next, 'remove')
      if (selectedId === id) setSelectedId(null)
    },
    [allChats, graph, handleChange, selectedId]
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
    writeLinks(history.present, next.present).catch(() => {
      toast.error(t('canvas.saveFailed'))
    })
  }, [history, t, writeLinks])

  undoRef.current = handleUndo

  const handleRedo = useCallback(() => {
    const next = redoHistory(history)
    if (next.present === history.present) return
    setHistory(next)
    setGraph(next.present)
    writeLinks(history.present, next.present).catch(() => {
      toast.error(t('canvas.saveFailed'))
    })
  }, [history, t, writeLinks])

  const handleTidy = useCallback(() => {
    const next = layoutForest(graph)
    handleChange(next, 'tidy')
  }, [graph, handleChange])

  const handleExternalDrop = useCallback(
    (data: string, at: { x: number; y: number }) => {
      if (allChats.some((c) => c.id === data) && !onBoard.has(data)) {
        placeChats([data], at)
      }
    },
    [allChats, onBoard, placeChats]
  )

  const handleNodeDragMove = useCallback(
    (id: string, clientX: number, clientY: number) => {
      if (shelfRef.current) {
        const rect = shelfRef.current.getBoundingClientRect()
        const inside =
          clientX >= rect.left &&
          clientX <= rect.right &&
          clientY >= rect.top &&
          clientY <= rect.bottom
        setShelfDropActive(inside)
      }
    },
    []
  )

  const handleNodeDropOutside = useCallback(
    (id: string, clientX: number, clientY: number) => {
      if (shelfRef.current) {
        const rect = shelfRef.current.getBoundingClientRect()
        const inside =
          clientX >= rect.left &&
          clientX <= rect.right &&
          clientY >= rect.top &&
          clientY <= rect.bottom
        if (inside) {
          handleRemoveNode(id)
          setShelfDropActive(false)
          return true
        }
      }
      setShelfDropActive(false)
      return false
    },
    [handleRemoveNode]
  )

  useEffect(() => {
    const onPointerUp = () => setShelfDropActive(false)
    window.addEventListener('pointerup', onPointerUp)
    return () => window.removeEventListener('pointerup', onPointerUp)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // the prompt board keeps its own undo
      if (board !== 'links') return
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
  }, [handleUndo, handleRedo, board])

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

  // The list shows every chat, placed or not, so it reads and edits the stored links of all of them;
  // the board then shows the change for the chats it holds.
  const fullGraph = useMemo(() => boardFromChats(allChats), [allChats])

  const handleListChange = useCallback(
    (chatId: string, fromId: string | null) => {
      const from = fromId ? `${fromId}:next` : null
      const to = `${chatId}:prev`
      const existing = fullGraph.edges.find((e) => e.to === to && !e.locked)
      let next = existing ? removeEdge(fullGraph, existing.id) : fullGraph
      if (from) {
        const verdict = canConnect(CHAT_LINKS, next, from, to)
        if (verdict.ok) {
          next = applyConnect(CHAT_LINKS, next, from, to, `e-${Date.now()}`).graph
        }
      }
      writeLinks(fullGraph, next)
        .then(() => {
          const items = allChats.map((c) => (c.id === chatId ? { ...c, continues: fromId } : c))
          const g = boardFromChats(items.filter((c) => onBoard.has(c.id)), positions)
          setGraph(g)
          setHistory(historyOf(g))
        })
        .catch(() => toast.error(t('canvas.saveFailed')))
    },
    [fullGraph, writeLinks, allChats, onBoard, positions, t]
  )

  // A chat may continue any other chat that does not create a loop, judged over all stored links
  // without this chat's own current link; its current parent always stays in the list.
  const canBeParent = useCallback(
    (chatId: string, parentId: string): boolean => {
      const base: Graph = { nodes: fullGraph.nodes, edges: fullGraph.edges.filter((e) => e.to !== `${chatId}:prev`) }
      return canConnect(CHAT_LINKS, base, `${parentId}:next`, `${chatId}:prev`).ok
    },
    [fullGraph]
  )

  useGuidePlace(board === 'prompt' ? 'canvas.prompt' : 'canvas.links', board !== 'agents' && board !== 'sets' && !loading && !error && allChats.length > 0)

  // the agent editor works on files, not on chats, so it needs none of the chat data below
  if (loading && board !== 'agents' && board !== 'sets') {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        {t('canvas.loading')}
      </div>
    )
  }

  if (error && board !== 'agents' && board !== 'sets') {
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

  if (allChats.length === 0 && board !== 'agents' && board !== 'sets') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
        <div className="text-lg font-semibold">{t('canvas.empty.title')}</div>
        <div className="text-sm text-muted-foreground">{t('canvas.empty.body')}</div>
        <Button variant="outline" className="mt-2 max-md:h-10" onClick={() => pickBoard('agents')}>
          <Robot className="mr-2 h-4 w-4" />
          {t('fg.open')}
        </Button>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col" role="application" aria-label={t('canvas.title')}>
      <header className="flex flex-wrap items-center gap-2 border-b border-border bg-card px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground max-md:hidden">
          {t('canvas.boards')}
        </span>
        <div data-guide="canvas.boards" className="flex rounded-lg bg-muted p-0.5">
          <button
            className={cn(
              'flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-semibold max-md:min-h-10 max-md:px-2 max-md:py-2 max-md:text-[13px]',
              board === 'links' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground'
            )}
            aria-pressed={board === 'links'}
            onClick={() => pickBoard('links')}
          >
            <LinkBreak className="h-4 w-4 max-md:hidden" />
            {t('canvas.board.links')}
          </button>
          <button
            data-guide="canvas.board-prompt"
            className={cn(
              'flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-semibold max-md:min-h-10 max-md:px-2 max-md:py-2 max-md:text-[13px]',
              board === 'prompt' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground'
            )}
            aria-pressed={board === 'prompt'}
            onClick={() => {
              // the chat selected on the links board is the one whose prompt the user wants to see
              if (selectedId) pickPromptChat(selectedId)
              pickBoard('prompt')
            }}
          >
            <GraphIcon className="h-4 w-4 max-md:hidden" />
            {t('canvas.board.prompt')}
          </button>
          <button
            data-guide="canvas.board-agents"
            data-testid="board-agents"
            className={cn(
              'flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-semibold max-md:min-h-10 max-md:px-2 max-md:py-2 max-md:text-[13px]',
              board === 'agents' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground'
            )}
            aria-pressed={board === 'agents'}
            onClick={() => pickBoard('agents')}
          >
            <Robot className="h-4 w-4 max-md:hidden" />
            {t('canvas.board.agents')}
          </button>
          <button
            data-testid="board-sets"
            className={cn(
              'flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-semibold max-md:min-h-10 max-md:px-2 max-md:py-2 max-md:text-[13px]',
              board === 'sets' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground'
            )}
            aria-pressed={board === 'sets'}
            onClick={() => pickBoard('sets')}
          >
            <ListChecks className="h-4 w-4 max-md:hidden" />
            {t('canvas.board.sets')}
          </button>
        </div>

        {!isMobile && board === 'links' && (
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
            <BoardMenu onChanged={() => { setSelectedId(null); loadData() }} />
          </>
        )}

        <div className="flex-1" />

        {board !== 'agents' && board !== 'sets' && <div data-guide="canvas.mode" className={cn('rounded-lg bg-muted p-0.5', isMobile ? 'hidden' : 'flex')}>
          <button
            className={cn(
              'flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-semibold max-md:min-h-10 max-md:px-2 max-md:py-2 max-md:text-[13px]',
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
              'flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-semibold max-md:min-h-10 max-md:px-2 max-md:py-2 max-md:text-[13px]',
              !editable ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
            )}
            aria-pressed={!editable}
            onClick={() => setEditable(false)}
          >
            <Eye className="h-4 w-4" />
            {t('canvas.mode.view')}
          </button>
        </div>}

        {isMobile && board !== 'agents' && board !== 'sets' && (
          <div className="flex rounded-lg bg-muted p-0.5">
            <button
              className={cn(
                'flex h-9 min-w-10 items-center justify-center rounded-md px-2.5 text-sm font-semibold',
                !phoneList ? 'bg-card text-foreground shadow-sm ring-1 ring-border' : 'text-muted-foreground'
              )}
              aria-pressed={!phoneList}
              aria-label={t('canvas.graph')}
              title={t('canvas.graph')}
              onClick={() => setPhoneList(false)}
            >
              <GraphIcon className="h-4 w-4" />
            </button>
            <button
              className={cn(
                'flex h-9 min-w-10 items-center justify-center rounded-md px-2.5 text-sm font-semibold',
                phoneList ? 'bg-card text-foreground shadow-sm ring-1 ring-border' : 'text-muted-foreground'
              )}
              aria-pressed={phoneList}
              aria-label={t('canvas.list')}
              title={t('canvas.list')}
              onClick={() => setPhoneList(true)}
            >
              <ListBullets className="h-4 w-4" />
            </button>
          </div>
        )}

        {board === 'links' && (
          <>
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
          </>
        )}
      </header>

      {/* the note is about building the links graph, so the Prompt board leaves it out */}
      {isMobile && board === 'links' && (
        <div className="border-b border-border bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground">
          {t('canvas.phoneNote')}
        </div>
      )}

      {board === 'agents' ? (
        <div className="min-h-0 flex-1">
          <AgentForge />
        </div>
      ) : board === 'sets' ? (
        <div className="min-h-0 flex-1">
          <AgentSets onOpenAgents={() => pickBoard('agents')} />
        </div>
      ) : board === 'prompt' ? (
        <div className="min-h-0 flex-1">
          <PromptBoard
            chatId={promptChatId}
            chats={allChats}
            onPickChat={pickPromptChat}
            // on a phone the list is where switches are used; the graph there is for looking
            editable={isMobile ? phoneList : editable}
            phoneList={isMobile && phoneList}
          />
        </div>
      ) : (
      <div className="flex min-h-0 flex-1">
        {!isMobile && editable && !phoneList && !shelfCollapsed && (
          <ChatShelf
            ref={shelfRef}
            chats={shelfChats}
            total={allChats.length}
            dragType={DRAG_TYPE}
            dropActive={shelfDropActive}
            onAdd={(id) => placeChats([id])}
            onAddChain={(id) => placeChats(chainOf(id).filter((c) => !onBoard.has(c)))}
            hasChain={hasChain}
            onCollapse={() => {
              setShelfCollapsed(true)
              storage.set(SHELF_COLLAPSED_KEY, true)
            }}
          />
        )}
        {!isMobile && editable && !phoneList && shelfCollapsed && (
          <div className="w-8 shrink-0 border-r border-border bg-card flex items-center justify-center">
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => {
                setShelfCollapsed(false)
                storage.set(SHELF_COLLAPSED_KEY, false)
              }}
              title={t('canvas.shelf.expand')}
            >
              <CaretRight className="h-4 w-4" />
              <span className="sr-only">{t('canvas.shelf.expand')}</span>
            </Button>
          </div>
        )}
        <div className={cn('min-w-0 flex-1', !isMobile && infoOpen && 'pr-0')}>
          {isMobile && phoneList ? (
            <div className="h-full overflow-auto p-3">
              {allChats.map((chat) => {
                const parentId = chat.continues && allChats.some((c) => c.id === chat.continues) ? chat.continues : null
                const validParents = allChats.filter(
                  (c) => c.id !== chat.id && canBeParent(chat.id, c.id)
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
            <div data-guide="canvas.board" className="relative h-full">
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
                externalDropType={DRAG_TYPE}
                onExternalDrop={handleExternalDrop}
                onNodeDragMove={handleNodeDragMove}
                onNodeDropOutside={handleNodeDropOutside}
              />
              {graph.nodes.length === 0 && !isMobile && editable && !phoneList && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <span className="text-sm text-muted-foreground">{t('canvas.shelf.emptyBoard')}</span>
                </div>
              )}
            </div>
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
      )}
    </div>
  )
}
