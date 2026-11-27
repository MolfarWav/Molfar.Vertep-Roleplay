import type { Chat } from './types'

/**
 * A long chat loads by pages (Molfar.Vertep#537): opening a chat, a refresh after a reply and a background refresh
 * bring its newest messages (`GET /chats/:id?tail=N`), "Load earlier" brings the page before the first one held
 * (`GET /chats/:id/messages?before=<id>&limit=N`), and what needs every message (find, bookmarks, export, select all)
 * asks for the rest first. `firstIndex` says where the messages held start, `total` how many the chat has.
 */

/** How many of the newest messages a chat opens with: two screens of the chat view's page, and at least 100. */
export function chatTail(pageSize: number): number {
  return Math.max(100, Math.ceil(pageSize) * 2)
}

/** Whether older messages of the chat are still on the server only. */
export function hasOlder(c: Pick<Chat, 'firstIndex'> | null | undefined): boolean {
  return !!c && (c.firstIndex ?? 0) > 0
}

/** How many messages the chat has: the whole chat's count when any are held, else the list's count. */
export function messageTotal(c: { messages?: readonly unknown[]; firstIndex?: number; total?: number; messageCount?: number }): number {
  if (c.messages && c.messages.length > 0) return Math.max(c.total ?? 0, (c.firstIndex ?? 0) + c.messages.length)
  return c.messageCount ?? 0
}

/** The page fields of a server answer (an answer without them is the whole chat). */
export function pageFields(r: { firstIndex?: number; total?: number; older?: Chat['olderUse'] } | null | undefined, held: number): Pick<Chat, 'firstIndex' | 'total' | 'olderUse'> {
  if (!r || typeof r.firstIndex !== 'number') return { firstIndex: 0, total: held }
  return { firstIndex: r.firstIndex, total: typeof r.total === 'number' ? r.total : r.firstIndex + held, ...(r.older ? { olderUse: r.older } : {}) }
}

/**
 * A fresh copy of a chat's newest messages over the copy on screen. The older messages the screen holds stay when the
 * fresh ones start where they end (the same message at the same place in the chat): a reply or a sidecar's write
 * changes the newest messages, and a reader who loaded earlier pages keeps them. Anything else (a deletion further up,
 * another client's edit) takes the fresh copy as it is.
 */
export function mergeTail(shown: Chat, fresh: Chat): Chat {
  const f0 = fresh.firstIndex ?? 0
  const s0 = shown.firstIndex ?? 0
  if (f0 <= s0 || !fresh.messages.length || !shown.messages.length) return fresh
  const k = shown.messages.findIndex((m) => m.id === fresh.messages[0]!.id)
  if (k < 0 || s0 + k !== f0) return fresh
  return { ...fresh, messages: [...shown.messages.slice(0, k), ...fresh.messages], firstIndex: s0, ...(shown.olderUse ? { olderUse: shown.olderUse } : { olderUse: undefined }) }
}

/** An older page put in front of the messages held, or null when it does not end where they start (the chat changed). */
export function prependPage(shown: Chat, page: Pick<Chat, 'messages' | 'firstIndex' | 'total' | 'olderUse'>): Chat | null {
  const p0 = page.firstIndex ?? 0
  const s0 = shown.firstIndex ?? 0
  if (p0 + page.messages.length !== s0) return null
  const ids = new Set(shown.messages.map((m) => m.id))
  if (page.messages.some((m) => ids.has(m.id))) return null
  return { ...shown, messages: [...page.messages, ...shown.messages], firstIndex: p0, total: page.total ?? shown.total, olderUse: page.olderUse }
}
