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

  const portPos = (el: Element | null) => {
    if (!el) return null
    const r = el.getBoundingClientRect()
    const wr = worldRef.current!.getBoundingClientRect()
    return { x: (r.left + r.width / 2 - wr.left) / view.k, y: (r.top + r.height / 2 - wr.top) / view.k }
  }

  const outPort = (id: string) => worldRef.current?.querySelector(`[data-node="${id}"] [data-port-out]`)
  const inPort = (id: string) => worldRef.current?.querySelector(`[data-node="${id}"] [data-port-in]`)

  const curve = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    const dx = Math.max(40, Math.abs(b.x - a.x) * 0.5)
    return `M${a.x},${a.y} C${a.x + dx},${a.y} ${b.x - dx},${b.y} ${b.x},${b.y}`
  }

  const applyView = (v: ViewState) => {
    if (worldRef.current) {
      worldRef.current.style.transform = `translate(${v.x}px,${v.y}px) scale(${v.k})`
    }
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
    const sw = stageRef.current!.clientWidth
    const sh = stageRef.current!.clientHeight
    const k = Math.min(1.2, Math.max(0.35, Math.min((sw - 80) / (x2 - x1), (sh - 80) / (y2 - y1))))
    const v = {
      k,
      x: (sw - (x2 - x1) * k) / 2 - x1 * k,
      y: (sh - (y2 - y1) * k) / 2 - y1 * k,
    }
    setView(v)
  }, [graph.nodes])

  useEffect(() => {
    if (fitSignal !== undefined) fitAll()
  }, [fitSignal, fitAll])

  useEffect(() => {
    applyView(view)
  }, [view])

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
    const port = target.closest('[data-port-out]')
    const nodeEl = target.closest('[data-node]')
    const edgeHit = target.closest('[data-edge-hit]')

    if (port && editable) {
      const nodeId = (port.closest('[data-node]') as HTMLElement).dataset.node!
      const sp = portPos(port)
      if (sp) {
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
        setDrag(d => ({ ...d!, moved: true }))
        // Optimistic move: don't commit until pointer up
      }
      return
    }

    if (drag.type === 'wire') {
      const w = toWorld(e.clientX, e.clientY)
      setDragEnd(w)
      const el = document.elementFromPoint(e.clientX, e.clientY)
      const inP = el?.closest('[data-port-in]')
      if (inP) {
        const toNode = (inP.closest('[data-node]') as HTMLElement)?.dataset.node
        if (toNode && drag.from) {
          const verdict = canConnect(board, graph, `${drag.from}:out`, `${toNode}:in`)
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
    clearReason()
    setHotEdge(null)
    setInsertTarget(null)

    if (drag.type === 'node' && drag.nodeId && drag.moved) {
      const w = toWorld(e.clientX, e.clientY)
      const nx = Math.round(w.x - (drag.dx || 0))
      const ny = Math.round(w.y - (drag.dy || 0))
      const next = moveNode(graph, drag.nodeId, nx, ny)
      onChange(next, 'move')
      return
    }

    if (drag.type === 'wire' && drag.from) {
      const el = document.elementFromPoint(e.clientX, e.clientY)
      const inP = el?.closest('[data-port-in]')
      if (inP) {
        const toNode = (inP.closest('[data-node]') as HTMLElement)?.dataset.node
        if (toNode) {
          const result = connect(board, graph, `${drag.from}:out`, `${toNode}:in`, `e${Date.now()}`)
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

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const r = stageRef.current!.getBoundingClientRect()
    if (e.ctrlKey || e.metaKey) {
      zoomAt(Math.exp(-e.deltaY * 0.01), e.clientX - r.left, e.clientY - r.top)
    } else {
      setView(v => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }))
    }
  }

  const nodeDefs = (n: CanvasNode) => board.types[n.type]

  const edgePath = (e: CanvasEdge) => {
    const [fromNodeId] = splitEnd(e.from)
    const [toNodeId] = splitEnd(e.to)
    const op = outPort(fromNodeId)
    const ip = inPort(toNodeId)
    if (!op || !ip) return null
    const a = portPos(op)
    const b = portPos(ip)
    if (!a || !b) return null
    return { d: curve(a, b), a, b }
  }

  const selectedEdge = selectedId ? edgeById(selectedId) : null

  return (
    <div
      ref={stageRef}
      className="relative h-full w-full overflow-hidden bg-background touch-none select-none"
      style={{ backgroundImage: 'radial-gradient(var(--border) 1px, transparent 1px)', backgroundSize: '22px 22px' }}
      role="application"
      aria-label="Canvas board"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onWheel={handleWheel}
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      <div ref={worldRef} className="absolute left-0 top-0" style={{ transformOrigin: '0 0' }}>
        <svg className="absolute left-0 top-0 h-px w-px overflow-visible pointer-events-none">
          {graph.edges.map(e => {
            const p = edgePath(e)
            if (!p) return null
            const selected = selectedId === e.id
            return (
              <g key={e.id}>
                <path d={p.d} fill="none" stroke={selected ? 'var(--primary)' : 'var(--muted-foreground)'} strokeWidth={selected ? 3 : 2} />
                <path
                  d={p.d}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={16}
                  className="cursor-pointer pointer-events-stroke"
                  data-edge-hit={e.id}
                />
              </g>
            )
          })}
        </svg>
        {graph.nodes.map(n => {
          const def = nodeDefs(n)
          const selected = selectedId === n.id
          const color = `var(--${def.colorVar})`
          return (
            <button
              key={n.id}
              data-node={n.id}
              className={cn(
                'absolute flex flex-col rounded-lg border bg-card shadow-md',
                selected && 'ring-2 ring-ring'
              )}
              style={{ left: n.x, top: n.y, width: CARD_W, height: CARD_H }}
              onPointerDown={e => e.stopPropagation()}
              onDoubleClick={e => handleDoubleClick(e, n.id)}
            >
              <div className="h-1 rounded-t-lg" style={{ background: color }} />
              <div className="flex flex-1 items-center gap-2 px-2">
                <div className="flex-1 min-w-0">
                  <div className="truncate text-sm font-semibold">{n.title}</div>
                  {n.subtitle && <div className="truncate text-xs text-muted-foreground">{n.subtitle}</div>}
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
                className="absolute left-1/2 top-0 h-3 w-3 -translate-x-1/2 -translate-y-1/2 cursor-crosshair rounded-full border-2 bg-card"
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
