
import { useEffect, useMemo, useRef, useState } from 'react'
import { X, ArrowsOutLineVertical } from '@phosphor-icons/react'
import { useApp } from '@/lib/store'
import { detectExpressionLabels, resolveExpressionSprite } from '@/lib/expressions'
import type { Chat } from '@/lib/types'

const POS_KEY = 'expr-panel-pos'
const SIZE_KEY = 'expr-panel-height'
const MIN_KEY = 'expr-panel-minimized'
const MIN_HEIGHT = 96
const CHIP = 48

const readJson = <T,>(key: string, fallback: T): T => {
  try { return (JSON.parse(localStorage.getItem(key) ?? 'null') as T) ?? fallback } catch { return fallback }
}
// a browser blocking site data throws here; the panel keeps its state for
// this session either way
const writeJson = (key: string, value: unknown) => {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* storage unavailable */ }
}
const maxHeight = () => Math.round(window.innerHeight * 0.9)

/**
 * Floating expression sprite — reads the latest character message, detects
 * its emotion (keyword rules) and shows the speaker's matching sprite with a
 * soft crossfade. Draggable anywhere; resizable from its lower corner; the ×
 * folds it into a small round chip (a click on the chip brings it back).
 * Position, height and the folded state persist. Hidden when the speaker has
 * no sprites or Settings turns sprites off.
 */
export function ExpressionPanel({ chat }: { chat: Chat }) {
  const characters = useApp((s) => s.characters)
  const show = useApp((s) => s.settings.showExpressionSprites !== false)
  const [pos, setPos] = useState<{ x: number; y: number } | null>(() => readJson(POS_KEY, null))
  // null = the default (42% of the window)
  const [height, setHeight] = useState<number | null>(() => readJson<number | null>(SIZE_KEY, null))
  const [minimized, setMinimized] = useState<boolean>(() => readJson<unknown>(MIN_KEY, false) === true)
  const dragRef = useRef<{ dx: number; dy: number; moved: boolean } | null>(null)
  const resizeRef = useRef<{ y: number; h: number } | null>(null)
  const boxRef = useRef<HTMLDivElement>(null)

  // memoized: this panel sits over the scrolling log and re-renders with the
  // chat view — detection (a regex pass per rule) + the reverse-copy only re-run
  // when the latest character message actually changes
  const lastAsst = useMemo(
    () => [...chat.messages].reverse().find((m) => m.role === 'assistant'),
    [chat.messages],
  )
  const speaker = characters.find((c) => c.id === (lastAsst?.characterId ?? chat.characterId))
  const sprites = speaker?.expressions ?? []

  const text = lastAsst?.swipes[lastAsst.activeSwipe]?.content ?? ''
  const sprite = useMemo(
    () => resolveExpressionSprite(detectExpressionLabels(text), sprites, speaker?.defaultExpression),
    [text, sprites, speaker?.defaultExpression],
  )

  useEffect(() => {
    // keep the whole box on screen: its own size, not a fixed guess
    const clamp = (p: { x: number; y: number }) => {
      const w = boxRef.current?.offsetWidth ?? 80
      const h = boxRef.current?.offsetHeight ?? 80
      return {
        x: Math.min(Math.max(0, p.x), Math.max(0, window.innerWidth - Math.min(w, 80))),
        y: Math.min(Math.max(0, p.y), Math.max(0, window.innerHeight - Math.min(h, 80))),
      }
    }
    const move = (e: PointerEvent) => {
      if (resizeRef.current) {
        const next = resizeRef.current.h + (e.clientY - resizeRef.current.y)
        setHeight(Math.min(maxHeight(), Math.max(MIN_HEIGHT, Math.round(next))))
        return
      }
      if (!dragRef.current) return
      dragRef.current.moved = true
      setPos(clamp({ x: e.clientX - dragRef.current.dx, y: e.clientY - dragRef.current.dy }))
    }
    const up = () => {
      if (resizeRef.current) {
        resizeRef.current = null
        setHeight((h) => { writeJson(SIZE_KEY, h); return h })
        return
      }
      if (!dragRef.current) return
      dragRef.current = null
      setPos((p) => { if (p) writeJson(POS_KEY, p); return p })
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [])

  if (!show || !sprite || !speaker) return null

  const style: React.CSSProperties = pos
    ? { left: pos.x, top: pos.y, right: 'auto', bottom: 'auto' }
    : { right: '1rem', bottom: '5rem' }
  const startDrag = (e: React.PointerEvent) => {
    const r = boxRef.current?.getBoundingClientRect()
    const at = pos ?? (r ? { x: r.left, y: r.top } : { x: e.clientX - 60, y: e.clientY - 60 })
    if (!pos) setPos(at)
    dragRef.current = { dx: e.clientX - at.x, dy: e.clientY - at.y, moved: false }
  }
  const setFolded = (v: boolean) => { setMinimized(v); writeJson(MIN_KEY, v) }
  const label = `${speaker.name}: ${sprite.name}`

  if (minimized) {
    return (
      <div ref={boxRef} className="fixed z-30 touch-none select-none" style={style} onPointerDown={startDrag}>
        <button
          type="button"
          onClick={() => { if (!dragRef.current?.moved) setFolded(false) }}
          className="block overflow-hidden rounded-full border border-border/60 bg-card shadow-lg ring-primary/50 hover:ring-2"
          style={{ width: CHIP, height: CHIP }}
          aria-label={`Show ${label}`}
          title={`${label} (click to show, drag to move)`}
        >
          <img src={sprite.url} alt="" draggable={false} className="size-full object-cover object-top" />
        </button>
      </div>
    )
  }

  const h = height ?? Math.round(window.innerHeight * 0.42)
  return (
    <div
      ref={boxRef}
      className="group fixed z-30 cursor-grab touch-none select-none active:cursor-grabbing"
      style={style}
      onPointerDown={startDrag}
      role="img"
      aria-label={label}
      title={`${label} (drag to move)`}
    >
      <img
        key={sprite.url}
        src={sprite.url}
        alt={`${speaker.name} ${sprite.name}`}
        draggable={false}
        onLoad={(e) => { e.currentTarget.style.opacity = '1' }}
        style={{ height: h, maxHeight: '90dvh' }}
        className="w-auto rounded-lg border border-border/40 bg-card/60 shadow-lg [opacity:0] transition-opacity duration-200"
      />
      {/* controls: always visible on touch screens, on hover elsewhere */}
      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => setFolded(true)}
        className="absolute right-1 top-1 flex size-7 items-center justify-center rounded-full bg-background/85 text-foreground shadow backdrop-blur transition-opacity hover:bg-background [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 focus-visible:opacity-100"
        aria-label="Fold the sprite"
        title="Fold into a small chip"
      >
        <X className="size-4" aria-hidden="true" />
      </button>
      <span
        onPointerDown={(e) => {
          e.stopPropagation()
          resizeRef.current = { y: e.clientY, h }
        }}
        onDoubleClick={() => { setHeight(null); writeJson(SIZE_KEY, null) }}
        className="absolute bottom-1 right-1 flex size-7 cursor-ns-resize items-center justify-center rounded-full bg-background/85 text-foreground shadow backdrop-blur transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100"
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize the sprite"
        title="Drag to resize, double-click for the default size"
      >
        <ArrowsOutLineVertical className="size-4" aria-hidden="true" />
      </span>
    </div>
  )
}
