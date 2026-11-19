import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { BOARD_H, BOARD_W, type MapNode, type MapPos, type MapRoute } from '@/lib/place-map'
import { placeKind } from '@/lib/place-kinds'
import { cn } from '@/lib/utils'

/** How far a press may wander and still be a tap (px). */
const TAP_SLOP = 8
const MIN_K = 0.15
const MAX_K = 2.5

export interface PlaceMapBoardHandle {
  /** Zoom by a factor around the board's middle. */
  zoom: (factor: number) => void
  /** Show every place (or the whole picture when there is one). */
  fit: () => void
}

interface View { x: number; y: number; k: number }

type Gesture =
  | { type: 'pan'; sx: number; sy: number; vx: number; vy: number; moved: boolean }
  | { type: 'node'; id: string; sx: number; sy: number; ox: number; oy: number; moved: boolean }
  | { type: 'pinch'; d0: number; k0: number; px: number; py: number }

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

/**
 * The map's board (Molfar.Vertep#454): a dotted grid, or a picture under the nodes; pan with one finger or the mouse,
 * zoom with a pinch, the wheel or the buttons; a node moves by a drag. The board is BOARD_W x BOARD_H units, the picture
 * is fitted into that frame (aspect kept). Nodes and their names keep one size on the screen whatever the zoom,
 * so a far-out view still reads; the lines are hairlines for the same reason.
 */
