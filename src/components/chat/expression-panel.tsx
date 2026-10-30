
import { useEffect, useMemo, useRef, useState } from 'react'
import { X, ArrowsOutLineVertical } from '@phosphor-icons/react'
import { useApp } from '@/lib/store'
import { cardVoices } from '@/lib/dialogue-voices'
import { DEFAULT_OUTFIT } from '@/lib/expressions'
import { pickSprite } from '@/lib/sprite-pick'
import { useT } from '@/hooks/use-t'
import type { Character, Chat } from '@/lib/types'
import { onImageError } from '@/lib/utils'

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
const NO_SPRITES: Character['expressions'] = []

/**
 * Floating expression sprite — reads the latest character message, detects
 * its emotion (keyword rules) and shows the speaker's matching sprite with a
 * soft crossfade. Draggable anywhere; resizable from its lower corner; the ×
 * folds it into a small round chip (a click on the chip brings it back).
 * Position, height and the folded state persist. Hidden when the speaker has
 * no sprites or Settings turns sprites off.
 */
export function ExpressionPanel({ chat }: { chat: Chat }) {
  const t = useT()
  const characters = useApp((s) => s.characters)
  const setSpriteOutfit = useApp((s) => s.setSpriteOutfit)
  const show = useApp((s) => s.settings.showExpressionSprites !== false)
  const [pos, setPos] = useState<{ x: number; y: number } | null>(() => readJson(POS_KEY, null))
  // null = the default (42% of the window)
  const [height, setHeight] = useState<number | null>(() => readJson<number | null>(SIZE_KEY, null))
  const [minimized, setMinimized] = useState<boolean>(() => readJson<unknown>(MIN_KEY, false) === true)
  const dragRef = useRef<{ dx: number; dy: number; moved: boolean } | null>(null)
  const resizeRef = useRef<{ y: number; h: number } | null>(null)
  // set by a drag, read by the click that ends it: pointerup clears dragRef
  // before the browser fires that click, so the chip asks this one instead
  const movedRef = useRef(false)
  const boxRef = useRef<HTMLDivElement>(null)
  // the sprite URL that finished loading, and the ones that failed. Until its
  // image loads the panel is not hit-testable: an invisible box (opacity 0)
  // over the lower half of the log swallowed touch scrolling on Chromium,
  // and a sprite that never loads (a dead URL) left it there for good
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null)
  const [brokenUrls, setBrokenUrls] = useState<ReadonlySet<string>>(() => new Set())
  const markBroken = (url: string) => setBrokenUrls((prev) => (prev.has(url) ? prev : new Set(prev).add(url)))

  // memoized: this panel sits over the scrolling log and re-renders with the
  // chat view — detection (a regex pass per rule) + the reverse-copy only re-run
  // when the latest character message actually changes
  const lastAsst = useMemo(
    () => [...chat.messages].reverse().find((m) => m.role === 'assistant'),
    [chat.messages],
  )
  const speaker = characters.find((c) => c.id === (lastAsst?.characterId ?? chat.characterId))
  const sprites = speaker?.expressions ?? NO_SPRITES

  const text = lastAsst?.swipes[lastAsst.activeSwipe]?.content ?? ''
  // a Narrator card plays several characters: the voice that speaks last in the message owns the sprite
  const voices = useMemo(() => cardVoices({ voices: speaker?.voices }), [speaker?.voices])
  const picked = useMemo(
    () => pickSprite(text, { expressions: sprites, defaultExpression: speaker?.defaultExpression, outfit: speaker?.outfit }, voices, chat.spriteOutfits),
    [text, sprites, speaker?.defaultExpression, speaker?.outfit, voices, chat.spriteOutfits],
  )
  const sprite = picked?.sprite ?? null

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
      movedRef.current = true
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

  if (!show || !sprite || !speaker || brokenUrls.has(sprite.url)) return null

  const style: React.CSSProperties = pos
    ? { left: pos.x, top: pos.y, right: 'auto', bottom: 'auto' }
    : { right: '1rem', bottom: '5rem' }
  const startDrag = (e: React.PointerEvent) => {
    const r = boxRef.current?.getBoundingClientRect()
    const at = pos ?? (r ? { x: r.left, y: r.top } : { x: e.clientX - 60, y: e.clientY - 60 })
    if (!pos) setPos(at)
    dragRef.current = { dx: e.clientX - at.x, dy: e.clientY - at.y, moved: false }
    movedRef.current = false
  }
  const setFolded = (v: boolean) => { setMinimized(v); writeJson(MIN_KEY, v) }
  const who = picked?.character || speaker.name
  const label = `${who}: ${sprite.name}`

  if (minimized) {
    return (
      <div ref={boxRef} data-expression-panel className="fixed z-30 touch-none select-none" style={style} onPointerDown={startDrag}>
        <button
          type="button"
          onClick={() => { if (movedRef.current) { movedRef.current = false; return } setFolded(false) }}
          className="block overflow-hidden rounded-full border border-border/60 bg-card shadow-lg ring-primary/50 hover:ring-2"
          style={{ width: CHIP, height: CHIP }}
          aria-label={`Show ${label}`}
          title={`${label} (click to show, drag to move)`}
        >
          <img src={sprite.url} alt="" draggable={false} onError={(e) => onImageError(e.currentTarget, () => markBroken(sprite.url))} className="size-full object-cover object-top" />
        </button>
      </div>
    )
  }

  const h = height ?? Math.round(window.innerHeight * 0.42)
  const loaded = loadedUrl === sprite.url
  return (
    <div
      ref={boxRef}
      data-expression-panel
      className="group fixed z-30 cursor-grab touch-none select-none active:cursor-grabbing"
      style={{ ...style, visibility: loaded ? undefined : 'hidden' }}
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
        onLoad={(e) => { e.currentTarget.style.opacity = '1'; setLoadedUrl(sprite.url) }}
        onError={(e) => onImageError(e.currentTarget, () => markBroken(sprite.url))}
        style={{ height: h, maxHeight: '90dvh' }}
        className="w-auto rounded-lg border border-border/40 bg-card/60 shadow-lg [opacity:0] transition-opacity duration-200"
      />
      {/* the outfit: only when the speaker has more than one; the choice is kept for this chat */}
      {picked && picked.outfits.length > 1 && (
        <select
          value={picked.outfit}
          onPointerDown={(e) => e.stopPropagation()}
          onChange={(e) => setSpriteOutfit(chat.id, picked.character, e.target.value)}
          aria-label={t('sprites.outfitSwitchAria', { name: who })}
          title={t('sprites.outfitSwitchAria', { name: who })}
          data-testid="outfit-switch"
          className="absolute bottom-1 left-1 h-8 max-w-[calc(100%-3rem)] cursor-pointer rounded-full border border-border/60 bg-background/85 px-2 text-xs text-foreground shadow backdrop-blur max-md:h-10 max-md:text-sm"
        >
          {picked.outfits.map((o) => <option key={o} value={o}>{o.toLowerCase() === DEFAULT_OUTFIT ? t('sprites.outfitDefault') : o}</option>)}
        </select>
      )}
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
