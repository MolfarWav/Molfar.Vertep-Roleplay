// The world book and Places show what the DM wrote. They are shown at once when it was written from the story
// the player has played; a world built before the story (from cards, a recipe or the library) holds records the
// story has not shown yet, so the player is asked once. The answer is kept for the session, per chat or world.

import type { WorldRef } from '@/lib/world'

const KEY = 'rp.worldRevealed'

/** The key a chat or a saved world is remembered by. */
export const revealKey = (ref: WorldRef): string => ('worldId' in ref ? `w:${ref.worldId}` : `c:${ref.chatId}`)

/**
 * Is the question needed? A chat's world with no `origin` was written by the DM from the story; with an origin
 * Start built it. A saved world with `from` was saved from a chat that was played; without it, it was built.
 * `undefined` = not known yet.
 */
export function needsGate(ref: WorldRef, info: { origin?: unknown; from?: unknown } | null | undefined): boolean | undefined {
  if (!info) return undefined
  if ('worldId' in ref) return !info.from
  return !!info.origin
}

type Store = Pick<Storage, 'getItem' | 'setItem'>
const session = (): Store | null => {
  try { return sessionStorage } catch { return null }
}

const read = (store: Store | null): string[] => {
  try {
    const v = JSON.parse(store?.getItem(KEY) ?? '[]')
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

export const isRevealed = (ref: WorldRef, store: Store | null = session()): boolean => read(store).includes(revealKey(ref))

export function markRevealed(ref: WorldRef, store: Store | null = session()): void {
  try {
    const list = read(store)
    const k = revealKey(ref)
    if (!list.includes(k)) store?.setItem(KEY, JSON.stringify([...list, k].slice(-60)))
  } catch { /* storage is optional */ }
}
