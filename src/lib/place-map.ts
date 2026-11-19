// The places map (Molfar.Vertep#454), pure: what a chat keeps (`Chat.placeMap`, chat meta), where a node
// goes when it has no position yet (code, no model), the route the story walks between two places.
// Board units, not pixels: the board is BOARD_W x BOARD_H and a picture under it is stretched to that frame.

import { buildPlaceTree } from '@/lib/world-places'
import type { WorldRecord } from '@/lib/world'

export const BOARD_W = 1600
export const BOARD_H = 1000
export const MAX_NODES = 200
export const MAX_ROUTES = 400
/** Nodes keep this far from the board's edge. */
const MARGIN = 70
/** The least distance between two whole places, and between a spot and anything. */
const GAP_PLACE = 150
const GAP_SPOT = 84
/** Distance of a new place from the place the story came from, and of a spot from its place. */
const RING_PLACE = 200
const RING_SPOT = 110

export interface MapPos { x: number; y: number }
export interface MapRoute { a: string; b: string }

/** What a chat keeps. `at` is the whole place the tracker saw the story in last (routes start there). */
export interface PlaceMapData {
  v: 1
  nodes: Record<string, MapPos>
  routes: MapRoute[]
  picture?: { id: string } | null
  at?: string
}

export const emptyMap = (): PlaceMapData => ({ v: 1, nodes: {}, routes: [] })

const clampPos = (p: MapPos): MapPos => ({
  x: Math.round(Math.min(BOARD_W - MARGIN, Math.max(MARGIN, p.x))),
  y: Math.round(Math.min(BOARD_H - MARGIN, Math.max(MARGIN, p.y))),
})

const routeKey = (a: string, b: string) => (a < b ? `${a}\n${b}` : `${b}\n${a}`)

/** Whatever came from the engine or an old build, as a clean value, or null when nothing is left. The server runs the same rules. */
export function cleanPlaceMap(v: unknown): PlaceMapData | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  const raw = v as Record<string, unknown>
  const out = emptyMap()
  if (raw.nodes && typeof raw.nodes === 'object' && !Array.isArray(raw.nodes)) {
    for (const [id, p] of Object.entries(raw.nodes as Record<string, unknown>)) {
      if (!id || id.length > 80 || !p || typeof p !== 'object') continue
      const { x, y } = p as Record<string, unknown>
      if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) continue
      out.nodes[id] = clampPos({ x, y })
      if (Object.keys(out.nodes).length >= MAX_NODES) break
    }
  }
  if (Array.isArray(raw.routes)) {
    const seen = new Set<string>()
    for (const r of raw.routes) {
      if (!r || typeof r !== 'object') continue
      const { a, b } = r as Record<string, unknown>
      if (typeof a !== 'string' || typeof b !== 'string' || !a || !b || a === b || a.length > 80 || b.length > 80) continue
      const k = routeKey(a, b)
      if (seen.has(k)) continue
      seen.add(k)
      out.routes.push(a < b ? { a, b } : { a: b, b: a })
      if (out.routes.length >= MAX_ROUTES) break
    }
  }
  const pic = raw.picture
  if (pic && typeof pic === 'object' && typeof (pic as { id?: unknown }).id === 'string' && (pic as { id: string }).id && (pic as { id: string }).id.length <= 200) {
    out.picture = { id: (pic as { id: string }).id }
  }
  if (typeof raw.at === 'string' && raw.at && raw.at.length <= 80) out.at = raw.at
  return Object.keys(out.nodes).length || out.routes.length || out.picture || out.at ? out : null
}

export interface MapNode {
  id: string
  name: string
  spot: boolean
  /** the whole place a spot belongs to */
  parentId: string | null
  here: boolean
  visits: number
  x: number
  y: number
}

const dist = (a: MapPos, b: MapPos) => Math.hypot(a.x - b.x, a.y - b.y)

/** A stable number from an id, so a new node's first angle does not depend on the order things arrive in. */
const hashOf = (s: string): number => {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return (h >>> 0) / 4294967296
}

