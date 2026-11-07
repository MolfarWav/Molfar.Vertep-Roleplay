// What changed since the player's last reply, as far as the Dashboard can tell without guessing:
// the sensor's mood and stat history (`char.moodWas`, `char.prev`), the World DM's last run
// (`WorldHere.changed`) and the quests the last turn opened. Pure: no React, no store.

import { DISPOSITION, type DispositionStat } from '@/lib/soul'
import type { DashChar, DashView } from '@/lib/dashboard'
import { sensorOutfitChanged } from '@/lib/dash-outfit'
import type { WorldHere } from '@/lib/world'

/** The Dashboard tab that holds a change. */
export type ChangeTab = 'person' | 'here' | 'quests'

export type ChangeKind = 'mood' | 'carry' | 'fell' | 'rose' | 'place' | 'things' | 'quest' | 'proposal' | 'duplicate'

export interface DashChange {
  kind: ChangeKind
  tab: ChangeTab
  /** the character it is about (person changes) */
  who?: string
  /** a stat that fell: shown in red */
  negative: boolean
  /** how many changes this entry counts for (a stat entry names several stats) */
  n: number
  stats?: DispositionStat[]
  from?: string
  to?: string
  /** the place name, for a move */
  place?: string
}

export interface ChangeCount { n: number; negative: boolean }

const same = (a: string | null | undefined, b: string | null | undefined) => (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase()

/** Mood, the stats against the snapshot before, and the DM's carry change, for one character. */
export function personChanges(name: string, char: DashChar | undefined, here: WorldHere | null): DashChange[] {
  if (!char) return []
  const out: DashChange[] = []
  if (char.mood && char.moodWas && !same(char.mood, char.moodWas)) {
    out.push({ kind: 'mood', tab: 'person', who: name, negative: false, n: 1, from: char.moodWas, to: char.mood })
  }
  // outfit and hands: from the sensor's own report by default (against the snapshot before, when it has them),
  // from the DM's last run when the DM keeps the lists
  const carried = here?.carrySource === 'dm' ? !!here.changed.carry.some((c) => same(c, name)) : sensorOutfitChanged(char) === true
  if (carried) out.push({ kind: 'carry', tab: 'person', who: name, negative: false, n: 1 })
  const prev = char.prev?.stats
  if (prev) {
    const fell = DISPOSITION.filter((s) => typeof prev[s] === 'number' && char.stats[s] < prev[s])
    const rose = DISPOSITION.filter((s) => typeof prev[s] === 'number' && char.stats[s] > prev[s])
    if (fell.length) out.push({ kind: 'fell', tab: 'person', who: name, negative: true, n: fell.length, stats: fell })
    if (rose.length) out.push({ kind: 'rose', tab: 'person', who: name, negative: false, n: rose.length, stats: rose })
  }
  return out
}

/** The scene's own changes: a move, things that moved, quests the last turn opened or proposed. */
export function sceneChanges(view: DashView, here: WorldHere | null): DashChange[] {
  const out: DashChange[] = []
  if (here) {
    const ids = new Set(here.changed.ids)
    const placeIds = [here.place, here.parent, ...here.spots].filter((r): r is NonNullable<typeof r> => !!r).map((r) => r.id)
    const movedHere = here.place ? ids.has(here.place.id) : false
    if (movedHere) out.push({ kind: 'place', tab: 'here', negative: false, n: 1, place: here.place?.name })
    const thingIds = [...here.things, ...here.held, ...here.asleep].map((r) => r.id).filter((id) => ids.has(id))
    if (thingIds.length) out.push({ kind: 'things', tab: 'here', negative: false, n: thingIds.length })
    // a spot or parent record the DM touched counts as the place changing too, once
    if (!movedHere && placeIds.some((id) => ids.has(id))) out.push({ kind: 'place', tab: 'here', negative: false, n: 1, place: here.place?.name })
  }
  const fresh = view.threads.filter((th) => th.status === 'open' && th.since === view.turn).length
  if (fresh > 0) out.push({ kind: 'quest', tab: 'quests', negative: false, n: fresh })
  const waiting = view.proposals?.length ?? 0
  if (waiting > 0) out.push({ kind: 'proposal', tab: 'quests', negative: false, n: waiting })
  return out
}

export function tally(list: DashChange[]): ChangeCount | null {
  const n = list.reduce((sum, c) => sum + c.n, 0)
  return n > 0 ? { n, negative: list.some((c) => c.negative) } : null
}

/** Everything the "Since your last reply" row lists: the focused character, the stats that fell for the others, then the scene. */
export function sinceChanges(view: DashView, here: WorldHere | null, focus: string): DashChange[] {
  const out = personChanges(focus, view.chars[focus], here)
  for (const name of view.order) {
    if (name === focus) continue
    const c = view.chars[name]
    if (!c || c.compact) continue
    out.push(...personChanges(name, c, here).filter((x) => x.kind === 'fell'))
  }
  // two characters that may be one person: a chip that opens the first of them on the Person tab
  for (const s of view.suggest ?? []) {
    if (view.chars[s.a] && view.chars[s.b] && s.a !== s.b) out.push({ kind: 'duplicate', tab: 'person', who: s.a, negative: false, n: 1, to: s.b })
  }
  out.push(...sceneChanges(view, here))
  return out
}

/** What fell comes first (the order the "Since your last reply" row and the line under the reply show). */
export function sortChanges(list: DashChange[]): DashChange[] {
  return [...list].sort((a, b) => Number(b.kind === 'fell') - Number(a.kind === 'fell'))
}

/** Changes the folded line under the reply spells out; the rest is a count. */
export const SUMMARY_SHOWN = 2

/**
 * The changes the folded line spells out and how many more there are. `who` is the character every spelled-out change is
 * about (so the line names them once: "Ada · trust fell, mood calm → tense"), or null when they differ or one has no character.
 */
export function summaryOf(list: DashChange[], shown = SUMMARY_SHOWN): { head: DashChange[]; more: number; who: string | null } {
  const head = list.slice(0, shown)
  const who = head.length > 0 && head.every((c) => c.who && c.who === head[0].who) ? head[0].who! : null
  return { head, more: Math.max(0, list.length - shown), who }
}

/**
 * Does the Dashboard's view belong to this reply? The line under a reply may show what changed only then: the view's
 * newest snapshot is keyed `<messageId>#<swipe>` (the plugin's `key`), and `stale` says the newest message has no snapshot
 * yet. Between a reply and its update the view is still the previous reply's, which must not show under the new one.
 */
export function viewIsOfReply(view: Pick<DashView, 'key' | 'stale'> | null | undefined, msg: { id: string; role: string; activeSwipe: number }): boolean {
  return !!view && msg.role === 'assistant' && !view.stale && view.key === `${msg.id}#${msg.activeSwipe}`
}

/** Whether the line under a reply shows: the newest message, the setting on, the Dashboard read, no reply being written, no update running, the view that reply's own, something changed. */
export function changesLineVisible(o: { last: boolean; on: boolean; ready: boolean; writing: boolean; updating: boolean; ofReply: boolean; count: number }): boolean {
  return o.last && o.on && o.ready && !o.writing && !o.updating && o.ofReply && o.count > 0
}

/** The counters on the tabs: how many changes each tab holds for the focused character. */
export function tabCounts(view: DashView, here: WorldHere | null, focus: string): Record<ChangeTab, ChangeCount | null> {
  const scene = sceneChanges(view, here)
  return {
    person: tally(personChanges(focus, view.chars[focus], here)),
    here: tally(scene.filter((c) => c.tab === 'here')),
    quests: tally(scene.filter((c) => c.tab === 'quests')),
  }
}
