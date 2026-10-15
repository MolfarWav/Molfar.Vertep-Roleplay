// Where the user is, as far as the guide cares: a screen reports its place while it is
// mounted. A tiny module store (not the app store): the newest report wins, and when it
// goes away the one under it (a chat under the Canvas drawer) is current again.
import { useEffect, useSyncExternalStore } from 'react'
import type { Place } from '@/lib/guide'

interface Entry { place: Place }

let stack: Entry[] = []
let current: Place | null = null
const listeners = new Set<() => void>()

const publish = () => {
  const next = stack[stack.length - 1]?.place ?? null
  if (next === current) return
  current = next
  for (const l of listeners) l()
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => { listeners.delete(l) }
}

/** The screen that draws `place` calls this; `ready` false = it is mounted but not
 *  showing its content yet (loading, empty), so no tour should start on it. */
export function useGuidePlace(place: Place, ready = true): void {
  useEffect(() => {
    if (!ready) return
    const entry: Entry = { place }
    stack.push(entry)
    publish()
    return () => {
      stack = stack.filter((e) => e !== entry)
      publish()
    }
  }, [place, ready])
}

/** The place the user is on now, or null. */
export function useCurrentPlace(): Place | null {
  return useSyncExternalStore(subscribe, () => current, () => null)
}