/** The nearest free spot on rings around `centre`: `gap` from everything in `taken`, inside the board. Null only if the board is full. */
function freeSpot(centre: MapPos, ring: number, gap: number, taken: MapPos[], seed: string, above = false): MapPos | null {
  // a spot starts in the upper half around its place: the place's name hangs below it
  const start = above ? -Math.PI * (0.85 - hashOf(seed) * 0.7) : hashOf(seed) * Math.PI * 2
  const free = (p: MapPos) => p.x >= MARGIN && p.x <= BOARD_W - MARGIN && p.y >= MARGIN && p.y <= BOARD_H - MARGIN && taken.every((t) => dist(t, p) >= gap)
  for (let r = ring; r <= 900; r += Math.max(gap * 0.7, 60)) {
    const slots = Math.max(6, Math.floor((2 * Math.PI * r) / gap))
    for (let i = 0; i < slots; i++) {
      const ang = start + (i * 2 * Math.PI) / slots
      const p = { x: Math.round(centre.x + Math.cos(ang) * r), y: Math.round(centre.y + Math.sin(ang) * r) }
      if (free(p)) return p
    }
  }
  // the rings ran out: any free cell of a grid
  for (let y = MARGIN; y <= BOARD_H - MARGIN; y += gap / 2) {
    for (let x = MARGIN; x <= BOARD_W - MARGIN; x += gap / 2) if (free({ x, y })) return { x, y }
  }
  return null
}

export interface MapLayout {
  nodes: MapNode[]
  /** positions given to nodes that had none: the caller keeps them */
  added: Record<string, MapPos>
}

/**
 * The map's nodes: every active place record, a spot beside the whole place its `inside` names. A node with a kept
 * position stays; a new whole place goes next to the place the story came from (the route that reaches it, else the
 * place the story is in, else the middle), a new spot on a small ring around its place. Nothing is ever moved.
 * `hereId` = the scene's place record (a spot or a whole place).
 */
export function layoutMap(records: WorldRecord[], data: PlaceMapData | null, hereId: string | null): MapLayout {
  const tree = buildPlaceTree(records, hereId)
  // oldest first (n2 before n10), whatever order the book was read in: the first place goes in the middle
  const places = records.filter((r) => r.kind === 'place' && r.status === 'active').sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }))
  const parentOf = new Map<string, string>()
  for (const root of tree.roots) for (const s of root.spots) parentOf.set(s.place.id, root.place.id)
  const kept = data?.nodes ?? {}
  const pos = new Map<string, MapPos>()
  for (const r of places) if (kept[r.id]) pos.set(r.id, kept[r.id])
  const added: Record<string, MapPos> = {}
  const taken = (spotsToo: boolean): MapPos[] => {
    const out: MapPos[] = []
    for (const r of places) {
      const p = pos.get(r.id)
      if (p && (spotsToo || !parentOf.has(r.id))) out.push(p)
    }
    return out
  }
  const give = (id: string, p: MapPos) => { pos.set(id, p); added[id] = p }
  const hereWhole = hereId ? parentOf.get(hereId) ?? hereId : null

  // whole places first (and spots whose place is not in the book), in the book's order
  for (const r of places) {
    if (pos.has(r.id) || parentOf.has(r.id)) continue
    const placed = taken(false)
    let from: MapPos | undefined
    const link = (data?.routes ?? []).map((rt) => (rt.a === r.id ? rt.b : rt.b === r.id ? rt.a : null)).find((o) => o && pos.has(o))
    if (link) from = pos.get(link)
    else if (hereWhole && hereWhole !== r.id) from = pos.get(hereWhole)
    if (!placed.length) { give(r.id, { x: BOARD_W / 2, y: BOARD_H / 2 }); continue }
    const centre = from ?? placed[0]
    // spots count too: a new place does not land on top of one
    const p = freeSpot(centre, RING_PLACE, GAP_PLACE, taken(true), r.id)
    give(r.id, p ?? clampPos({ x: centre.x + RING_PLACE, y: centre.y }))
  }
  for (const r of places) {
    const parent = parentOf.get(r.id)
    if (pos.has(r.id) || !parent) continue
    const centre = pos.get(parent) ?? { x: BOARD_W / 2, y: BOARD_H / 2 }
    const p = freeSpot(centre, RING_SPOT, GAP_SPOT, taken(true), r.id, true)
    give(r.id, p ?? clampPos({ x: centre.x + RING_SPOT, y: centre.y }))
  }
  const nodes: MapNode[] = places.map((r) => {
    const p = pos.get(r.id) ?? { x: BOARD_W / 2, y: BOARD_H / 2 }
    return { id: r.id, name: r.name, spot: parentOf.has(r.id), parentId: parentOf.get(r.id) ?? null, here: r.id === hereId, visits: r.visits ?? 0, x: p.x, y: p.y }
  })
  return { nodes, added }
}

