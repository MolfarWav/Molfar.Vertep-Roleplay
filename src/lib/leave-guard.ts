// "Leaving with unsaved changes asks" (GitHub #103). The card editor registers a guard while it
// holds changes; the store's `set` asks the guard before a change that takes the user away from
// the editor (another section, another card, a chat, the drawer closing). The guard shows its
// dialog and lets the change go ahead only when the user has saved or discarded. Pure module.

export interface LeaveGuard {
  /** The editor holds changes that are not saved. */
  dirty: () => boolean
  /** Ask the user; call `go` when the change may proceed (after Save or Discard), never when they stay. */
  ask: (go: () => void) => void
}

let guard: LeaveGuard | null = null

/** Registers the guard; the returned function removes it (only if it is still the one registered). */
export function setLeaveGuard(g: LeaveGuard): () => void {
  guard = g
  return () => { if (guard === g) guard = null }
}

export function currentLeaveGuard(): LeaveGuard | null {
  return guard
}

/** The parts of the app state that say where the user is. */
const PLACE_KEYS = ['view', 'drawer', 'activeCharacterId', 'activeChatId'] as const

/** Whether `next` (a state change) moves the user to another place than `current`. */
export function movesAway(current: Record<string, unknown>, next: Record<string, unknown> | null | undefined): boolean {
  if (!next) return false
  return PLACE_KEYS.some((k) => k in next && next[k] !== current[k])
}

/**
 * Wraps a store `set`: a change that moves the user away from a dirty card editor waits for the
 * guard's answer. Everything else (and every change while nothing is dirty) goes straight through.
 */
export function guardLeaving<S extends Record<string, unknown>>(
  raw: (partial: unknown, replace?: unknown) => void,
  get: () => S,
): (partial: unknown, replace?: unknown) => void {
  return (partial, replace) => {
    const g = guard
    if (g?.dirty()) {
      const current = get()
      const next = typeof partial === 'function' ? (partial as (s: S) => Record<string, unknown>)(current) : (partial as Record<string, unknown>)
      if (movesAway(current, next)) {
        g.ask(() => raw(partial, replace))
        return
      }
    }
    raw(partial, replace)
  }
}
