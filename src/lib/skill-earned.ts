/** The "earned a skill" event (#106), pure part: which earned skills this browser has not shown yet.
 *  The time of the last showing is remembered per chat; a chat never seen before is seeded with "now",
 *  so opening an old chat does not toast skills earned long ago. */
import type { LitSkill } from '@/components/library/litopys-api'

export const SKILL_SEEN_PREFIX = 'rp.skillsSeen.'

export interface SeenStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

/** The default store is localStorage; a missing or blocked one reads as "nothing stored" and ignores writes. */
function defaultStore(): SeenStore | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage } catch { return null }
}

export function readSkillsSeen(chatId: string, store: SeenStore | null = defaultStore()): number | null {
  try {
    const v = store?.getItem(SKILL_SEEN_PREFIX + chatId)
    const n = v == null ? NaN : Number(v)
    return Number.isFinite(n) ? n : null
  } catch {
    return null
  }
}

export function writeSkillsSeen(chatId: string, at: number, store: SeenStore | null = defaultStore()) {
  try { store?.setItem(SKILL_SEEN_PREFIX + chatId, String(at)) } catch { /* storage unavailable: the next load toasts again at worst */ }
}

/** Earned skills (active, with a time) that came after `seenAt`, newest first. */
export function freshEarned(skills: readonly LitSkill[], seenAt: number): LitSkill[] {
  return skills
    .filter((k) => k.status === 'active' && (k.earnedAt ?? 0) > seenAt)
    .sort((a, b) => (b.earnedAt ?? 0) - (a.earnedAt ?? 0))
}

/** What to announce for this chat now, or null. Moves the remembered time forward whenever it returns something,
 *  and seeds it with `now` the first time the chat is seen. `quiet` moves it forward without announcing
 *  (the user is looking at the skills, or just changed them). */
export function takeEarned(
  chatId: string,
  skills: readonly LitSkill[],
  { now = Date.now(), quiet = false, store = defaultStore() }: { now?: number; quiet?: boolean; store?: SeenStore | null } = {},
): { skill: LitSkill; more: number } | null {
  const seen = readSkillsSeen(chatId, store)
  if (seen === null) {
    writeSkillsSeen(chatId, now, store)
    return null
  }
  const [newest, ...rest] = freshEarned(skills, seen)
  if (!newest) return null
  writeSkillsSeen(chatId, Math.max(seen, newest.earnedAt ?? 0), store)
  return quiet ? null : { skill: newest, more: rest.length }
}

/** How many earned skills and candidates the chat has. */
export function skillCounts(skills: readonly LitSkill[] | undefined): { earned: number; candidates: number } {
  const list = skills ?? []
  return { earned: list.filter((k) => k.status === 'active').length, candidates: list.filter((k) => k.status === 'proposed').length }
}
