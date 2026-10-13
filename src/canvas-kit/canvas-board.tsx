import { useRef, useState, useEffect, useCallback } from 'react'
import { DotsThree, X, Plus, Minus, CornersOut, LinkSimple } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { BoardKind, Graph, CanvasNode, CanvasEdge, Verdict } from './graph'
import { splitEnd, canConnect, connect, removeEdge, moveNode, insertOnEdge } from './graph'

const CARD_W = 200
const CARD_H = 74

export interface CanvasBoardProps {
  board: BoardKind
  graph: Graph
  editable: boolean
  onChange: (next: Graph, label: string) => void
  onRemoveNode?: (id: string) => void
  onOpenNode?: (id: string) => void
  reasonText: (coreReason: string) => string
  selectedId: string | null
  onSelect: (id: string | null) => void
  fitSignal?: number
  /** a short third line on a card (counts, last activity) */
  nodeMeta?: (node: CanvasNode) => string
}

interface ViewState {
  x: number
  y: number
  k: number
}

interface DragState {
  type: 'pan' | 'node' | 'wire'
  pointerId: number
  sx: number
  sy: number
  vx?: number
  vy?: number
  nodeId?: string
  dx?: number
  dy?: number
  from?: string
  startPort?: { x: number; y: number }
  moved?: boolean
}

