import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CornersOut, Minus, Plus, X } from '@phosphor-icons/react'
import { AGENT_BOARD, AGENT_CARDS } from '@/canvas-kit/boards/agent'
import { canConnect, connect, moveNode, removeEdge, splitEnd } from '@/canvas-kit/graph'
import type { CanvasNode, Graph } from '@/canvas-kit/graph'
import { Button } from '@/components/ui/button'
import { useT } from '@/hooks/use-t'
import type { DryResult } from '@/lib/agent-dry'
import { fmtValue } from '@/lib/agent-template'
import { CARD, cardHeight, nextEdgeId, portsOf } from '@/lib/forge'
import { cn } from '@/lib/utils'

// The drawing board of the agent editor: a card has a row for each of its ports (inputs on the left, outputs on the
// right), and a wire runs from one port to another. The positions are plain arithmetic, so a wire never has to
// measure the page. The Chat links board (canvas-kit/canvas-board.tsx) draws one port per card and stays as it is.

const { W, HEAD, ROW, PAD } = CARD

type Pt = { x: number; y: number }
type IssueCount = { errors: number; warnings: number }

function bodyOf(n: CanvasNode) {
  const { ins, outs } = portsOf(n)
  return { ins, outs, rows: Math.max(ins.length, outs.length), h: cardHeight(n) }
}

/** Where the dot of a port sits, in board coordinates. */
function portPoint(n: CanvasNode, at: { x: number; y: number }, port: string, side: 'in' | 'out'): Pt | null {
  const { ins, outs } = bodyOf(n)
  const list = side === 'in' ? ins : outs
  const i = list.findIndex((p) => p.id === port)
  if (i < 0) return null
  return { x: at.x + (side === 'out' ? W : 0), y: at.y + HEAD + PAD + i * ROW + ROW / 2 }
}

const curve = (a: Pt, b: Pt) => {
  const dx = Math.max(60, Math.abs(b.x - a.x) / 2)
  return `M${a.x},${a.y} C${a.x + dx},${a.y} ${b.x - dx},${b.y} ${b.x},${b.y}`
}
const mid = (a: Pt, b: Pt): Pt => {
  // the middle of the same curve
  const dx = Math.max(60, Math.abs(b.x - a.x) / 2)
  const c1 = { x: a.x + dx, y: a.y }
  const c2 = { x: b.x - dx, y: b.y }
  return { x: (a.x + 3 * c1.x + 3 * c2.x + b.x) / 8, y: (a.y + 3 * c1.y + 3 * c2.y + b.y) / 8 }
}

interface DragState {
  type: 'pan' | 'node' | 'wire'
  sx: number
  sy: number
  vx?: number
  vy?: number
  id?: string
  dx?: number
  dy?: number
  from?: string
  start?: Pt
  moved?: boolean
}

/** What a trial run says about the board: what each wire carried and what happened to each card. */
export type Probe = Pick<DryResult, 'wires' | 'nodes'>

/** A value as the small label on a wire shows it. */
export function probeLabel(v: unknown): string {
  if (v === true) return '✓'
  const s = typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : fmtValue(v)
  return s.length > 22 ? `${s.slice(0, 21)}…` : s || '""'
}

interface Props {
  probe?: Probe | null
  graph: Graph
  editable: boolean
  onChange: (next: Graph) => void
  onRemoveNode?: (id: string) => void
  selectedId: string | null
  onSelect: (id: string | null) => void
  issues: Map<string, IssueCount>
  fitSignal?: number
  reasonText: (core: string) => string
}

