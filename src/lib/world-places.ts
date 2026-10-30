// The World section's Places tab (pure): the records of kind place as a tree (whole places with their spots
// indented) and the things lying in them. Names are matched the way the engine matches them (`placeKey` in
// plugins/world): lower case, anything that is not a letter or a digit becomes a space.

import type { WorldRecord } from '@/lib/world'

export const placeKey = (s: string | null | undefined): string => (s ?? '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()

const namesOf = (r: WorldRecord): string[] => [r.name, ...r.aliases]

/** Does this record answer to that name (its name or an alias, without case or punctuation)? */
export const answersTo = (r: WorldRecord, name: string | null | undefined): boolean => {
  const k = placeKey(name)
  return !!k && namesOf(r).some((n) => placeKey(n) === k)
}

export interface PlaceNode {
  place: WorldRecord
  /** the story's current place (compared by record id) */
  here: boolean
  /** a spot whose `inside` names no place of this world, listed at the top level */
  strayInside?: string
  spots: PlaceNode[]
  /** things lying directly here */
  things: WorldRecord[]
}

export interface PlaceTree {
  roots: PlaceNode[]
  /** things with no place we know: held by a person, lying somewhere unnamed, or nowhere */
  unplaced: WorldRecord[]
  places: number
  things: number
}

const active = (r: WorldRecord) => r.status === 'active'

const byLook = (a: PlaceNode, b: PlaceNode) =>
  Number(b.here) - Number(a.here) || (b.place.visits ?? 0) - (a.place.visits ?? 0) || a.place.name.localeCompare(b.place.name)

/**
 * Whole places at the top, each spot under the place its `inside` names, things under the place or spot their
 * `place` names. A spot inside another spot goes under that spot's own place. `hereId` = the record of the
 * scene's place (GET /world/here). Retired records are left out.
 */
export function buildPlaceTree(records: WorldRecord[], hereId?: string | null): PlaceTree {
  const places = records.filter((r) => r.kind === 'place' && active(r))
  const things = records.filter((r) => r.kind === 'thing' && active(r))
  const nodes = new Map<string, PlaceNode>(places.map((p) => [p.id, { place: p, here: !!hereId && p.id === hereId, spots: [], things: [] }]))
  const findPlace = (name: string | null | undefined, exceptId?: string): PlaceNode | null => {
    const hits = places.filter((p) => p.id !== exceptId && answersTo(p, name))
    // a whole place wins over a spot of the same name
    const pick = hits.find((p) => p.size !== 'spot') ?? hits[0]
    return pick ? nodes.get(pick.id) ?? null : null
  }
  /** walks up from a spot to the whole place that holds it (a few levels at most, no loops) */
  const top = (n: PlaceNode): PlaceNode => {
    let cur = n
    for (let i = 0; i < 6 && cur.place.size === 'spot'; i++) {
      const up = findPlace(cur.place.inside, cur.place.id)
      if (!up || up === cur) break
      cur = up
    }
    return cur
  }
  const roots: PlaceNode[] = []
  for (const n of nodes.values()) {
    if (n.place.size !== 'spot') {
      roots.push(n)
      continue
    }
    const parent = findPlace(n.place.inside, n.place.id)
    const root = parent ? top(parent) : null
    if (root && root !== n && root.place.size !== 'spot') root.spots.push(n)
    else {
      if (n.place.inside) n.strayInside = n.place.inside
      roots.push(n)
    }
  }
  const unplaced: WorldRecord[] = []
  for (const t of things) {
    const at = t.holder ? null : findPlace(t.place)
    if (at) at.things.push(t)
    else unplaced.push(t)
  }
  roots.sort(byLook)
  for (const r of roots) r.spots.sort(byLook)
  unplaced.sort((a, b) => a.name.localeCompare(b.name))
  return { roots, unplaced, places: places.length, things: things.length }
}

/** Flat rows in reading order: each root, then its spots. */
export function treeRows(tree: PlaceTree): { node: PlaceNode; spot: boolean }[] {
  return tree.roots.flatMap((r) => [{ node: r, spot: false }, ...r.spots.map((s) => ({ node: s, spot: true }))])
}