/** Keep new positions (a shallow merge, nothing is replaced). */
export function withPositions(data: PlaceMapData | null, add: Record<string, MapPos>): PlaceMapData {
  const base = data ?? emptyMap()
  return { ...base, nodes: capNodes({ ...base.nodes, ...add }, Object.keys(add)) }
}

/** At most MAX_NODES: the ones just given stay, the oldest others go. */
function capNodes(nodes: Record<string, MapPos>, keep: string[]): Record<string, MapPos> {
  const ids = Object.keys(nodes)
  if (ids.length <= MAX_NODES) return nodes
  const protect = new Set(keep)
  const drop = ids.filter((i) => !protect.has(i)).slice(0, ids.length - MAX_NODES)
  const out = { ...nodes }
  for (const d of drop) delete out[d]
  return out
}

/**
 * A node dragged to (x, y). A whole place takes its spots with it, so they stay around it; a spot moves alone.
 * `spotIds` = the spots of this node (from the layout's nodes).
 */
export function moveNode(data: PlaceMapData | null, id: string, to: MapPos, spotIds: readonly string[] = []): PlaceMapData {
  const base = data ?? emptyMap()
  const from = base.nodes[id]
  const next = clampPos(to)
  const nodes = { ...base.nodes, [id]: next }
  if (from) {
    const dx = next.x - from.x
    const dy = next.y - from.y
    for (const s of spotIds) if (nodes[s]) nodes[s] = clampPos({ x: nodes[s].x + dx, y: nodes[s].y + dy })
  }
  return { ...base, nodes }
}

/** The whole place a record stands for: a spot's place, else itself. */
export function wholeOf(records: WorldRecord[], id: string | null | undefined): string | null {
  if (!id) return null
  const tree = buildPlaceTree(records, null)
  for (const root of tree.roots) if (root.place.id === id || root.spots.some((s) => s.place.id === id)) return root.place.id
  return null
}

/**
 * The story is now in `hereId`: when that is a different whole place than the one last seen, the two are joined
 * by a route (once). Moving between spots of one place is not a journey. `at` follows the story.
 * Returns the same object when nothing changed.
 */
export function stepRoute(data: PlaceMapData | null, records: WorldRecord[], hereId: string | null): PlaceMapData | null {
  const whole = wholeOf(records, hereId)
  if (!whole) return data
  const base = data ?? emptyMap()
  if (base.at === whole) return data
  const prev = base.at && records.some((r) => r.id === base.at && r.kind === 'place' && r.status === 'active') ? base.at : null
  let routes = base.routes
  if (prev && !routes.some((r) => routeKey(r.a, r.b) === routeKey(prev, whole))) {
    routes = [...routes, prev < whole ? { a: prev, b: whole } : { a: whole, b: prev }].slice(-MAX_ROUTES)
  }
  return { ...base, routes, at: whole }
}

/** The routes whose two ends are both on the map. */
export const visibleRoutes = (data: PlaceMapData | null, nodes: readonly MapNode[]): MapRoute[] => {
  const ids = new Set(nodes.map((n) => n.id))
  return (data?.routes ?? []).filter((r) => ids.has(r.a) && ids.has(r.b))
}
