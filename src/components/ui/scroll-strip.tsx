import { useEffect, useRef, useState } from 'react'
import { CaretLeft, CaretRight } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'

const FADE = '28px'

/**
 * A row that scrolls sideways (a tab strip) and SAYS so: on phones a strip of
 * tabs used to run off the edge with nothing hinting that more were there.
 * The side with hidden tabs fades out and gets a round arrow that pages the
 * strip; the active tab is kept in view when it changes (a tab picked by
 * code, or the strip opening on a far tab). A vertical wheel scrolls it
 * sideways on desktop. The mask works on any background, so the strip can
 * sit on a card, a header or the page.
 */
export function ScrollStrip({ className, children }: { className?: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [edges, setEdges] = useState({ left: false, right: false })

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => {
      const left = el.scrollLeft > 2
      const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 2
      setEdges((prev) => (prev.left === left && prev.right === right ? prev : { left, right }))
    }
    // the active tab into view, by hand: scrollIntoView would also scroll
    // the page or the dialog the strip sits in
    const reveal = () => {
      const active = el.querySelector<HTMLElement>('[data-active], [aria-selected="true"]')
      if (!active) return
      const box = el.getBoundingClientRect()
      const tab = active.getBoundingClientRect()
      const pad = 36
      if (tab.left < box.left + pad) el.scrollLeft -= box.left + pad - tab.left
      else if (tab.right > box.right - pad) el.scrollLeft += tab.right - (box.right - pad)
      update()
    }
    update()
    reveal()
    const resize = new ResizeObserver(update)
    resize.observe(el)
    if (el.firstElementChild) resize.observe(el.firstElementChild)
    const mutations = new MutationObserver(reveal)
    mutations.observe(el, { subtree: true, attributes: true, attributeFilter: ['data-active', 'aria-selected'], childList: true })
    el.addEventListener('scroll', update, { passive: true })
    return () => {
      resize.disconnect()
      mutations.disconnect()
      el.removeEventListener('scroll', update)
    }
  }, [])

  const page = (dir: -1 | 1) => {
    const el = ref.current
    if (el) el.scrollBy({ left: dir * Math.max(120, el.clientWidth * 0.7), behavior: 'smooth' })
  }
  const mask = edges.left || edges.right
    ? `linear-gradient(to right, ${edges.left ? 'transparent 0, #000 ' + FADE : '#000 0'}, ${edges.right ? '#000 calc(100% - ' + FADE + '), transparent 100%' : '#000 100%'})`
    : undefined
  // a 40 px tap target around a 28 px visible circle
  const arrow = 'group/arrow absolute top-1/2 z-10 flex size-10 -translate-y-1/2 items-center justify-center'
  const circle = 'flex size-7 items-center justify-center rounded-full border border-border bg-background/95 text-foreground shadow-sm transition-colors group-hover/arrow:bg-accent'

  return (
    <div className="relative min-w-0">
      <div
        ref={ref}
        className={cn('overflow-x-auto overscroll-x-contain no-scrollbar', className)}
        style={mask ? { maskImage: mask, WebkitMaskImage: mask } : undefined}
        onWheel={(e) => {
          if (e.deltaY !== 0 && Math.abs(e.deltaY) > Math.abs(e.deltaX)) e.currentTarget.scrollLeft += e.deltaY
        }}
      >
        {children}
      </div>
      {/* out of the tab order: arrow keys already move between tabs */}
      {edges.left && (
        <button type="button" tabIndex={-1} aria-label="Show earlier tabs" onClick={() => page(-1)} className={cn(arrow, 'left-0')}>
          <span className={circle}><CaretLeft className="size-3.5" aria-hidden="true" /></span>
        </button>
      )}
      {edges.right && (
        <button type="button" tabIndex={-1} aria-label="Show more tabs" onClick={() => page(1)} className={cn(arrow, 'right-0')}>
          <span className={circle}><CaretRight className="size-3.5" aria-hidden="true" /></span>
        </button>
      )}
    </div>
  )
}