export function AgentBoard({ probe, graph, editable, onChange, onRemoveNode, selectedId, onSelect, issues, fitSignal, reasonText }: Props) {
  const t = useT()
  const stage = useRef<HTMLDivElement>(null)
  const [view, setView] = useState({ x: 30, y: 30, k: 1 })
  const [drag, setDrag] = useState<DragState | null>(null)
  const [live, setLive] = useState<{ id: string; x: number; y: number } | null>(null)
  const [end, setEnd] = useState<Pt | null>(null)
  const [over, setOver] = useState<string | null>(null)
  const [edgeSel, setEdgeSel] = useState<string | null>(null)
  const [reason, setReason] = useState<string | null>(null)

  const posOf = (n: CanvasNode): Pt => (live && live.id === n.id ? { x: live.x, y: live.y } : { x: n.x, y: n.y })
  const byId = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n])), [graph.nodes])

  const toWorld = useCallback((cx: number, cy: number): Pt => {
    const r = stage.current!.getBoundingClientRect()
    return { x: (cx - r.left - view.x) / view.k, y: (cy - r.top - view.y) / view.k }
  }, [view])

  const fitAll = useCallback((minK = 0.4) => {
    const el = stage.current
    if (!el || !graph.nodes.length) return
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity
    for (const n of graph.nodes) {
      x1 = Math.min(x1, n.x); y1 = Math.min(y1, n.y)
      x2 = Math.max(x2, n.x + W); y2 = Math.max(y2, n.y + bodyOf(n).h)
    }
    const sw = el.clientWidth, sh = el.clientHeight
    if (!sw || !sh) return
    const k = Math.min(1, Math.max(minK, Math.min((sw - 60) / (x2 - x1), (sh - 60) / (y2 - y1))))
    setView({ k, x: Math.max(20, (sw - (x2 - x1) * k) / 2) - x1 * k, y: Math.max(20, (sh - (y2 - y1) * k) / 2) - y1 * k })
  }, [graph.nodes])
  const fitRef = useRef(fitAll)
  fitRef.current = fitAll
  // on load the view keeps text readable (a wide agent is panned); the Fit button shows all of it
  useEffect(() => { if (fitSignal !== undefined) fitRef.current(0.62) }, [fitSignal])

  const zoomAt = useCallback((f: number, cx?: number, cy?: number) => {
    const el = stage.current
    if (!el) return
    const px = cx ?? el.clientWidth / 2
    const py = cy ?? el.clientHeight / 2
    setView((v) => {
      const k = Math.min(1.6, Math.max(0.4, v.k * f))
      return { k, x: px - (px - v.x) * (k / v.k), y: py - (py - v.y) * (k / v.k) }
    })
  }, [])

  // a wheel on the board zooms it; the listener is native because React's wheel handlers are passive
  useEffect(() => {
    const el = stage.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const r = el.getBoundingClientRect()
      zoomAt(e.deltaY < 0 ? 1.1 : 1 / 1.1, e.clientX - r.left, e.clientY - r.top)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [zoomAt])

  useEffect(() => {
    if (!reason) return
    const id = setTimeout(() => setReason(null), 3200)
    return () => clearTimeout(id)
  }, [reason])

  const portUnder = (cx: number, cy: number): string | null => {
    const el = (document.elementFromPoint(cx, cy) as HTMLElement | null)?.closest('[data-port-in]') as HTMLElement | null
    return el ? `${el.dataset.pnode}:${el.dataset.portIn}` : null
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    const target = e.target as HTMLElement
    if (target.closest('[data-ctl]')) return
    const out = target.closest('[data-port-out]') as HTMLElement | null
    const nodeEl = target.closest('[data-node]') as HTMLElement | null
    const edgeEl = target.closest('[data-edge-hit]') as HTMLElement | null
    stage.current?.focus({ preventScroll: true })
    if (out && editable) {
      const n = byId.get(out.dataset.pnode!)
      const start = n && portPoint(n, posOf(n), out.dataset.portOut!, 'out')
      if (start) {
        e.preventDefault()
        setEdgeSel(null)
        setDrag({ type: 'wire', sx: e.clientX, sy: e.clientY, from: `${n.id}:${out.dataset.portOut}`, start })
        setEnd(start)
        stage.current!.setPointerCapture(e.pointerId)
      }
      return
    }
    if (nodeEl) {
      const n = byId.get(nodeEl.dataset.node!)
      if (!n) return
      onSelect(n.id)
      setEdgeSel(null)
      if (editable) {
        const w = toWorld(e.clientX, e.clientY)
        setDrag({ type: 'node', sx: e.clientX, sy: e.clientY, id: n.id, dx: w.x - n.x, dy: w.y - n.y })
        stage.current!.setPointerCapture(e.pointerId)
      }
      return
    }
    if (edgeEl) { setEdgeSel(edgeEl.dataset.edgeHit!); onSelect(null); return }
    setDrag({ type: 'pan', sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y })
    stage.current!.setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag) return
    const moved = drag.moved || Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 3
    if (drag.type === 'pan') {
      if (moved) setView((v) => ({ ...v, x: drag.vx! + e.clientX - drag.sx, y: drag.vy! + e.clientY - drag.sy }))
    } else if (drag.type === 'node') {
      if (moved) { const w = toWorld(e.clientX, e.clientY); setLive({ id: drag.id!, x: w.x - drag.dx!, y: w.y - drag.dy! }) }
    } else {
      setEnd(toWorld(e.clientX, e.clientY))
      setOver(portUnder(e.clientX, e.clientY))
    }
    if (moved && !drag.moved) setDrag({ ...drag, moved: true })
  }

  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag
    setDrag(null)
    if (!d) return
    if (d.type === 'pan') { if (!d.moved) { onSelect(null); setEdgeSel(null) } return }
    if (d.type === 'node') {
      if (live && d.moved) onChange(moveNode(graph, live.id, Math.round(live.x), Math.round(live.y)))
      setLive(null)
      return
    }
    const to = portUnder(e.clientX, e.clientY)
    setEnd(null)
    setOver(null)
    if (!to || !d.from) return
    const r = connect(AGENT_BOARD, graph, d.from, to, nextEdgeId(graph))
    if (r.verdict.ok) onChange(r.graph)
    else setReason(reasonText(r.verdict.reason))
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!editable || (e.key !== 'Delete' && e.key !== 'Backspace')) return
    if (edgeSel) { e.preventDefault(); onChange(removeEdge(graph, edgeSel)); setEdgeSel(null) }
    else if (selectedId && (AGENT_BOARD.types[byId.get(selectedId)?.type ?? '']?.deletable ?? true)) { e.preventDefault(); onRemoveNode?.(selectedId) }
  }

  // the inputs a wire from the output being dragged would be accepted by
  const accepts = useMemo(() => {
    const ok = new Set<string>()
    if (drag?.type !== 'wire' || !drag.from) return ok
    for (const n of graph.nodes) for (const p of portsOf(n).ins) if (canConnect(AGENT_BOARD, graph, drag.from, `${n.id}:${p.id}`).ok) ok.add(`${n.id}:${p.id}`)
    return ok
  }, [drag, graph])

  const wired = useMemo(() => new Set(graph.edges.map((e) => e.to)), [graph.edges])
  const wires = graph.edges.map((e) => {
    const [fn, fp] = splitEnd(e.from)
    const [tn, tp] = splitEnd(e.to)
    const a = byId.get(fn)
    const b = byId.get(tn)
    const pa = a && portPoint(a, posOf(a), fp, 'out')
    const pb = b && portPoint(b, posOf(b), tp, 'in')
    return pa && pb ? { e, pa, pb } : null
  }).filter((x): x is { e: Graph['edges'][number]; pa: Pt; pb: Pt } => !!x)
  const selEdge = wires.find((w) => w.e.id === edgeSel)

  return (
    <div
      ref={stage}
      tabIndex={0}
      role="application"
      aria-label={t('fg.board')}
      data-testid="forge-board"
      className={cn('relative h-full w-full touch-none overflow-hidden outline-none', drag?.type === 'pan' && 'cursor-grabbing')}
      style={{
        backgroundImage: 'radial-gradient(color-mix(in oklab, var(--foreground) 14%, transparent) 1px, transparent 1px)',
        backgroundSize: `${18 * view.k}px ${18 * view.k}px`,
        backgroundPosition: `${view.x}px ${view.y}px`,
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => { setDrag(null); setLive(null); setEnd(null); setOver(null) }}
      onKeyDown={onKeyDown}
    >
      <div className="absolute left-0 top-0" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})`, transformOrigin: '0 0' }}>
        <svg className="pointer-events-none absolute left-0 top-0 overflow-visible" width="1" height="1" aria-hidden="true">
          {wires.map(({ e, pa, pb }) => {
            const hot = e.id === edgeSel || (selectedId !== null && (splitEnd(e.from)[0] === selectedId || splitEnd(e.to)[0] === selectedId))
            const seen = probe?.wires[e.from]
            const probed = seen?.state === 'value' ? 'stroke-emerald-500' : seen?.state === 'wait' || seen?.state === 'missing' ? 'stroke-amber-500' : ''
            const stroke = hot ? 'var(--primary)' : 'color-mix(in oklab, var(--foreground) 38%, transparent)'
            return (
              <g key={e.id} opacity={seen?.state === 'skip' ? 0.35 : 1}>
                <path d={curve(pa, pb)} fill="none" className={probed} strokeWidth={hot || seen?.state === 'value' ? 2.5 : 2} stroke={probed ? undefined : stroke} strokeDasharray={seen && seen.state !== 'value' ? '5 4' : undefined} />
                <path d={curve(pa, pb)} fill="none" stroke="transparent" strokeWidth={16} style={{ pointerEvents: 'stroke', cursor: 'pointer' }} data-edge-hit={e.id} />
              </g>
            )
          })}
          {drag?.type === 'wire' && drag.start && end && <path d={curve(drag.start, end)} fill="none" stroke="var(--primary)" strokeWidth={2} strokeDasharray="6 4" />}
        </svg>

        {probe && wires.map(({ e, pa, pb }) => {
          const seen = probe.wires[e.from]
          if (!seen || seen.state === 'skip') return null
          const m = mid(pa, pb)
          const text = seen.state === 'value' ? probeLabel(seen.value) : seen.state === 'wait' ? '…' : '∅'
          return (
            <span key={`p-${e.id}`} data-testid={`probe-${e.id}`} data-probe={seen.state}
              className={cn('pointer-events-none absolute z-10 max-w-44 -translate-x-1/2 -translate-y-1/2 truncate rounded-full border bg-card px-1.5 text-[10px] leading-4 shadow-sm', seen.state === 'value' ? 'border-emerald-500/60 text-foreground' : 'border-amber-500/70 text-amber-600 dark:text-amber-400')}
              style={{ left: m.x, top: m.y }}>
              {text}
            </span>
          )
        })}

        {graph.nodes.map((n) => {
          const at = posOf(n)
          const { ins, outs, rows, h } = bodyOf(n)
          const color = `var(${AGENT_CARDS[n.type]?.colorVar ?? '--k-data'})`
          const selected = selectedId === n.id
          const bad = issues.get(n.id)
          const calls = AGENT_CARDS[n.type]?.calls ?? 0
          return (
            <div
              key={n.id}
              data-node={n.id}
              data-probe-node={probe?.nodes[n.id]}
              data-testid={`forge-node-${n.id}`}
              role="button"
              tabIndex={-1}
              aria-pressed={selected}
              aria-label={n.title}
              className={cn(
                'absolute select-none rounded-lg border bg-card shadow-md',
                selected ? 'border-primary ring-2 ring-primary/60' : bad?.errors ? 'border-destructive' : 'border-border',
                probe?.nodes[n.id] === 'ran' && !selected && 'border-emerald-500/70',
                probe?.nodes[n.id] === 'skipped' && 'opacity-50',
                probe?.nodes[n.id] === 'waiting' && 'border-amber-500/70',
                probe?.nodes[n.id] === 'failed' && 'border-destructive ring-2 ring-destructive/60',
                n.type === 'note' && 'border-dashed',
                editable ? 'cursor-grab' : 'cursor-pointer',
                live?.id === n.id && 'cursor-grabbing shadow-xl',
              )}
              style={{ left: at.x, top: at.y, width: W, height: h }}
            >
              <div className="flex items-center gap-2 rounded-t-lg border-b border-border pl-2.5 pr-2" style={{ height: HEAD, borderLeft: `5px solid ${color}` }}>
                <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{n.title}</span>
                <span className="shrink-0 text-[10px] text-muted-foreground">{calls ? t('fg.board.call', { n: calls }) : (AGENT_CARDS[n.type]?.label ?? n.type)}</span>
              </div>
              {rows > 0 ? (
                <div className="relative" style={{ height: rows * ROW + PAD * 2, paddingTop: PAD }}>
                  {Array.from({ length: rows }, (_, i) => {
                    const pin = ins[i]
                    const pout = outs[i]
                    return (
                      <div key={i} className="relative flex items-center justify-between gap-2 px-3.5 text-[11px] text-muted-foreground" style={{ height: ROW }}>
                        <span className="min-w-0 truncate" title={pin ? `${pin.label ?? pin.id} · ${pin.type}` : undefined}>{pin ? `${pin.label ?? pin.id}${pin.optional ? ' ·' : ''}` : ''}</span>
                        <span className="min-w-0 truncate text-right" title={pout ? `${pout.label ?? pout.id} · ${pout.type}` : undefined}>{pout ? (pout.label ?? pout.id) : ''}</span>
                        {pin && <Dot side="in" node={n.id} port={pin.id} type={pin.type} state={wired.has(`${n.id}:${pin.id}`) ? 'wired' : pin.optional ? 'open' : 'missing'} glow={drag?.type === 'wire' ? (accepts.has(`${n.id}:${pin.id}`) ? 'ok' : 'no') : undefined} hot={over === `${n.id}:${pin.id}`} />}
                        {pout && <Dot side="out" node={n.id} port={pout.id} type={pout.type} state={graph.edges.some((x) => x.from === `${n.id}:${pout.id}`) ? 'wired' : 'open'} />}
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className="line-clamp-2 px-3 pt-2 text-[11px] leading-snug text-muted-foreground">{n.note || t('fg.board.noteEmpty')}</p>
              )}
              {(bad?.errors || bad?.warnings) ? (
                <span className={cn('absolute -top-2 right-2 rounded-full px-1.5 text-[10px] font-semibold leading-4 text-white', bad.errors ? 'bg-destructive' : 'bg-amber-500')}>
                  {bad.errors ? t('fg.badge.errors', { n: bad.errors }) : t('fg.badge.warnings', { n: bad.warnings })}
                </span>
              ) : null}
            </div>
          )
        })}
      </div>

      {selEdge && editable && (
        <button
          type="button"
          data-ctl
          className="absolute z-10 flex size-7 items-center justify-center rounded-full border border-border bg-card shadow max-md:size-9"
          style={{ left: 0, top: 0, transform: `translate(-50%, -50%) translate(${mid(selEdge.pa, selEdge.pb).x * view.k + view.x}px, ${mid(selEdge.pa, selEdge.pb).y * view.k + view.y}px)` }}
          title={t('fg.board.unwire')}
          aria-label={t('fg.board.unwire')}
          onClick={() => { onChange(removeEdge(graph, selEdge.e.id)); setEdgeSel(null) }}
        >
          <X size={13} className="text-destructive" aria-hidden="true" />
        </button>
      )}

      {reason && <div role="alert" className="pointer-events-none absolute left-1/2 top-3 z-20 max-w-[80%] -translate-x-1/2 rounded-md bg-destructive px-3 py-1.5 text-xs text-destructive-foreground shadow">{reason}</div>}

      <div className="absolute bottom-3 right-3 flex flex-col gap-1" data-ctl>
        <Button variant="outline" size="icon-sm" data-ctl onClick={() => zoomAt(1.2)} title={t('fg.board.zoomIn')} aria-label={t('fg.board.zoomIn')}><Plus size={14} /></Button>
        <Button variant="outline" size="icon-sm" data-ctl onClick={() => zoomAt(1 / 1.2)} title={t('fg.board.zoomOut')} aria-label={t('fg.board.zoomOut')}><Minus size={14} /></Button>
        <Button variant="outline" size="icon-sm" data-ctl onClick={() => fitAll(0.4)} title={t('canvas.fit')} aria-label={t('canvas.fit')}><CornersOut size={14} /></Button>
      </div>
    </div>
  )
}

/** The dot of a port, with a larger invisible ring around it so that a finger can hit it. */
function Dot({ side, node, port, type, state, glow, hot }: { side: 'in' | 'out'; node: string; port: string; type: string; state: 'wired' | 'open' | 'missing'; glow?: 'ok' | 'no'; hot?: boolean }) {
  const attrs = side === 'in' ? { 'data-port-in': port, 'data-pnode': node } : { 'data-port-out': port, 'data-pnode': node }
  return (
    <span {...attrs} className={cn('absolute top-1/2 flex size-6 -translate-y-1/2 items-center justify-center', side === 'in' ? '-left-3' : '-right-3', side === 'out' && 'cursor-crosshair')}>
      <span
        className={cn(
          'block size-[11px] border-2 transition-transform',
          type === 'signal' ? 'rotate-45 rounded-[2px]' : 'rounded-full',
          state === 'wired' ? 'border-foreground/60 bg-foreground/60' : 'bg-card',
          state === 'open' && 'border-muted-foreground',
          state === 'missing' && 'border-dashed border-amber-500',
          glow === 'ok' && 'scale-150 border-primary ring-4 ring-primary/40',
          glow === 'no' && 'opacity-40',
          hot && glow === 'ok' && 'bg-primary',
        )}
      />
    </span>
  )
}