export const PlaceMapBoard = forwardRef<PlaceMapBoardHandle, {
  nodes: MapNode[]
  routes: MapRoute[]
  pictureUrl: string | null
  selectedId: string | null
  onSelect: (id: string | null) => void
  /** a node was dropped at this place in board units (a place takes its spots with it: see `moveNode`) */
  onMoved: (id: string, to: MapPos) => void
  /** a name for the board, read by screen readers */
  label: string
  /** a name for "you are here" on the current place's mark */
  hereLabel: string
}>(function PlaceMapBoard({ nodes, routes, pictureUrl, selectedId, onSelect, onMoved, label, hereLabel }, ref) {
  const stageRef = useRef<HTMLDivElement>(null)
  const [view, setView] = useState<View>({ x: 0, y: 0, k: 0.5 })
  const viewRef = useRef(view)
  viewRef.current = view
  const [live, setLive] = useState<{ id: string; pos: MapPos } | null>(null)
  const liveRef = useRef(live)
  liveRef.current = live
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef<Gesture | null>(null)
  const nodesRef = useRef(nodes)
  nodesRef.current = nodes
  const [imgBroken, setImgBroken] = useState<string | null>(null)

  const fit = useCallback(() => {
    const stage = stageRef.current
    const sw = stage?.clientWidth ?? 0
    const sh = stage?.clientHeight ?? 0
    if (!sw || !sh) return
    const list = nodesRef.current
    // the picture shows whole; without one, the places with room around them
    const box = pictureUrl || !list.length
      ? { x1: 0, y1: 0, x2: BOARD_W, y2: BOARD_H }
      : { x1: Math.min(...list.map((n) => n.x)) - 90, y1: Math.min(...list.map((n) => n.y)) - 90, x2: Math.max(...list.map((n) => n.x)) + 90, y2: Math.max(...list.map((n) => n.y)) + 90 }
    const w = box.x2 - box.x1
    const h = box.y2 - box.y1
    const k = clamp(Math.min(sw / w, sh / h), MIN_K, 1.1)
    setView({ k, x: (sw - w * k) / 2 - box.x1 * k, y: (sh - h * k) / 2 - box.y1 * k })
  }, [pictureUrl])
  const fitRef = useRef(fit)
  fitRef.current = fit

  const zoomAt = useCallback((factor: number, cx?: number, cy?: number) => {
    const stage = stageRef.current
    if (!stage) return
    const px = cx ?? stage.clientWidth / 2
    const py = cy ?? stage.clientHeight / 2
    setView((v) => {
      const k = clamp(v.k * factor, MIN_K, MAX_K)
      return { k, x: px - (px - v.x) * (k / v.k), y: py - (py - v.y) * (k / v.k) }
    })
  }, [])

  useImperativeHandle(ref, () => ({ zoom: (f) => zoomAt(f), fit: () => fitRef.current() }), [zoomAt])

  // fit once the stage has a size (a window opens at its size), again whenever the window is resized by a lot is not wanted:
  // the view stays where the user put it
  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    let done = false
    const tryFit = () => {
      if (done || !stage.clientWidth || !stage.clientHeight) return
      done = true
      fitRef.current()
    }
    tryFit()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(tryFit) : null
    ro?.observe(stage)
    return () => ro?.disconnect()
  }, [])

  // the picture changed: show it whole (or the places again)
  const firstPicture = useRef(true)
  useEffect(() => {
    if (firstPicture.current) { firstPicture.current = false; return }
    fitRef.current()
  }, [pictureUrl])

  // React's wheel listener is passive: the page behind would scroll with it
  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    const on = (e: WheelEvent) => {
      e.preventDefault()
      const r = el.getBoundingClientRect()
      zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), e.clientX - r.left, e.clientY - r.top)
    }
    el.addEventListener('wheel', on, { passive: false })
    return () => el.removeEventListener('wheel', on)
  }, [zoomAt])

  const toBoard = (clientX: number, clientY: number): MapPos => {
    const r = stageRef.current!.getBoundingClientRect()
    const v = viewRef.current
    return { x: (clientX - r.left - v.x) / v.k, y: (clientY - r.top - v.y) / v.k }
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    if ((e.target as HTMLElement).closest('[data-map-ctl]')) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    stageRef.current!.setPointerCapture(e.pointerId)
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      const r = stageRef.current!.getBoundingClientRect()
      const v = viewRef.current
      const cx = (a.x + b.x) / 2 - r.left
      const cy = (a.y + b.y) / 2 - r.top
      gesture.current = { type: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, k0: v.k, px: (cx - v.x) / v.k, py: (cy - v.y) / v.k }
      setLive(null)
      return
    }
    if (pointers.current.size > 2) return
    const nodeEl = (e.target as HTMLElement).closest<HTMLElement>('[data-node]')
    if (nodeEl) {
      const id = nodeEl.dataset.node!
      const n = nodesRef.current.find((x) => x.id === id)
      if (n) {
        const p = toBoard(e.clientX, e.clientY)
        gesture.current = { type: 'node', id, sx: e.clientX, sy: e.clientY, ox: p.x - n.x, oy: p.y - n.y, moved: false }
        return
      }
    }
    gesture.current = { type: 'pan', sx: e.clientX, sy: e.clientY, vx: viewRef.current.x, vy: viewRef.current.y, moved: false }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const g = gesture.current
    if (!g) return
    if (g.type === 'pinch') {
      if (pointers.current.size < 2) return
      const [a, b] = [...pointers.current.values()]
      const r = stageRef.current!.getBoundingClientRect()
      const k = clamp(g.k0 * (Math.hypot(a.x - b.x, a.y - b.y) / g.d0), MIN_K, MAX_K)
      const cx = (a.x + b.x) / 2 - r.left
      const cy = (a.y + b.y) / 2 - r.top
      setView({ k, x: cx - g.px * k, y: cy - g.py * k })
      return
    }
    if (!g.moved && Math.hypot(e.clientX - g.sx, e.clientY - g.sy) < TAP_SLOP) return
    g.moved = true
    if (g.type === 'pan') {
      setView((v) => ({ ...v, x: g.vx + (e.clientX - g.sx), y: g.vy + (e.clientY - g.sy) }))
      return
    }
    const p = toBoard(e.clientX, e.clientY)
    setLive({ id: g.id, pos: { x: clamp(p.x - g.ox, 0, BOARD_W), y: clamp(p.y - g.oy, 0, BOARD_H) } })
  }

  const end = (e: React.PointerEvent) => {
    if (!pointers.current.delete(e.pointerId)) return
    const g = gesture.current
    if (pointers.current.size > 0) { if (g?.type === 'pinch') gesture.current = null; return }
    gesture.current = null
    if (!g || g.type === 'pinch') { setLive(null); return }
    if (g.type === 'node') {
      const dropped = liveRef.current
      if (g.moved && dropped && dropped.id === g.id) onMoved(g.id, dropped.pos)
      else if (!g.moved && e.type !== 'pointercancel') onSelect(g.id)
      setLive(null)
      return
    }
    if (!g.moved && e.type !== 'pointercancel') onSelect(null)
  }

  // while a place is dragged its spots go along on the screen; they are saved with it
  const shown = useMemo(() => {
    if (!live) return nodes
    const base = nodes.find((n) => n.id === live.id)
    if (!base) return nodes
    const dx = live.pos.x - base.x
    const dy = live.pos.y - base.y
    return nodes.map((n) => (n.id === live.id ? { ...n, ...live.pos } : !base.spot && n.parentId === base.id ? { ...n, x: n.x + dx, y: n.y + dy } : n))
  }, [nodes, live])
  const at = useMemo(() => new Map(shown.map((n) => [n.id, n])), [shown])
  // nodes keep their size on the screen, a little smaller when far out, and lose their names (but the current and the chosen one)
  const inv = clamp(view.k / 0.6, 0.5, 1) / view.k
  const farOut = view.k < 0.3
  const many = nodes.length > 40 || farOut
  const showPicture = !!pictureUrl && imgBroken !== pictureUrl

  return (
    <div
      ref={stageRef}
      className="relative h-full w-full touch-none select-none overflow-hidden rounded-b-lg bg-background outline-none"
      style={{ backgroundImage: 'radial-gradient(var(--border) 1px, transparent 1px)', backgroundSize: '22px 22px' }}
      role="application"
      aria-label={label}
      data-testid="place-map-board"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <div className="absolute left-0 top-0 origin-top-left" style={{ width: BOARD_W, height: BOARD_H, transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }}>
        {/* the frame: the picture fitted into it, or only an outline on the dots */}
        <div
          className={cn('absolute inset-0', showPicture ? 'bg-card' : 'border border-dashed border-border/60')}
          data-testid="place-map-frame"
        >
          {showPicture && (
            <img
              src={pictureUrl!}
              alt=""
              draggable={false}
              onError={() => setImgBroken(pictureUrl)}
              className="pointer-events-none absolute inset-0 size-full object-contain"
            />
          )}
        </div>
        <svg className="pointer-events-none absolute left-0 top-0 overflow-visible" width={BOARD_W} height={BOARD_H} aria-hidden="true">
          {shown.filter((n) => n.parentId && at.has(n.parentId)).map((n) => {
            const p = at.get(n.parentId!)!
            return <line key={`in-${n.id}`} x1={p.x} y1={p.y} x2={n.x} y2={n.y} stroke="var(--muted-foreground)" strokeOpacity={0.35} strokeWidth={1} vectorEffect="non-scaling-stroke" />
          })}
          {routes.map((r) => {
            const a = at.get(r.a)
            const b = at.get(r.b)
            if (!a || !b) return null
            const on = selectedId === r.a || selectedId === r.b
            return (
              <line
                key={`${r.a}-${r.b}`}
                x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                stroke={on ? 'var(--primary)' : 'var(--muted-foreground)'}
                strokeOpacity={on ? 0.9 : 0.55}
                strokeWidth={on ? 2.5 : 1.75}
                strokeDasharray="7 6"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            )
          })}
        </svg>
        {shown.map((n) => {
          const kind = placeKind(n.name)
          const size = n.spot ? 32 : 44
          const selected = selectedId === n.id
          return (
            <div key={n.id} className="absolute" style={{ left: n.x, top: n.y, width: 0, height: 0 }}>
              <div
                data-node={n.id}
                role="button"
                tabIndex={0}
                aria-pressed={selected}
                aria-label={n.here ? `${n.name} (${hereLabel})` : n.name}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(n.id) } }}
                className={cn('absolute flex cursor-grab flex-col items-center active:cursor-grabbing', live?.id === n.id && 'z-10')}
                style={{ transform: `translate(-50%, -${size / 2}px) scale(${inv})`, transformOrigin: `50% ${size / 2}px`, opacity: n.visits === 0 && !n.here && !selected ? 0.72 : 1 }}
              >
                <span
                  className={cn(
                    'flex items-center justify-center rounded-full border bg-card shadow-md',
                    n.spot ? 'text-base' : 'text-xl',
                    n.here ? 'border-primary ring-2 ring-primary' : 'border-border',
                    selected && 'ring-2 ring-foreground/70',
                  )}
                  style={{ width: size, height: size }}
                >
                  <span aria-hidden="true">{kind.emoji}</span>
                  {n.here && <span className="absolute -right-1 -top-1 size-3 rounded-full border-2 border-card bg-primary" aria-hidden="true" />}
                </span>
                {!many || selected || n.here ? (
                  <span className="mt-0.5 line-clamp-2 w-[92px] break-words rounded bg-background/75 px-1 text-center text-[11px] leading-tight text-foreground">{n.name}</span>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
})
