// A step of the guide: the page dimmed with a hole around the target and a bubble
// beside it (desktop), or the target outlined and the text in a sheet (phones).
// Controlled by its caller: the buttons and what they do come in as props.
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { useT } from '@/hooks/use-t'
import { cn } from '@/lib/utils'
import { findTarget } from './target'

interface Rect { top: number; left: number; width: number; height: number }

export interface SpotlightProps {
  /** Absent = no element to point at: the text alone, centred. */
  target?: string
  title: string
  body: string
  /** Dots under the text; hidden for one step. */
  step: number
  total: number
  mobile: boolean
  onBack?: () => void
  /** Primary button (Next / Done / Back to What's new). */
  primary: { label: string; onClick: () => void }
  /** Quiet button on the left (Skip / Close). */
  secondary: { label: string; onClick: () => void }
  /** Esc. */
  onEscape: () => void
}

const PAD = 4
const GAP = 12
const MARGIN = 8

const sameRect = (a: Rect | null, b: Rect | null) =>
  a === b || (!!a && !!b && a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height)

/** The target's box, looked for again until `waitMs` has passed (a drawer or a board may
 *  still be opening when "Show me" asks). `settled` = looked long enough; a null rect
 *  after that means the target is absent. */
function useTargetRect(target: string | undefined, waitMs: number): { rect: Rect | null; settled: boolean } {
  const [state, setState] = useState<{ rect: Rect | null; settled: boolean }>({ rect: null, settled: false })
  useEffect(() => {
    const started = Date.now()
    let scrolled: HTMLElement | null = null
    const measure = () => {
      const el = findTarget(target)
      if (el && el !== scrolled) {
        scrolled = el
        el.scrollIntoView({ block: 'nearest', inline: 'nearest' })
      }
      const r = el?.getBoundingClientRect()
      const rect = r ? { top: r.top, left: r.left, width: r.width, height: r.height } : null
      const settled = !!rect || !target || Date.now() - started >= waitMs
      setState((prev) => (prev.settled === settled && sameRect(prev.rect, rect) ? prev : { rect, settled }))
    }
    measure()
    const id = window.setInterval(measure, 120)
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      window.clearInterval(id)
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [target, waitMs])
  return state
}

/** Where the bubble goes: below the target if it fits, else above, to the right, to the
 *  left; never outside the viewport. */
function placeBubble(rect: Rect, w: number, h: number): { top: number; left: number } {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const clampX = (x: number) => Math.max(MARGIN, Math.min(x, vw - w - MARGIN))
  const clampY = (y: number) => Math.max(MARGIN, Math.min(y, vh - h - MARGIN))
  const cx = rect.left + rect.width / 2 - w / 2
  const cy = rect.top + rect.height / 2 - h / 2
  const below = rect.top + rect.height + PAD + GAP
  const above = rect.top - PAD - GAP - h
  if (below + h + MARGIN <= vh) return { top: below, left: clampX(cx) }
  if (above >= MARGIN) return { top: above, left: clampX(cx) }
  const right = rect.left + rect.width + PAD + GAP
  if (right + w + MARGIN <= vw) return { top: clampY(cy), left: right }
  const left = rect.left - PAD - GAP - w
  if (left >= MARGIN) return { top: clampY(cy), left }
  return { top: clampY(vh - h - MARGIN), left: clampX(cx) }
}

export function Spotlight(p: SpotlightProps) {
  const t = useT()
  // a tour step is on screen already; "Show me" may wait for a view that is still opening
  const { rect, settled } = useTargetRect(p.target, 1800)
  const panelRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 320, h: 160 })
  const titleId = 'guide-step-title'

  useLayoutEffect(() => {
    const el = panelRef.current
    if (el && (el.offsetWidth !== size.w || el.offsetHeight !== size.h)) setSize({ w: el.offsetWidth, h: el.offsetHeight })
  })

  // focus moves into the panel for each step; Esc skips (before a drawer underneath sees it)
  const shown = settled || !!rect
  useEffect(() => {
    if (shown) panelRef.current?.querySelector<HTMLElement>('[data-primary]')?.focus()
  }, [p.target, p.step, shown])
  const escapeRef = useRef(p.onEscape)
  escapeRef.current = p.onEscape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      escapeRef.current()
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [])

  // Tab stays on the panel's buttons
  const trapTab = (e: React.KeyboardEvent) => {
    if (e.key !== 'Tab') return
    const items = Array.from(panelRef.current?.querySelectorAll<HTMLElement>('button') ?? [])
    const first = items[0]
    const last = items[items.length - 1]
    if (!first || !last) return
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
  }

  const hole = rect && { top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 }
  const lowerHalf = rect ? rect.top + rect.height / 2 > window.innerHeight / 2 : false

  let panelStyle: React.CSSProperties | undefined
  let panelClass: string
  if (p.mobile) {
    // the sheet takes the half of the screen the target is not in
    panelClass = cn(
      'fixed inset-x-2 rounded-xl border border-border bg-card p-4 shadow-lg',
      rect && lowerHalf ? 'top-2' : 'bottom-[max(0.5rem,env(safe-area-inset-bottom))]',
    )
  } else if (rect) {
    panelClass = 'fixed w-[320px] max-w-[calc(100vw-16px)] rounded-xl border border-border bg-card p-4 shadow-lg'
    panelStyle = placeBubble(rect, size.w, size.h)
  } else {
    panelClass = 'fixed top-1/2 left-1/2 w-[320px] max-w-[calc(100vw-16px)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-card p-4 shadow-lg'
  }

  return (
    <div className="fixed inset-0 z-[70]" data-guide-overlay>
      {/* swallows clicks: nothing under the guide is reachable, and nothing ends it by accident */}
      <div className="absolute inset-0" />
      {hole && (
        <div
          aria-hidden="true"
          className={cn(
            'pointer-events-none absolute rounded-lg ring-2 ring-primary transition-[top,left,width,height] duration-150',
            !p.mobile && 'shadow-[0_0_0_9999px_rgb(0_0_0/0.55)]',
          )}
          style={hole}
        />
      )}
      {!hole && !p.mobile && settled && <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-black/55" />}
      {shown && (
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          onKeyDown={trapTab}
          className={cn(panelClass, 'text-card-foreground')}
          style={panelStyle}
        >
          <div id={titleId} className="font-heading text-[17px] leading-tight text-foreground">{p.title}</div>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{p.body}</p>
          <div className="mt-3 flex items-center gap-2">
            <Button variant="ghost" size="sm" className="-ml-2 max-md:h-10" onClick={p.secondary.onClick}>
              {p.secondary.label}
            </Button>
            {p.total > 1 ? (
              <div className="flex flex-1 items-center justify-center gap-1" aria-label={t('guide.counter', { n: p.step + 1, total: p.total })} role="img">
                {Array.from({ length: p.total }, (_, i) => (
                  <span key={i} className={cn('size-1.5 rounded-full', i === p.step ? 'bg-primary' : 'bg-muted-foreground/30')} />
                ))}
              </div>
            ) : (
              <div className="flex-1" />
            )}
            <div className="flex items-center gap-2">
              {p.onBack && (
                <Button variant="outline" size="sm" className="max-md:h-10" onClick={p.onBack}>
                  {t('guide.back')}
                </Button>
              )}
              <Button size="sm" className="max-md:h-10" data-primary onClick={p.primary.onClick}>
                {p.primary.label}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
