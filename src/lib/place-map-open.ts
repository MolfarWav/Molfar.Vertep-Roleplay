// Is the places map open over the chat? A phone has room for one floating thing above the message box, so the sprite
// window and the cast strip step aside while the map is open (Molfar.Vertep#454). Not kept: a reload starts folded.

import { useSyncExternalStore } from 'react'

let open = false
const listeners = new Set<() => void>()

export function setPlaceMapOpen(v: boolean): void {
  if (open === v) return
  open = v
  for (const l of listeners) l()
}

const subscribe = (cb: () => void) => {
  listeners.add(cb)
  return () => { listeners.delete(cb) }
}

export function usePlaceMapOpen(): boolean {
  return useSyncExternalStore(subscribe, () => open, () => false)
}
