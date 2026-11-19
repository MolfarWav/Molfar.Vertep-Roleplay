// Travel by a tap on the places map (Molfar.Vertep#454, M3): the pure parts. A trip is the player's own move plus a hidden
// direction ([[...]], the channel Skip time uses): the reply narrates the way and the arrival, and the Dashboard clock follows
// the reply. No model call is made here; the minutes come from the distance on the board, and the player can change them.

import type { MapPos } from '@/lib/place-map'

export const TRAVEL_MODES = ['foot', 'ride', 'skip'] as const
export type TravelMode = (typeof TRAVEL_MODES)[number]

export const MINUTES_MAX = 99999
export const VIA_MAX = 120
const FOOT_UNITS_PER_MINUTE = 10
const RIDE_FACTOR = 0.4

const roundTo5 = (n: number) => Math.max(5, Math.round(n / 5) * 5)

/** The walking time between two spots of the board: 10 board units a minute, to the nearest 5 minutes, at least 5. */
export function footMinutes(a: MapPos, b: MapPos): number {
  return roundTo5(Math.hypot(a.x - b.x, a.y - b.y) / FOOT_UNITS_PER_MINUTE)
}

/** The minutes of a trip from the walking time: riding takes 0.4 of it, skipping the road takes none. */
export function minutesFor(foot: number, mode: TravelMode): number {
  if (mode === 'skip') return 0
  const f = Math.min(MINUTES_MAX, Math.max(1, Math.round(foot)))
  return mode === 'ride' ? roundTo5(f * RIDE_FACTOR) : f
}

/** A whole number of minutes in 1..MINUTES_MAX, or null. */
export const cleanMinutes = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= MINUTES_MAX ? v : null)

/** A road's name as it is kept: spaces squeezed, no brackets, 1 to VIA_MAX characters, or null. */
export function cleanVia(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.replace(/[[\]]/g, '').replace(/\s+/g, ' ').trim().slice(0, VIA_MAX)
  return t || null
}

/** "20 minutes", "1 hour", "1 hour 30 minutes", "3 hours". */
export function spanOfMinutes(minutes: number): string {
  const m = Math.max(1, Math.round(minutes))
  const h = Math.floor(m / 60)
  const rest = m % 60
  const hours = h ? `${h} hour${h === 1 ? '' : 's'}` : ''
  const mins = rest ? `${rest} minute${rest === 1 ? '' : 's'}` : ''
  return [hours, mins].filter(Boolean).join(' ')
}

const name = (s: string) => s.replace(/[[\]]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80)

export interface TravelPlan {
  /** where the story is now (a whole place or a room); null when the map does not know */
  from: string | null
  to: string
  mode: TravelMode
  /** the minutes the trip takes (ignored for 'skip', for an unknown start and for a move within one place) */
  minutes: number
  /** the road's own name, when it has one */
  via: string | null
  /** the move is between rooms of one place, so there is no road and no time */
  within: boolean
  /** a road event: the DM's own waiting event, or the kind the dice named; none when absent */
  event?: { dm: true } | { kind: string } | null
}

/** The hidden direction that rides on the player's move. */
export function travelDirection(p: TravelPlan): string {
  const to = name(p.to)
  const who = "the player's character (and whoever is with them)"
  if (p.within) return `[[Move: ${who} goes to ${to}. A line on the move is enough; continue the story from there.]]`
  if (!p.from) return `[[Travel: ${who} heads to ${to}. Narrate the way briefly, then the arrival at ${to}.]]`
  const from = name(p.from)
  if (p.mode === 'skip') return `[[Travel: ${who} goes from ${from} to ${to}. Skip the road: at most a line on it, then the arrival at ${to}.]]`
  const way = p.via ? `along the road known as "${name(p.via)}" (keep to it)` : 'along a road or street you name in a few words, so it can be walked the same way again'
  const how = p.mode === 'ride' ? 'riding' : 'on foot'
  const happens = p.event && 'dm' in p.event ? ' The narrator holds an event for this turn: let it happen on the road if it fits.' : p.event && 'kind' in p.event ? ` Something small happens on the road: ${name(p.event.kind)}.` : ''
  return `[[Travel: ${who} goes from ${from} to ${to} ${how}, about ${spanOfMinutes(p.minutes)}. Narrate the way in a few lines, ${way}, then the arrival at ${to}.${happens} Show the new time of day.]]`
}

// ---------- a road event ----------
// Off unless the player turns it on in the travel window. When the DM is already holding an event, that one plays on the road (it is
// injected into the next reply anyway; the direction only says where it belongs). Otherwise code rolls a d100 against the chance the
// player set, seeded, so reopening the window shows the same roll; a hit names a small kind of event and the reply makes up the rest.

export const ROAD_EVENTS = [
  'a stranger on the road',
  'an obstacle in the way',
  'a sudden change in the weather',
  'something found by the roadside',
  'a feeling of being watched',
  'a traveller in trouble',
  'a rumour overheard',
  'a sign that something is wrong ahead',
] as const

const fnv = (s: string): number => {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

export const CHANCE_DEFAULT = 25

export interface RoadRoll { roll: number; chance: number; hit: boolean; kind: string | null }

/** A seeded d100 against `chance` (1..100). The same seed gives the same roll and kind. */
export function rollRoadEvent(seed: string, chance: number): RoadRoll {
  const c = Math.min(100, Math.max(1, Math.round(chance) || CHANCE_DEFAULT))
  const roll = (fnv(`${seed}|d100`) % 100) + 1
  const hit = roll <= c
  return { roll, chance: c, hit, kind: hit ? ROAD_EVENTS[fnv(`${seed}|kind`) % ROAD_EVENTS.length]! : null }
}

export interface EventPref { on: boolean; chance: number }

const prefKey = (chatId: string) => `rp.map.roadEvent.${chatId}`

/** The road event switch and chance, kept per chat in this browser (off, 25 until the player changes them). */
export function loadEventPref(chatId: string, st: Pick<Storage, 'getItem'> | null): EventPref {
  try {
    const raw = JSON.parse(st?.getItem(prefKey(chatId)) ?? 'null') as { on?: unknown; chance?: unknown } | null
    const chance = typeof raw?.chance === 'number' && Number.isFinite(raw.chance) ? Math.min(100, Math.max(1, Math.round(raw.chance))) : CHANCE_DEFAULT
    return { on: raw?.on === true, chance }
  } catch { return { on: false, chance: CHANCE_DEFAULT } }
}

export function saveEventPref(chatId: string, pref: EventPref, st: Pick<Storage, 'setItem'> | null): void {
  try { st?.setItem(prefKey(chatId), JSON.stringify({ on: pref.on, chance: Math.min(100, Math.max(1, Math.round(pref.chance) || CHANCE_DEFAULT)) })) } catch { /* private mode */ }
}