export function CanvasBoard({
  board,
  graph,
  editable,
  onChange,
  onRemoveNode,
  onOpenNode,
  reasonText,
  selectedId,
  onSelect,
  fitSignal,
  nodeMeta,
}: CanvasBoardProps) {
  const stageRef = useRef<HTMLDivElement>(null)
  const worldRef = useRef<HTMLDivElement>(null)
  const [view, setView] = useState<ViewState>({ x: 40, y: 40, k: 1 })
  const [drag, setDrag] = useState<DragState | null>(null)
  const [reason, setReason] = useState<{ text: string; x: number; y: number; bad: boolean } | null>(null)
  const [hotEdge, setHotEdge] = useState<string | null>(null)
  const [insertTarget, setInsertTarget] = useState<string | null>(null)
  const [dragEnd, setDragEnd] = useState<{ x: number; y: number } | null>(null)

  const typeDef = (id: string) => board.types[graph.nodes.find(n => n.id === id)?.type || ''] 
  const nodeById = (id: string) => graph.nodes.find(n => n.id === id)
  const edgeById = (id: string) => graph.edges.find(e => e.id === id)

  const toWorld = useCallback((cx: number, cy: number) => {
    const r = stageRef.current!.getBoundingClientRect()
    return { x: (cx - r.left - view.x) / view.k, y: (cy - r.top - view.y) / view.k }
  }, [view])

  // A card being dragged shows at its live position; the graph changes on release.
  const [live, setLive] = useState<{ id: string; x: number; y: number } | null>(null)
  const posOf = (n: CanvasNode) => (live && live.id === n.id ? { x: live.x, y: live.y } : { x: n.x, y: n.y })
  const outPos = (id: string) => {
    const n = nodeById(id)
    if (!n) return null
    const p = posOf(n)
    return { x: p.x + CARD_W / 2, y: p.y + CARD_H }
  }
  const inPos = (id: string) => {
    const n = nodeById(id)
    if (!n) return null
    const p = posOf(n)
    return { x: p.x + CARD_W / 2, y: p.y }
  }
  const portId = (n: CanvasNode, side: 'in' | 'out') => board.types[n.type]?.ports.find((p) => p.side === side)?.id ?? side

  // Wires leave a card downwards and enter the next one from above.
  const curve = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    const dy = Math.max(40, Math.abs(b.y - a.y) * 0.5)
    return `M${a.x},${a.y} C${a.x},${a.y + dy} ${b.x},${b.y - dy} ${b.x},${b.y}`
  }

  const fitAll = useCallback(() => {
    const nodes = graph.nodes
    if (!nodes.length) return
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity
    nodes.forEach(n => {
      x1 = Math.min(x1, n.x)
      y1 = Math.min(y1, n.y)
      x2 = Math.max(x2, n.x + CARD_W)
      y2 = Math.max(y2, n.y + CARD_H)
    })
    const sw = stageRef.current?.clientWidth || 0
    const sh = stageRef.current?.clientHeight || 0
    if (!sw || !sh) return
    const minK = sw < 600 ? 0.75 : 0.35
    const k = Math.min(1.2, Math.max(minK, Math.min((sw - 80) / (x2 - x1), (sh - 80) / (y2 - y1))))
    const fits = (x2 - x1) * k <= sw - 40
    const v = {
      k,
      x: fits ? (sw - (x2 - x1) * k) / 2 - x1 * k : 20 - x1 * k,
      y: (y2 - y1) * k <= sh - 40 ? (sh - (y2 - y1) * k) / 2 - y1 * k : 20 - y1 * k,
    }
    setView(v)
  }, [graph.nodes])

  useEffect(() => {
    if (fitSignal !== undefined) fitAll()
  }, [fitSignal, fitAll])

  const zoomAt = (f: number, cx?: number, cy?: number) => {
    const stage = stageRef.current!
    const px = cx ?? stage.clientWidth / 2
    const py = cy ?? stage.clientHeight / 2
    setView(v => {
      const k = Math.min(2, Math.max(0.35, v.k * f))
      const nv = {
        k,
        x: px - (px - v.x) * (k / v.k),
        y: py - (py - v.y) * (k / v.k),
      }
      return nv
    })
  }

  const showReason = (text: string, x: number, y: number, bad = false) => {
    setReason({ text, x, y, bad })
  }

  const clearReason = () => setReason(null)

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    const target = e.target as HTMLElement
    // zoom buttons and the wire's delete button: pointer capture on the stage would swallow their click
    const ctl = target.closest('button')
    if (ctl && !ctl.hasAttribute('data-node')) return
    const port = target.closest('[data-port-out]')
    const nodeEl = target.closest('[data-node]')
    const edgeHit = target.closest('[data-edge-hit]')

    if (port && editable) {
      const nodeId = (port.closest('[data-node]') as HTMLElement).dataset.node!
      const sp = outPos(nodeId)
      if (sp) {
        e.preventDefault()
        setDrag({ type: 'wire', pointerId: e.pointerId, sx: e.clientX, sy: e.clientY, from: nodeId, startPort: sp })
        stageRef.current!.setPointerCapture(e.pointerId)
      }
      return
    }

    if (nodeEl) {
      const id = (nodeEl as HTMLElement).dataset.node!
      onSelect(id)
      if (editable || !target.closest('button')) {
        const n = nodeById(id)
        if (n && editable) {
          const w = toWorld(e.clientX, e.clientY)
          setDrag({ type: 'node', pointerId: e.pointerId, sx: e.clientX, sy: e.clientY, nodeId: id, dx: w.x - n.x, dy: w.y - n.y, moved: false })
          stageRef.current!.setPointerCapture(e.pointerId)
        }
      }
      return
    }

    if (edgeHit) {
      const id = (edgeHit as HTMLElement).dataset.edgeHit!
      onSelect(id)
      return
    }

    onSelect(null)
    setDrag({ type: 'pan', pointerId: e.pointerId, sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y })
    stageRef.current!.setPointerCapture(e.pointerId)
  }

  /** The wire (not touching `nodeId`) that passes closest to the card's centre, within reach, or null. */
  const edgeUnder = (nodeId: string, cx: number, cy: number): string | null => {
    let best: string | null = null
    let bestD = 60
    for (const e of graph.edges) {
      if (e.locked) continue
      const [fa] = splitEnd(e.from)
      const [ta] = splitEnd(e.to)
      if (fa === nodeId || ta === nodeId) continue
      const a = outPos(fa)
      const b = inPos(ta)
      if (!a || !b) continue
      const dy = Math.max(40, Math.abs(b.y - a.y) * 0.5)
      for (let i = 0; i <= 24; i++) {
        const u = i / 24
        const m = 1 - u
        const x = m ** 3 * a.x + 3 * m * m * u * a.x + 3 * m * u * u * b.x + u ** 3 * b.x
        const y = m ** 3 * a.y + 3 * m * m * u * (a.y + dy) + 3 * m * u * u * (b.y - dy) + u ** 3 * b.y
        const d = Math.hypot(x - cx, y - cy)
        if (d < bestD) {
          bestD = d
          best = e.id
        }
      }
    }
    return best
  }

  const verdictFor = (fromId: string, toId: string): Verdict => {
    const fromN = nodeById(fromId)
    const toN = nodeById(toId)
    if (!fromN || !toN) return { ok: false, reason: 'Unknown port' }
    return canConnect(board, graph, `${fromId}:${portId(fromN, 'out')}`, `${toId}:${portId(toN, 'in')}`)
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!drag || e.pointerId !== drag.pointerId) return

    if (drag.type === 'pan') {
      const v = { ...view, x: (drag.vx || 0) + e.clientX - drag.sx, y: (drag.vy || 0) + e.clientY - drag.sy }
      setView(v)
      return
    }

    if (drag.type === 'node' && drag.nodeId) {
      const w = toWorld(e.clientX, e.clientY)
      const n = nodeById(drag.nodeId)
      if (n) {
        const nx = Math.round(w.x - (drag.dx || 0))
        const ny = Math.round(w.y - (drag.dy || 0))
        if (drag.moved || Math.abs(e.clientX - drag.sx) + Math.abs(e.clientY - drag.sy) > 4) {
          if (!drag.moved) setDrag(d => (d ? { ...d, moved: true } : d))
          setLive({ id: n.id, x: nx, y: ny })
          setInsertTarget(editable ? edgeUnder(n.id, nx + CARD_W / 2, ny + CARD_H / 2) : null)
        }
      }
      return
    }

    if (drag.type === 'wire') {
      const w = toWorld(e.clientX, e.clientY)
      setDragEnd(w)
      const el = document.elementFromPoint(e.clientX, e.clientY)
      const inP = el?.closest('[data-port-in]') ?? el?.closest('[data-node]')
      if (inP) {
        const toNode = (inP.closest('[data-node]') as HTMLElement)?.dataset.node
        if (toNode && drag.from) {
          const verdict = verdictFor(drag.from, toNode)
          if (verdict.ok) {
            showReason(verdict.replaces ? reasonText('Already connected') : '', e.clientX, e.clientY)
          } else {
            showReason(reasonText(verdict.reason), e.clientX, e.clientY, true)
          }
        }
      } else {
        clearReason()
      }
    }
  }

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!drag || e.pointerId !== drag.pointerId) return
    setDrag(null)
    setDragEnd(null)
    setLive(null)
    clearReason()
    setHotEdge(null)
    setInsertTarget(null)

    if (drag.type === 'node' && drag.nodeId && drag.moved) {
      const w = toWorld(e.clientX, e.clientY)
      const nx = Math.round(w.x - (drag.dx || 0))
      const ny = Math.round(w.y - (drag.dy || 0))
      const moved = moveNode(graph, drag.nodeId, nx, ny)
      const target = editable ? edgeUnder(drag.nodeId, nx + CARD_W / 2, ny + CARD_H / 2) : null
      if (target) {
        const ins = insertOnEdge(board, moved, target, drag.nodeId)
        if (ins.ok) {
          onChange(ins.graph, 'insert')
          return
        }
        showReason(reasonText(ins.reason ?? ''), e.clientX, e.clientY, true)
        setTimeout(clearReason, 2500)
      }
      onChange(moved, 'move')
      return
    }

    if (drag.type === 'wire' && drag.from) {
      const el = document.elementFromPoint(e.clientX, e.clientY)
      const inP = el?.closest('[data-port-in]') ?? el?.closest('[data-node]')
      if (inP) {
        const toNode = (inP.closest('[data-node]') as HTMLElement)?.dataset.node
        if (toNode) {
          const fromN = nodeById(drag.from)
          const toN = nodeById(toNode)
          if (!fromN || !toN) return
          const result = connect(board, graph, `${drag.from}:${portId(fromN, 'out')}`, `${toNode}:${portId(toN, 'in')}`, `e${Date.now()}`)
          if (result.verdict.ok) {
            onChange(result.graph, 'connect')
          } else {
            showReason(reasonText(result.verdict.reason), e.clientX, e.clientY, true)
            setTimeout(clearReason, 2000)
          }
        }
      }
    }
  }

  const handleDoubleClick = (e: React.MouseEvent, id: string) => {
    if (onOpenNode) onOpenNode(id)
  }

  const handleDeleteEdge = (id: string) => {
    if (!editable) return
    const next = removeEdge(graph, id)
    onChange(next, 'disconnect')
    onSelect(null)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setDrag(null)
      setDragEnd(null)
      clearReason()
      return
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && editable && selectedId) {
      e.preventDefault()
      if (edgeById(selectedId)) {
        handleDeleteEdge(selectedId)
      } else if (onRemoveNode && nodeById(selectedId)) {
        onRemoveNode(selectedId)
      }
    }
  }

  const handleWheel = (e: WheelEvent) => {
    e.preventDefault()
    const r = stageRef.current!.getBoundingClientRect()
    if (e.ctrlKey || e.metaKey) {
      zoomAt(Math.exp(-e.deltaY * 0.01), e.clientX - r.left, e.clientY - r.top)
    } else {
      setView(v => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }))
    }
  }

  // React registers wheel listeners as passive, where preventDefault is ignored: attach it by hand.
  const wheelRef = useRef(handleWheel)
  wheelRef.current = handleWheel
  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    const on = (e: WheelEvent) => wheelRef.current(e)
    el.addEventListener('wheel', on, { passive: false })
    return () => el.removeEventListener('wheel', on)
  }, [])

  const nodeDefs = (n: CanvasNode) => board.types[n.type]

  const edgePath = (e: CanvasEdge) => {
    const [fromNodeId] = splitEnd(e.from)
    const [toNodeId] = splitEnd(e.to)
    const a = outPos(fromNodeId)
    const b = inPos(toNodeId)
    if (!a || !b) return null
    return { d: curve(a, b), a, b }
  }

  const selectedEdge = selectedId ? edgeById(selectedId) : null

  return (
    <div
      ref={stageRef}
      className="relative h-full w-full overflow-hidden bg-background touch-none select-none outline-none"
      style={{ backgroundImage: 'radial-gradient(var(--border) 1px, transparent 1px)', backgroundSize: '22px 22px' }}
      role="application"
      aria-label="Canvas board"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      <div ref={worldRef} className="absolute left-0 top-0" style={{ transformOrigin: '0 0', transform: `translate(${view.x}px,${view.y}px) scale(${view.k})` }}>
        <svg className="absolute left-0 top-0 h-px w-px overflow-visible pointer-events-none">
          {graph.edges.map(e => {
            const p = edgePath(e)
            if (!p) return null
            if (e.locked) return <path key={e.id} d={p.d} fill="none" stroke="var(--muted-foreground)" strokeOpacity={0.6} strokeWidth={1.5} strokeDasharray="5 4" />
            const selected = selectedId === e.id
            const hot = insertTarget === e.id
            return (
              <g key={e.id}>
                <path d={p.d} fill="none" stroke={selected || hot ? 'var(--primary)' : 'var(--muted-foreground)'} strokeWidth={selected || hot ? 3 : 2} strokeDasharray={hot ? '6 4' : undefined} />
                <path
                  d={p.d}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={16}
                  className="cursor-pointer"
                  style={{ pointerEvents: 'stroke' }}
                  data-edge-hit={e.id}
                />
              </g>
            )
          })}
          {drag?.type === 'wire' && drag.startPort && dragEnd && (
            <path d={curve(drag.startPort, dragEnd)} fill="none" stroke="var(--primary)" strokeWidth={2} strokeDasharray="6 4" />
          )}
        </svg>
        {graph.nodes.map(n => {
          const def = nodeDefs(n)
          const selected = selectedId === n.id
          const pos = posOf(n)
          const wireFrom = drag?.type === 'wire' ? drag.from : undefined
          const glow = wireFrom && wireFrom !== n.id ? (verdictFor(wireFrom, n.id).ok ? 'ok' : 'bad') : undefined
          const color = `var(--${def.colorVar})`
          return (
            <button
              key={n.id}
              data-node={n.id}
              className={cn(
                'absolute flex flex-col rounded-lg border bg-card shadow-md',
                selected && 'ring-2 ring-ring'
              )}
              style={{ left: pos.x, top: pos.y, width: CARD_W, height: CARD_H }}
              onDoubleClick={e => handleDoubleClick(e, n.id)}
            >
              <div className="h-1 rounded-t-lg" style={{ background: color }} />
              <div className="flex flex-1 items-center gap-2 px-2">
                <div className="flex-1 min-w-0">
                  <div className="truncate text-sm font-semibold">{n.title}</div>
                  {n.subtitle && <div className="truncate text-xs text-muted-foreground">{n.subtitle}</div>}
                  {nodeMeta && <div className="truncate text-[11px] text-muted-foreground/80">{nodeMeta(n)}</div>}
                </div>
                {editable && (
                  <span
                    className="rounded p-1 hover:bg-muted"
                    onClick={e => {
                      e.stopPropagation()
                      onSelect(n.id)
                    }}
                    title="Menu"
                  >
                    <DotsThree size={16} />
                  </span>
                )}
              </div>
              <div
                data-port-in
                className={cn(
                  'absolute left-1/2 top-0 h-3 w-3 -translate-x-1/2 -translate-y-1/2 cursor-crosshair rounded-full border-2 bg-card',
                  glow === 'ok' && 'scale-150 ring-4 ring-emerald-500/70',
                  glow === 'bad' && 'ring-2 ring-destructive/60'
                )}
                style={{ borderColor: color }}
              />
              <div
                data-port-out
                className="absolute left-1/2 bottom-0 h-3 w-3 -translate-x-1/2 translate-y-1/2 cursor-crosshair rounded-sm border-2"
                style={{ background: color, borderColor: color }}
              />
            </button>
          )
        })}
      </div>
      {selectedEdge && editable && (
        <div
          className="absolute z-10 flex h-6 w-6 items-center justify-center rounded-full border bg-card shadow"
          style={{
            left: 0,
            top: 0,
            transform: `translate(-50%, -50%) translate(${(() => {
              const p = edgePath(selectedEdge)
              if (!p) return '0px,0px'
              return `${(p.a.x + p.b.x) / 2 * view.k + view.x}px,${(p.a.y + p.b.y) / 2 * view.k + view.y}px`
            })()})`,
          }}
        >
          <button onClick={() => handleDeleteEdge(selectedEdge.id)} title="Delete wire">
            <X size={12} className="text-destructive" />
          </button>
        </div>
      )}
      {reason && (
        <div
          className={cn(
            'fixed z-50 max-w-60 rounded-md px-2 py-1 text-xs shadow',
            reason.bad ? 'bg-destructive text-destructive-foreground' : 'bg-foreground text-background'
          )}
          style={{ left: reason.x + 14, top: reason.y + 16, pointerEvents: 'none' }}
        >
          {reason.text}
        </div>
      )}
      <div className="absolute bottom-3 right-3 flex flex-col gap-1">
        <Button variant="outline" size="icon-sm" onClick={() => zoomAt(1.2)} title="Zoom in">
          <Plus size={14} />
        </Button>
        <Button variant="outline" size="icon-sm" onClick={() => zoomAt(1 / 1.2)} title="Zoom out">
          <Minus size={14} />
        </Button>
        <Button variant="outline" size="icon-sm" onClick={fitAll} title="Fit">
          <CornersOut size={14} />
        </Button>
      </div>
    </div>
  )
}
