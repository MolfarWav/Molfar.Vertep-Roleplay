import { useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode, type Ref } from 'react'
import { DotsSixVertical } from '@phosphor-icons/react'
import { useT } from '@/hooks/use-t'
import { dropIndex } from '@/lib/forge'
import { cn } from '@/lib/utils'

/** What a row of a SortableList needs to wear: a ref, the lift while it is dragged, a mark where it would land, and the grip. */
export interface SortBind {
  ref: Ref<HTMLDivElement>
  style: CSSProperties | undefined
  className: string
  /** the grip to put in the row's toolbar */
  handle: ReactNode
}

/**
 * A list whose rows can be dragged by a grip: pointer events, so a finger works as well as a mouse (`touch-action: none` on the
 * grip keeps the page from scrolling under it). The Up and Down buttons next to it stay as the keyboard path; the grip also takes
 * the arrow keys. A drop that stays where it began changes nothing, and Escape cancels. The list does not scroll by itself while
 * dragging: a panel holds at most 20 widgets.
 */
export function SortableList<T>({ items, keyOf, onReorder, children }: { items: T[]; keyOf: (item: T, i: number) => string; onReorder: (from: number, to: number) => void; children: (item: T, i: number, bind: SortBind) => ReactNode }) {
  const t = useT()
  const rows = useRef<(HTMLDivElement | null)[]>([])
  const begin = useRef<{ y: number; mids: number[]; from: number } | null>(null)
  const [drag, setDrag] = useState<{ from: number; to: number; dy: number } | null>(null)

  const end = (apply: boolean) => {
    const d = drag
    begin.current = null
    setDrag(null)
    if (apply && d && d.to !== d.from) onReorder(d.from, d.to)
  }
  const down = (i: number) => (e: PointerEvent<HTMLButtonElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const mids = rows.current.map((el) => { const r = el?.getBoundingClientRect(); return r ? r.top + r.height / 2 : 0 })
    begin.current = { y: e.clientY, mids, from: i }
    setDrag({ from: i, to: i, dy: 0 })
  }
  const move = (e: PointerEvent<HTMLButtonElement>) => {
    const b = begin.current
    if (!b) return
    setDrag({ from: b.from, to: dropIndex(b.mids, b.from, e.clientY), dy: e.clientY - b.y })
  }
  const key = (i: number) => (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'Escape' && begin.current) { e.preventDefault(); end(false) }
    else if (e.key === 'ArrowUp' && i > 0) { e.preventDefault(); onReorder(i, i - 1) }
    else if (e.key === 'ArrowDown' && i < items.length - 1) { e.preventDefault(); onReorder(i, i + 1) }
  }

  return (
    <>
      {items.map((item, i) => {
        const lifted = drag?.from === i
        const target = !!drag && !lifted && drag.to === i
        const bind: SortBind = {
          ref: (el) => { rows.current[i] = el },
          style: lifted ? { transform: `translateY(${drag!.dy}px)`, zIndex: 20, position: 'relative' } : undefined,
          className: cn(lifted && 'bg-background opacity-90 shadow-lg ring-1 ring-primary', target && 'ring-2 ring-primary/60'),
          handle: items.length > 1 ? (
            <button
              type="button"
              aria-label={t('fg.drag')}
              title={t('fg.drag')}
              data-testid="forge-drag"
              onPointerDown={down(i)}
              onPointerMove={move}
              onPointerUp={() => end(true)}
              onPointerCancel={() => end(false)}
              onKeyDown={key(i)}
              className="flex size-8 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground active:cursor-grabbing max-md:size-10"
            >
              <DotsSixVertical className="size-4" aria-hidden="true" />
            </button>
          ) : null,
        }
        return <SortKey key={keyOf(item, i)}>{children(item, i, bind)}</SortKey>
      })}
    </>
  )
}

/** Gives each row its key without adding a box around it. */
function SortKey({ children }: { children: ReactNode }) { return <>{children}</> }
