// The Chats page list: sorting and the time groups (pinned, today, this week,
// earlier). Pure, so the page and the tests share one definition.

export type ChatSort = 'recent' | 'messages' | 'name'
export type ChatKind = 'all' | 'single' | 'group'
export type TimeGroup = 'pinned' | 'today' | 'week' | 'earlier'

export interface ListChat { id: string; updatedAt: number; pinned?: boolean; title: string }

const DAY = 86_400_000

/** Today = the same local day as now; this week = the six days before it. */
export function timeGroupOf(ts: number, now: number = Date.now()): Exclude<TimeGroup, 'pinned'> {
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  const midnight = start.getTime()
  if (ts >= midnight) return 'today'
  if (ts >= midnight - 6 * DAY) return 'week'
  return 'earlier'
}

/** Sorted copy: by last activity, by size (then activity), or by name (then title). */
export function sortChats<T extends ListChat>(chats: T[], sort: ChatSort, sizeOf: (c: T) => number, nameOf: (c: T) => string): T[] {
  const out = [...chats]
  if (sort === 'messages') out.sort((a, b) => sizeOf(b) - sizeOf(a) || b.updatedAt - a.updatedAt)
  else if (sort === 'name') out.sort((a, b) => nameOf(a).localeCompare(nameOf(b)) || a.title.localeCompare(b.title))
  else out.sort((a, b) => b.updatedAt - a.updatedAt)
  return out
}

/** Pinned chats first, then (sorting by recent only) one group per period; other sorts keep one list after the pins. */
export function groupChats<T extends ListChat>(chats: T[], sort: ChatSort, now: number = Date.now()): { key: TimeGroup | 'all'; chats: T[] }[] {
  const pinned = chats.filter((c) => c.pinned)
  const rest = chats.filter((c) => !c.pinned)
  const out: { key: TimeGroup | 'all'; chats: T[] }[] = []
  if (pinned.length) out.push({ key: 'pinned', chats: pinned })
  if (sort !== 'recent') {
    if (rest.length) out.push({ key: 'all', chats: rest })
    return out
  }
  for (const key of ['today', 'week', 'earlier'] as const) {
    const part = rest.filter((c) => timeGroupOf(c.updatedAt, now) === key)
    if (part.length) out.push({ key, chats: part })
  }
  return out
}
