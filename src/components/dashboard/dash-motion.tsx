import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'

/** How long a row counts as new: its fade-in has played by then. */
export const FRESH_MS = 800

/**
 * Which ids appeared since the list was first shown. The first render marks nothing (a list that was
 * already there does not animate when it opens); an id that turns up later is fresh for FRESH_MS.
 * Pure over its state so a test can drive it: `seen` holds every id met so far, `born` when each fresh one arrived.
 */
export function trackFresh(seen: Set<string> | null, born: Map<string, number>, ids: readonly string[], now: number): { seen: Set<string>; fresh: Set<string> } {
  if (seen === null) return { seen: new Set(ids), fresh: new Set() }
  const fresh = new Set<string>()
  for (const id of ids) {
    if (!seen.has(id) && !born.has(id)) born.set(id, now)
    const at = born.get(id)
    if (at !== undefined && now - at < FRESH_MS) fresh.add(id)
  }
  return { seen, fresh }
}

export function useNewIds(ids: readonly string[]): ReadonlySet<string> {
  const seen = useRef<Set<string> | null>(null)
  const born = useRef(new Map<string, number>())
  const out = trackFresh(seen.current, born.current, ids, Date.now())
  if (seen.current === null) seen.current = out.seen
  useEffect(() => {
    // a fresh id joins `seen` only once it is old, so a re-render in its first moments keeps its fade
    for (const id of ids) if (!born.current.has(id)) seen.current?.add(id)
  })
  return out.fresh
}

const EMPTY: ReadonlySet<string> = new Set()
const FreshCtx = createContext<ReadonlySet<string>>(EMPTY)

/** Rows below read their own freshness with useIsFresh(id). */
export function FreshProvider({ ids, children }: { ids: readonly string[]; children: ReactNode }) {
  const fresh = useNewIds(ids)
  return <FreshCtx.Provider value={fresh}>{children}</FreshCtx.Provider>
}

/** The class that fades a row in, when the row is new. */
export function useFreshClass(id: string): string | undefined {
  return useContext(FreshCtx).has(id) ? 'dash-rise' : undefined
}

const reduced = (): boolean => {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

/**
 * The value a bar draws: the previous turn's at first, then the current one on the next frame, so the CSS
 * transition on the bar's width carries it across. Without a different `prev`, or with reduced motion,
 * the bar draws the value at once.
 */
export function useGlide(value: number, prev?: number | null): number {
  const start = typeof prev === 'number' && Number.isFinite(prev) && prev !== value && !reduced() ? prev : value
  const [shown, setShown] = useState(start)
  useEffect(() => {
    if (shown === value) return
    if (reduced()) {
      setShown(value)
      return
    }
    const id = requestAnimationFrame(() => setShown(value))
    return () => cancelAnimationFrame(id)
  }, [value, shown, setShown])
  return shown
}
