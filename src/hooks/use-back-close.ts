import { useEffect, useRef, useState } from 'react'
import { useIsMobile } from '@/hooks/use-mobile'

/**
 * The phone's back gesture closes whatever is on top: a dialog, a sheet, an
 * open detail page, a section, the chat. Every open layer owns exactly one
 * history entry; back pops the newest layer and closes it.
 *
 * A layer closed any other way (its X, a tap outside, a save) hands its entry
 * back, so the history never fills with dead steps that make back do nothing.
 * Those returns are batched into one traversal: a section closing with a
 * dialog inside it gives back two entries in the same frame.
 */
type Layer = { close: () => void | false }

const stack: Layer[] = []
let listening = false
let owedBack = 0
let ownPops = 0

function onPop() {
  if (ownPops > 0) { ownPops--; return }
  const layer = stack.pop()
  if (!layer) return
  // a layer that answers false stays open (the card editor asking about unsaved changes): it gets its entry back
  if (layer.close() === false) {
    history.pushState({ backLayer: true }, '')
    stack.push(layer)
  }
}

function giveBack() {
  owedBack++
  if (owedBack > 1) return
  queueMicrotask(() => {
    const n = owedBack
    owedBack = 0
    ownPops++
    history.go(-n)
  })
}

/** While `open` (on a phone), back runs `close` instead of leaving the page. */
export function useBackClose(open: boolean, close: () => void | false) {
  const isMobile = useIsMobile()
  const closeRef = useRef(close)
  closeRef.current = close
  const active = open && isMobile

  useEffect(() => {
    if (!active) return
    if (!listening) {
      window.addEventListener('popstate', onPop)
      listening = true
    }
    const layer: Layer = { close: () => closeRef.current() }
    history.pushState({ backLayer: true }, '')
    stack.push(layer)
    return () => {
      const i = stack.indexOf(layer)
      if (i === -1) return // back already spent this layer's entry
      stack.splice(i, 1)
      giveBack()
    }
  }, [active])
}

/**
 * Root props that give a dialog-family popup (dialog, sheet, alert dialog) its
 * back layer. Open state is followed whether the caller controls it or not,
 * and back closes through the popup's own close action, so the caller's
 * onOpenChange sees the same dismissal a tap outside would give it.
 */
export function useBackClosable<Details, Actions extends { close: () => void }>(
  open: boolean | undefined,
  defaultOpen: boolean | undefined,
  onOpenChange: ((open: boolean, details: Details) => void) | undefined,
) {
  const [tracked, setTracked] = useState(defaultOpen ?? false)
  const actionsRef = useRef<Actions | null>(null)
  useBackClose(open ?? tracked, () => actionsRef.current?.close())
  return {
    ...(open !== undefined ? { open } : {}),
    ...(defaultOpen !== undefined ? { defaultOpen } : {}),
    onOpenChange: (next: boolean, details: Details) => {
      setTracked(next)
      onOpenChange?.(next, details)
    },
    actionsRef,
  }
}
