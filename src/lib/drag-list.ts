import { useCallback, useRef, useState } from 'react'

/**
 * List reordering driven from anywhere on a row, the way mature prompt
 * managers do it:
 *  - press + move → drag; the row visually travels through the list (live
 *    preview) and commits exactly once on release
 *  - press + release without moving to another row → a plain click (the
 *    caller's onPlainClick — usually "open this row")
 *  - interactive children (buttons, switches, inputs) never start drags and
 *    receive their clicks untouched
 *  - touch: drag starts after a short hold so scrolling still works; a quick
 *    tap is always a click
 *
 * No native HTML5 drag anywhere — its ghost is a screenshot of the whole row
 * and dragover refires per frame.
 *
 * Rows inside `containerRef` carry `data-rowid={id}` and spread
 * `rowProps(id, onPlainClick)`. While dragging, render `ordered` (the live
 * preview); `onCommit` fires once with the final order.
 */
export function useDragList<T extends { id: string }>(
  items: T[],
  onCommit: (ordered: T[]) => void,
) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [preview, setPreview] = useState<T[] | null>(null)
  const drag = useRef<{ id: string | null; dragging: boolean; preview: T[] | null; lastOver: string | null; hold: ReturnType<typeof setTimeout> | null; blocker: ((ev: TouchEvent) => void) | null; pending: (() => void) | null; endedAt: number }>({
    id: null, dragging: false, preview: null, lastOver: null, hold: null, blocker: null, pending: null, endedAt: 0,
  })
  const itemsRef = useRef(items)
  itemsRef.current = items
  // always commit through the CURRENT onCommit — a memoized rowProps would
  // otherwise capture the first render's callback (e.g. a stale preset id)
  const onCommitRef = useRef(onCommit)
  onCommitRef.current = onCommit

  const INTERACTIVE = 'button, input, textarea, select, a, [role="switch"], [role="menuitem"], [data-no-drag]'
  const HOLD_SLOP = 14

  const rowAt = (clientY: number): string | null => {
    const root = containerRef.current
    for (const r of Array.from(root?.querySelectorAll<HTMLElement>('[data-rowid]') ?? [])) {
      // a row of a list nested inside one of this list's rows belongs to that inner list
      const outer = r.parentElement?.closest<HTMLElement>('[data-rowid]')
      if (outer && root && outer !== root && root.contains(outer)) continue
      const rect = r.getBoundingClientRect()
      if (clientY >= rect.top && clientY <= rect.bottom) return r.dataset.rowid ?? null
    }
    return null
  }
  const scrollParent = (): HTMLElement | null => {
    let n: HTMLElement | null = containerRef.current?.parentElement ?? null
    while (n) {
      if (/(auto|scroll)/.test(getComputedStyle(n).overflowY)) return n
      n = n.parentElement
    }
    return null
  }
  // while dragging, keep the list moving when the finger hugs the screen
  // edge — otherwise rows beyond the fold are unreachable on touch
  const edgeScroll = (clientY: number) => {
    const p = scrollParent()
    if (!p) return
    const r = p.getBoundingClientRect()
    const nearTop = clientY - r.top
    const nearBottom = r.bottom - clientY
    if (nearTop < 48) p.scrollTop -= Math.ceil((48 - nearTop) / 6)
    else if (nearBottom < 48) p.scrollTop += Math.ceil((48 - nearBottom) / 6)
  }
  const reordered = (list: T[], fromId: string, toId: string): T[] => {
    const from = list.findIndex((x) => x.id === fromId)
    const to = list.findIndex((x) => x.id === toId)
    if (from < 0 || to < 0 || from === to) return list
    const next = [...list]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved!)
    return next
  }

  const rowProps = useCallback((id: string, onPlainClick?: () => void) => {
    const move = (ev: Event) => {
      if (!drag.current.dragging || !drag.current.id) return
      const y = (ev as PointerEvent).clientY
      edgeScroll(y)
      const over = rowAt(y)
      if (!over || over === drag.current.id) return
      // apply each target crossing ONCE — move events can arrive before the
      // live-preview re-render lands, and re-applying the same swap would
      // flip the row back
      if (over === drag.current.lastOver) return
      drag.current.lastOver = over
      const base = drag.current.preview ?? itemsRef.current
      drag.current.preview = reordered(base, drag.current.id, over)
      setPreview(drag.current.preview)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('mousemove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('mouseup', up)
      window.removeEventListener('pointercancel', up)
      if (drag.current.blocker) {
        window.removeEventListener('touchmove', drag.current.blocker)
        drag.current.blocker = null
      }
      document.body.style.userSelect = ''
      if (!drag.current.dragging) return
      drag.current.dragging = false
      drag.current.id = null
      drag.current.endedAt = Date.now()
      setDragId(null)
      const final = drag.current.preview
      drag.current.preview = null
      setPreview(null)
      if (final && final !== itemsRef.current) onCommitRef.current(final)
    }
    const begin = () => {
      if (drag.current.dragging) return
      drag.current.dragging = true
      drag.current.id = id
      drag.current.preview = itemsRef.current
      drag.current.lastOver = null
      document.body.style.userSelect = 'none'
      setDragId(id)
      for (const [ev, fn] of Object.entries({
        pointermove: move, mousemove: move, pointerup: up, mouseup: up, pointercancel: up,
      } as Record<string, (ev: Event) => void>)) window.addEventListener(ev, fn as EventListener)
    }
    // mouse/pen: begin() only once the pointer actually MOVES past the slop
    // circle — press+release without movement is a plain CLICK, not a
    // zero-distance drag (which set endedAt and swallowed every row open)
    const armMoveBegin = (x: number, y: number) => {
      const listeners: Record<string, (ev: Event) => void> = {}
      const disarm = () => {
        drag.current.pending = null
        for (const [ev, fn] of Object.entries(listeners)) window.removeEventListener(ev, fn as EventListener)
      }
      listeners.pointermove = listeners.mousemove = (ev) => {
        const p = ev as PointerEvent
        if (Math.hypot(p.clientX - x, p.clientY - y) > HOLD_SLOP) { disarm(); begin() }
      }
      listeners.pointerup = listeners.pointercancel = listeners.mouseup = () => disarm()
      for (const [ev, fn] of Object.entries(listeners)) window.addEventListener(ev, fn as EventListener)
      drag.current.pending = disarm
    }
    return {
      onPointerDown: (e: React.PointerEvent) => {
        if (e.button !== 0 || drag.current.dragging) return
        if (e.target instanceof Element && e.target.closest(INTERACTIVE)) return
        if (e.pointerType === 'touch') {
          // hold-to-drag on touch. The touchmove blocker is the piece that
          // makes this work on mobile: without preventDefault the browser
          // claims the gesture for page scrolling the moment the finger
          // twitches, fires pointercancel, and the drag (and the page) runs
          // away. We only claim while the finger stays inside the slop
          // circle or the drag is actually running — a quick flick exceeds
          // the slop on its first moves and scrolls the list as before.
          const x = e.clientX
          const y = e.clientY
          let leftSlop = false
          const holdMove = (ev: PointerEvent) => {
            if (Math.hypot(ev.clientX - x, ev.clientY - y) > HOLD_SLOP) {
              leftSlop = true
              cancelHold()
            }
          }
          const blocker = (ev: TouchEvent) => {
            if (drag.current.dragging) { ev.preventDefault(); return }
            const t = ev.touches[0]
            if (!t || leftSlop) return
            if (Math.hypot(t.clientX - x, t.clientY - y) <= HOLD_SLOP) ev.preventDefault()
          }
          const cancelHold = () => {
            clearTimeout(drag.current.hold!)
            drag.current.hold = null
            window.removeEventListener('pointermove', holdMove)
            if (!drag.current.dragging && drag.current.blocker === blocker) {
              window.removeEventListener('touchmove', blocker)
              drag.current.blocker = null
            }
          }
          const beginHoldDrag = () => {
            drag.current.hold = null
            window.removeEventListener('pointermove', holdMove)
            begin()
          }
          window.addEventListener('pointermove', holdMove)
          window.addEventListener('touchmove', blocker, { passive: false })
          drag.current.blocker = blocker
          drag.current.hold = setTimeout(beginHoldDrag, 240)
          const holdUp = () => cancelHold()
          window.addEventListener('pointerup', holdUp, { once: true })
          window.addEventListener('pointercancel', holdUp, { once: true })
          return
        }
        // pointerdown always precedes its compat mousedown — the pending flag
        // keeps the fallback below from double-arming the same press
        if (drag.current.pending) return
        armMoveBegin(e.clientX, e.clientY)
      },
      onMouseDown: (e: React.MouseEvent) => {
        // mouse fallback for hosts that never synthesize pointer events; the
        // dragging/hold/pending guards make this a no-op when pointerdown
        // armed the same press first
        if (e.button !== 0 || drag.current.dragging || drag.current.hold || drag.current.pending) return
        if (e.target instanceof Element && e.target.closest(INTERACTIVE)) return
        armMoveBegin(e.clientX, e.clientY)
      },
      // plain click (no drag happened) on non-interactive row area
      onClick: (e: React.MouseEvent) => {
        if (e.target instanceof Element && e.target.closest(INTERACTIVE)) return
        if (drag.current.dragging || drag.current.hold) return
        // browsers synthesize a click after the pointerup that ended a drag —
        // swallow it so releasing a reorder doesn't also open the row
        if (Date.now() - drag.current.endedAt < 350) return
        onPlainClick?.()
      },
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { containerRef, dragId, ordered: preview ?? items, rowProps }
}
