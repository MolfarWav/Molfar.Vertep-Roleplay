// What a character wears and carries, for the Dashboard's "Outfit and things" and "Here" cards. By default the
// Dashboard sensor says it (`carrySource: 'sensor'`: its outfit split into items and its `holding` text); with the
// World DM as the source its lists hold wearing, carried and nearby too. Things the DM has recorded as held by
// the person are always carried things. Pure: no React, no store.

import type { DashChar } from '@/lib/dashboard'
import type { WorldCarry, WorldHere } from '@/lib/world'

/** The sensor writes "nothing" or "-" for empty hands: that is no chip. */
const NOTHING = /^(nothing|none|empty|empty[- ]handed|no|n\/a|-|—|–|нічого|нічим|порожньо)\.?$/i

/** "grey coat, black jeans" -> ["grey coat", "black jeans"]: no empties, no "nothing", no repeats. */
export function splitList(text: string | null | undefined): string[] {
  const out: string[] = []
  for (const raw of (text ?? '').split(/[,;]/)) {
    const part = raw.trim()
    if (!part || NOTHING.test(part)) continue
    if (!out.some((o) => o.toLowerCase() === part.toLowerCase())) out.push(part)
  }
  return out
}

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()
const entryOf = (map: Record<string, WorldCarry> | undefined, name: string): WorldCarry | undefined => {
  const key = map ? Object.keys(map).find((k) => sameName(k, name)) : undefined
  return key ? map?.[key] : undefined
}

export interface Outfit {
  wearing: string[]
  /** what is in the hands: the carry's `hands` text, else the sensor's `holding` */
  hands: string[]
  /** the DM's carried list (DM source only) and the things the DM has recorded as held by the person */
  carried: { what: string; where?: string }[]
  /** only when the World DM keeps the lists */
  nearby: string[]
}

/** Wearing (the carry's list, else the sensor's outfit), in hands, carried (DM list plus held things), nearby (DM source only). */
export function outfitOf(name: string, char: DashChar | undefined, here: WorldHere | null): Outfit {
  const dm = here?.carrySource === 'dm'
  const carry = entryOf(here?.carry, name)
  const wearing = carry?.wearing.length ? [...carry.wearing] : splitList(char?.outfit)
  const hands = splitList(carry?.hands !== undefined ? carry.hands : char?.holding)
  const carried = dm && carry ? carry.carried.map((c) => ({ ...c })) : []
  for (const t of here?.held ?? []) {
    if (!sameName(t.who, name)) continue
    if (hands.some((h) => sameName(h, t.name)) || carried.some((c) => sameName(c.what, t.name))) continue
    carried.push({ what: t.name })
  }
  return { wearing, hands, carried, nearby: dm && carry ? [...carry.nearby] : [] }
}

export const outfitEmpty = (o: Outfit): boolean => !o.wearing.length && !o.hands.length && !o.carried.length && !o.nearby.length

/** How many things a character has on them: for the "Ren · 4 things" buttons. */
export const thingCount = (o: Outfit): number => o.wearing.length + o.hands.length + o.carried.length

/**
 * With the World DM as the source: what the Dashboard sensor says when it differs from the DM's list (a line to
 * compare the two on the same reply). null in sensor mode, and when they agree or the sensor says nothing.
 */
export function sensorDifference(name: string, here: WorldHere | null): { wearing: string[]; hands: string[] } | null {
  if (!here || here.carrySource !== 'dm') return null
  const s = entryOf(here.sensor, name)
  if (!s) return null
  const wearing = s.wearing
  const hands = splitList(s.hands)
  if (!wearing.length && !hands.length) return null
  const dm = entryOf(here.carry, name)
  const set = (list: string[]) => list.map((x) => x.toLowerCase()).sort().join('|')
  const dmHas = [...(dm?.carried.map((c) => c.what) ?? []), ...here.held.filter((t) => sameName(t.who, name)).map((t) => t.name)]
  const missing = hands.filter((h) => !dmHas.some((d) => sameName(d, h)))
  if (set(wearing) === set(dm?.wearing ?? []) && missing.length === 0) return null
  return { wearing, hands }
}

/** Did the sensor's outfit or holding change against the snapshot before? null when that snapshot carries neither (nothing to compare). */
export function sensorOutfitChanged(char: DashChar | undefined): boolean | null {
  const prev = char?.prev
  if (!char || !prev) return null
  const hasOutfit = prev.outfit !== undefined
  const hasHolding = prev.holding !== undefined
  if (!hasOutfit && !hasHolding) return null
  const norm = (v: string | null | undefined) => splitList(v).map((x) => x.toLowerCase()).sort().join('|')
  return (hasOutfit && norm(prev.outfit) !== norm(char.outfit)) || (hasHolding && norm(prev.holding) !== norm(char.holding))
}
