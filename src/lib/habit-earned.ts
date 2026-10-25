/** The "earned a habit" event (#106), pure part: which earned habits this browser has not shown yet.
 *  The time of the last showing is remembered per chat; a chat never seen before is seeded with "now",
 *  so opening an old chat does not toast habits earned long ago. */
import type { LitHabit } from '@/components/library/litopys-api'

export const HABIT_SEEN_PREFIX = 'rp.habitsSeen.'

export interface SeenStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

/** The default store is localStorage; a missing or blocked one reads as "nothing stored" and ignores writes. */
function defaultStore(): SeenStore | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage } catch { return null }
}

export function readHabitsSeen(chatId: string, store: SeenStore | null = defaultStore()): number | null {
  try {
    const v = store?.getItem(HABIT_SEEN_PREFIX + chatId)
    const n = v == null ? NaN : Number(v)
    return Number.isFinite(n) ? n : null
  } catch {
    return null
  }
}

export function writeHabitsSeen(chatId: string, at: number, store: SeenStore | null = defaultStore()) {
  try { store?.setItem(HABIT_SEEN_PREFIX + chatId, String(at)) } catch { /* storage unavailable: the next load toasts again at worst */ }
}

/** Earned habits (active, with a time) that came after `seenAt`, newest first. */
export function freshEarned(habits: readonly LitHabit[], seenAt: number): LitHabit[] {
  return habits
    .filter((k) => k.status === 'active' && (k.earnedAt ?? 0) > seenAt)
    .sort((a, b) => (b.earnedAt ?? 0) - (a.earnedAt ?? 0))
}

/** What to announce for this chat now, or null. Moves the remembered time forward whenever it returns something,
 *  and seeds it with `now` the first time the chat is seen. `quiet` moves it forward without announcing
 *  (the user is looking at the habits, or just changed them). */
export function takeEarned(
  chatId: string,
  habits: readonly LitHabit[],
  { now = Date.now(), quiet = false, store = defaultStore() }: { now?: number; quiet?: boolean; store?: SeenStore | null } = {},
): { habit: LitHabit; more: number } | null {
  const seen = readHabitsSeen(chatId, store)
  if (seen === null) {
    writeHabitsSeen(chatId, now, store)
    return null
  }
  const [newest, ...rest] = freshEarned(habits, seen)
  if (!newest) return null
  writeHabitsSeen(chatId, Math.max(seen, newest.earnedAt ?? 0), store)
  return quiet ? null : { habit: newest, more: rest.length }
}

/** How many earned habits and candidates the chat has. */
export function habitCounts(habits: readonly LitHabit[] | undefined): { earned: number; candidates: number } {
  const list = habits ?? []
  return { earned: list.filter((k) => k.status === 'active').length, candidates: list.filter((k) => k.status === 'proposed').length }
}
