// The places map (Molfar.Vertep#454), pure: what a chat keeps (`Chat.placeMap`, chat meta), where a node
// goes when it has no position yet (code, no model), the route the story walks between two places.
// Board units, not pixels: the board is BOARD_W x BOARD_H and a picture under it is stretched to that frame.

import { buildPlaceTree } from '@/lib/world-places'
import { placeKind } from '@/lib/place-kinds'
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
/** A road: the two whole places it joins (`a` sorts first) and, once the player has set them, the walking time and the road's own name. */
export interface MapRoute { a: string; b: string; minutes?: number; via?: string }

/** The picture under the places: one of the player's own (an asset), a ready map of the engine (`<pack>/<map id>`), or none (the dotted grid). Nothing chosen = the app picks a ready map by what the places are. */
export type MapPicture = { id: string } | { builtin: string } | { none: true }

/** `<pack>/<map id>` as a chat keeps a ready map. */
const BUILTIN_RE = /^[a-z][a-z0-9-]{0,30}\/[a-z]+(?:-[a-z]+)*-[1-9][0-9]?$/

/** How big a map is in the story: the minutes one board unit takes on foot (town 0.1, region 3, world 40), so a trip says minutes, hours or days. */
export const SCALES = ['town', 'region', 'world'] as const
export type MapScale = (typeof SCALES)[number]
export const MAX_LEVELS = 12
/** How much of the Dashboard's place line a hand mark remembers. */
export const HERE_SCENE_MAX = 120
/** The id of the first map; the others are `l1`, `l2`... */
export const MAIN_LEVEL = 'main'
const LEVEL_ID = /^l[1-9][0-9]{0,2}$/
const isScale = (v: unknown): v is MapScale => (SCALES as readonly unknown[]).includes(v)

/** One more map of the chat (a country, a city's plan, a dungeon): its own places, roads and picture. A place stands on a level only where the player put it. `plan` = the place this map is the plan of. */
export interface MapLevel {
  id: string
  name: string
  scale: MapScale
  plan?: string
  nodes: Record<string, MapPos>
  routes: MapRoute[]
  picture?: MapPicture | null
}

/** "The story is here", marked by hand: the place, and the Dashboard's place line it was marked against (it holds only while that line stays as it was and names no place of the book). */
export interface HandHere { id: string; scene: string }

/** What a chat keeps. `at` is the whole place the tracker saw the story in last (routes start there). `nodes`, `routes`, `picture` (with `name` and `scale`) are the first map; `levels` are the others. */
export interface PlaceMapData {
  v: 1
  nodes: Record<string, MapPos>
  routes: MapRoute[]
  picture?: MapPicture | null
  /** the place the player marked as the one the story is in, for a story whose place the Dashboard cannot name (shared by all maps) */
  here?: HandHere
  /** the first map's name and scale (default: "Map", town) */
  name?: string
  scale?: MapScale
  levels?: MapLevel[]
  at?: string
  /** names the player gave places on the map only, by place record id; the World book, the Dashboard and the story keep the record's own name */
  labels?: Record<string, string>
  /** icons the player picked by hand, by place record id: `<kind>-<n>`, a file of the engine's icon set (`tavern-3`); no entry = the one the name says */
  icons?: Record<string, string>
}

export const emptyMap = (): PlaceMapData => ({ v: 1, nodes: {}, routes: [] })

/** An icon key as it is kept: `<kind>-<n>`, lowercase words and a number 1 to 99. */
export const ICON_KEY = /^[a-z]+(?:-[a-z]+)*-[1-9][0-9]?$/

/** A map label as it is kept: spaces squeezed, 1 to 80 characters, or null. */
export const cleanLabel = (s: unknown): string | null => {
  if (typeof s !== 'string') return null
  const t = s.replace(/\s+/g, ' ').trim().slice(0, 80)
  return t || null
}

const clampPos = (p: MapPos): MapPos => ({
  x: Math.round(Math.min(BOARD_W - MARGIN, Math.max(MARGIN, p.x))),
  y: Math.round(Math.min(BOARD_H - MARGIN, Math.max(MARGIN, p.y))),
})

const routeKey = (a: string, b: string) => (a < b ? `${a}\n${b}` : `${b}\n${a}`)

const cleanNodes = (raw: unknown): Record<string, MapPos> => {
  const out: Record<string, MapPos> = {}
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out
  for (const [id, p] of Object.entries(raw as Record<string, unknown>)) {
    if (!id || id.length > 80 || !p || typeof p !== 'object') continue
    const { x, y } = p as Record<string, unknown>
    if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) continue
    out[id] = clampPos({ x, y })
    if (Object.keys(out).length >= MAX_NODES) break
  }
  return out
}

const cleanRoutes = (raw: unknown): MapRoute[] => {
  const out: MapRoute[] = []
  if (!Array.isArray(raw)) return out
  const seen = new Set<string>()
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue
    const { a, b } = r as Record<string, unknown>
    if (typeof a !== 'string' || typeof b !== 'string' || !a || !b || a === b || a.length > 80 || b.length > 80) continue
    const k = routeKey(a, b)
    if (seen.has(k)) continue
    seen.add(k)
    const m = (r as { minutes?: unknown }).minutes
    const minutes = typeof m === 'number' && Number.isInteger(m) && m >= 1 && m <= 999999 ? m : null
    const v = (r as { via?: unknown }).via
    const via = typeof v === 'string' ? v.replace(/[[\]]/g, '').replace(/\s+/g, ' ').trim().slice(0, 120) : ''
    out.push({ ...(a < b ? { a, b } : { a: b, b: a }), ...(minutes ? { minutes } : {}), ...(via ? { via } : {}) })
    if (out.length >= MAX_ROUTES) break
  }
  return out
}

const cleanPicture = (raw: unknown): MapPicture | undefined => {
  const pic = raw as { id?: unknown; builtin?: unknown; none?: unknown } | null | undefined
  if (!pic || typeof pic !== 'object') return undefined
  if (typeof pic.id === 'string' && pic.id && pic.id.length <= 200) return { id: pic.id }
  if (typeof pic.builtin === 'string' && BUILTIN_RE.test(pic.builtin)) return { builtin: pic.builtin }
  if (pic.none === true) return { none: true }
  return undefined
}

const cleanHere = (raw: unknown): HandHere | null => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const { id, scene } = raw as Record<string, unknown>
  if (typeof id !== 'string' || !id || id.length > 80) return null
  return { id, scene: typeof scene === 'string' ? scene.replace(/\s+/g, ' ').trim().slice(0, HERE_SCENE_MAX) : '' }
}

/** A level's or the first map's name as it is kept: spaces squeezed, 1 to 40 characters, or null. */
export const cleanMapName = (s: unknown): string | null => {
  if (typeof s !== 'string') return null
  const t = s.replace(/\s+/g, ' ').trim().slice(0, 40)
  return t || null
}

/** Whatever came from the engine or an old build, as a clean value, or null when nothing is left. The server runs the same rules. */
export function cleanPlaceMap(v: unknown): PlaceMapData | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  const raw = v as Record<string, unknown>
  const out = emptyMap()
  out.nodes = cleanNodes(raw.nodes)
  out.routes = cleanRoutes(raw.routes)
  const pic = cleanPicture(raw.picture)
  if (pic) out.picture = pic
  const name = cleanMapName(raw.name)
  if (name) out.name = name
  if (isScale(raw.scale) && raw.scale !== 'town') out.scale = raw.scale
  if (Array.isArray(raw.levels)) {
    const levels: MapLevel[] = []
    const ids = new Set<string>()
    for (const l of raw.levels) {
      if (!l || typeof l !== 'object') continue
      const r = l as Record<string, unknown>
      const id = typeof r.id === 'string' && LEVEL_ID.test(r.id) ? r.id : null
      const lname = cleanMapName(r.name)
      if (!id || ids.has(id) || !lname) continue
      ids.add(id)
      const level: MapLevel = { id, name: lname, scale: isScale(r.scale) ? r.scale : 'town', nodes: cleanNodes(r.nodes), routes: cleanRoutes(r.routes) }
      if (typeof r.plan === 'string' && r.plan && r.plan.length <= 80) level.plan = r.plan
      const lp = cleanPicture(r.picture)
      if (lp) level.picture = lp
      levels.push(level)
      if (levels.length >= MAX_LEVELS) break
    }
    if (levels.length) out.levels = levels
  }
  if (typeof raw.at === 'string' && raw.at && raw.at.length <= 80) out.at = raw.at
  const hand = cleanHere(raw.here)
  if (hand) out.here = hand
  if (raw.labels && typeof raw.labels === 'object' && !Array.isArray(raw.labels)) {
    const labels: Record<string, string> = {}
    for (const [id, l] of Object.entries(raw.labels as Record<string, unknown>)) {
      const label = cleanLabel(l)
      if (!id || id.length > 80 || !label) continue
      labels[id] = label
      if (Object.keys(labels).length >= MAX_NODES) break
    }
    if (Object.keys(labels).length) out.labels = labels
  }
  if (raw.icons && typeof raw.icons === 'object' && !Array.isArray(raw.icons)) {
    const icons: Record<string, string> = {}
    for (const [id, k] of Object.entries(raw.icons as Record<string, unknown>)) {
      if (!id || id.length > 80 || typeof k !== 'string' || !ICON_KEY.test(k)) continue
      icons[id] = k
      if (Object.keys(icons).length >= MAX_NODES) break
    }
    if (Object.keys(icons).length) out.icons = icons
  }
  return Object.keys(out.nodes).length || out.routes.length || out.picture || out.at || out.here || out.labels || out.icons || out.levels || out.name || out.scale ? out : null
}

export interface MapNode {
  id: string
  /** what the map shows: the player's label when there is one, else the record's name */
  name: string
  /** the World record's own name (what the book, the Dashboard and the story call it) */
  bookName: string
  /** the icon the player picked for this place (`<kind>-<n>`), or null for the one the name says */
  icon: string | null
  /** the label, the record's name and its aliases: the icon's kind is read from all of them */
  names: string[]
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
    const label = cleanLabel(data?.labels?.[r.id])
    return { id: r.id, name: label ?? r.name, bookName: r.name, icon: ICON_KEY.test(data?.icons?.[r.id] ?? '') ? (data?.icons?.[r.id] ?? null) : null, names: [...(label ? [label] : []), r.name, ...(r.aliases ?? [])], spot: parentOf.has(r.id), parentId: parentOf.get(r.id) ?? null, here: r.id === hereId, visits: r.visits ?? 0, x: p.x, y: p.y }
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
  const addRoad = (routes: MapRoute[]): MapRoute[] =>
    prev && !routes.some((r) => routeKey(r.a, r.b) === routeKey(prev, whole)) ? [...routes, prev < whole ? { a: prev, b: whole } : { a: whole, b: prev }].slice(-MAX_ROUTES) : routes
  // with more than one map the road goes only on the maps that have both places
  const both = (nodes: Record<string, MapPos>) => !base.levels?.length || (!!nodes[prev ?? ''] && !!nodes[whole])
  const next: PlaceMapData = { ...base, routes: both(base.nodes) ? addRoad(base.routes) : base.routes, at: whole }
  if (base.levels?.length) next.levels = base.levels.map((l) => (both(l.nodes) ? { ...l, routes: addRoad(l.routes) } : l))
  return next
}

// ---------- levels: several maps in one chat ----------

/** The minutes one board unit takes on foot, by scale (town: 10 units a minute). */
export const MINUTES_PER_UNIT: Record<MapScale, number> = { town: 0.1, region: 3, world: 40 }

/** Kinds of place that also stand on a region or world map when they are new (a city, a village, a castle...). */
const REGIONAL_KINDS = new Set(['city', 'town', 'village', 'castle', 'fortress', 'port', 'airport'])

/** The ids of the chat's maps: the first, then the levels in order. */
export const levelIds = (data: PlaceMapData | null): string[] => [MAIN_LEVEL, ...(data?.levels ?? []).map((l) => l.id)]

/** A level's name, scale and the place it is the plan of (the first map: its own name, default "Map"). */
export function levelInfo(data: PlaceMapData | null, id: string, fallbackName = 'Map'): { id: string; name: string; scale: MapScale; plan: string | null } {
  if (id === MAIN_LEVEL || !data?.levels?.some((l) => l.id === id)) return { id: MAIN_LEVEL, name: data?.name ?? fallbackName, scale: data?.scale ?? 'town', plan: null }
  const l = data.levels.find((x) => x.id === id)!
  return { id: l.id, name: l.name, scale: l.scale, plan: l.plan ?? null }
}

/** One map as a map of its own: the places and roads and picture of that level, with what all levels share (the story's place, labels, icons). Every function above works on this. */
export function levelSlice(data: PlaceMapData | null, id: string): PlaceMapData {
  const base = data ?? emptyMap()
  const shared = { ...(base.at ? { at: base.at } : {}), ...(base.here ? { here: base.here } : {}), ...(base.labels ? { labels: base.labels } : {}), ...(base.icons ? { icons: base.icons } : {}) }
  const l = id === MAIN_LEVEL ? null : base.levels?.find((x) => x.id === id)
  if (!l) return { v: 1, nodes: base.nodes, routes: base.routes, ...(base.picture !== undefined ? { picture: base.picture } : {}), ...shared }
  return { v: 1, nodes: l.nodes, routes: l.routes, ...(l.picture !== undefined ? { picture: l.picture } : {}), ...shared }
}

/** The inverse of `levelSlice`: what a function changed on a slice goes back to the level it came from, the shared parts to the top. */
export function putSlice(data: PlaceMapData | null, id: string, slice: PlaceMapData): PlaceMapData {
  const base = data ?? emptyMap()
  const { at: _a, here: _h, labels: _l, icons: _i, ...rest } = base
  const top: PlaceMapData = { ...rest, ...(slice.at ? { at: slice.at } : {}), ...(slice.here ? { here: slice.here } : {}), ...(slice.labels ? { labels: slice.labels } : {}), ...(slice.icons ? { icons: slice.icons } : {}) }
  const pic = slice.picture !== undefined ? { picture: slice.picture } : {}
  if (id === MAIN_LEVEL || !base.levels?.some((x) => x.id === id)) {
    const { picture: _p, ...noPic } = top
    return { ...noPic, nodes: slice.nodes, routes: slice.routes, ...pic }
  }
  return { ...top, levels: base.levels.map((l) => (l.id === id ? { id: l.id, name: l.name, scale: l.scale, ...(l.plan ? { plan: l.plan } : {}), nodes: slice.nodes, routes: slice.routes, ...pic } : l)) }
}

/** The whole places of the records (not rooms) that are active. */
export function wholePlaces(records: WorldRecord[], hereId: string | null): WorldRecord[] {
  const tree = buildPlaceTree(records, hereId)
  const rooms = new Set<string>()
  for (const root of tree.roots) for (const s of root.spots) rooms.add(s.place.id)
  return records.filter((r) => r.kind === 'place' && r.status === 'active' && !rooms.has(r.id)).sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }))
}

export interface LevelLayout extends MapLayout { id: string }

/**
 * `layoutMap` for every map of the chat. A place stands on a level only where it has a position. A place with none anywhere is new:
 * it goes to the map the story is on (the level the story's place is on, else the first), and a city, village or castle also to the
 * region and world maps. Rooms follow their place on town-scale maps only. Returns the data with the new positions kept, and the
 * layout of each map. A map with one level behaves as before: every place is on it.
 */
export function layoutLevels(records: WorldRecord[], data: PlaceMapData | null, hereId: string | null): { data: PlaceMapData | null; layouts: LevelLayout[] } {
  const ids = levelIds(data)
  const slices = new Map(ids.map((id) => [id, levelSlice(data, id)]))
  const scaleOf = (id: string) => levelInfo(data, id).scale
  const wholes = wholePlaces(records, hereId)
  const hereWhole = wholeOf(records, hereId)
  const onLevel = (id: string, rid: string) => !!slices.get(id)!.nodes[rid]
  const assigned = (rid: string) => ids.some((id) => onLevel(id, rid))
  const home = ids.find((id) => hereWhole && onLevel(id, hereWhole)) ?? ids.find((id) => data?.at && onLevel(id, data.at)) ?? MAIN_LEVEL
  const arriving = new Map<string, Set<string>>(ids.map((id) => [id, new Set<string>()]))
  for (const r of wholes) {
    if (assigned(r.id)) continue
    arriving.get(home)!.add(r.id)
    if (ids.length > 1 && REGIONAL_KINDS.has(placeKind(r.name, ...(r.aliases ?? [])).id)) {
      for (const id of ids) if (scaleOf(id) !== 'town') arriving.get(id)!.add(r.id)
    }
  }
  const tree = buildPlaceTree(records, hereId)
  const spotsOf = new Map<string, string[]>(tree.roots.map((root) => [root.place.id, root.spots.map((s) => s.place.id)]))
  let next = data
  const layouts: LevelLayout[] = []
  const hereOnAll = hereMarks(data, records, hereWhole, ids)
  for (const id of ids) {
    const slice = slices.get(id)!
    const members = wholes.filter((r) => onLevel(id, r.id) || arriving.get(id)!.has(r.id))
    const memberIds = new Set(members.map((r) => r.id))
    const keep = new Set(memberIds)
    if (scaleOf(id) === 'town') for (const m of memberIds) for (const s of spotsOf.get(m) ?? []) keep.add(s)
    const sub = ids.length > 1 ? records.filter((r) => keep.has(r.id)) : records
    const lay = layoutMap(sub, slice, hereId && keep.has(hereId) ? hereId : null)
    // the story's place on a map that does not hold it: the place this level's plan stands for
    const mark = hereOnAll.get(id) ?? null
    const nodes = lay.nodes.map((n) => (mark && !lay.nodes.some((x) => x.here) ? { ...n, here: n.id === mark } : n))
    layouts.push({ id, nodes, added: lay.added })
    if (Object.keys(lay.added).length) next = putSlice(next, id, withPositions(levelSlice(next, id), lay.added))
  }
  return { data: next, layouts }
}

/** For each map, the node the story is on there: the place itself, or the place a map of it stands for (a city on the country's map while the story is in its tavern). */
function hereMarks(data: PlaceMapData | null, records: WorldRecord[], hereWhole: string | null, ids: string[]): Map<string, string> {
  const out = new Map<string, string>()
  if (!hereWhole) return out
  let at: string | null = hereWhole
  for (let hop = 0; hop < 6 && at; hop++) {
    const cur: string = at
    const found = ids.filter((id) => !!levelSlice(data, id).nodes[cur])
    for (const id of found) if (!out.has(id)) out.set(id, cur)
    // the maps that hold `cur` are plans of other places: go up through them
    const parents: Array<string | null | undefined> = found.map((id) => (id === MAIN_LEVEL ? null : data?.levels?.find((l) => l.id === id)?.plan))
    at = parents.find((p) => !!p && records.some((r) => r.id === p)) ?? null
  }
  return out
}

/** The level whose plan is this place (a double look at a city opens its map), or null. */
export const levelOfPlan = (data: PlaceMapData | null, placeId: string): string | null => data?.levels?.find((l) => l.plan === placeId)?.id ?? null

/** The map "above" a level: the one that holds the place it is the plan of; null for the first map or a level with no plan. */
export function parentLevel(data: PlaceMapData | null, id: string): string | null {
  const plan = levelInfo(data, id).plan
  if (!plan) return null
  return levelIds(data).find((x) => x !== id && !!levelSlice(data, x).nodes[plan]) ?? null
}

/** A new level, empty or with the given places. A region or world map starts with the cities, villages and castles the book has. Returns the data and the new id (null when the limit is reached). */
export function addLevel(data: PlaceMapData | null, records: WorldRecord[], info: { name: string; scale: MapScale; plan?: string | null }): { data: PlaceMapData; id: string | null } {
  const base = data ?? emptyMap()
  const levels = base.levels ?? []
  if (levels.length >= MAX_LEVELS) return { data: base, id: null }
  let n = 1
  while (levels.some((l) => l.id === `l${n}`)) n++
  const id = `l${n}`
  const name = cleanMapName(info.name) ?? `Map ${levels.length + 2}`
  const level: MapLevel = { id, name, scale: info.scale, ...(info.plan ? { plan: info.plan } : {}), nodes: {}, routes: [] }
  const withLevel: PlaceMapData = { ...base, levels: [...levels, level] }
  if (info.scale === 'town') return { data: withLevel, id }
  const regional = wholePlaces(records, null).filter((r) => REGIONAL_KINDS.has(placeKind(r.name, ...(r.aliases ?? [])).id) && r.id !== info.plan).map((r) => r.id)
  return { data: setMembers(withLevel, records, id, regional), id }
}

/** Rename a level or change its scale or the place it is the plan of (the first map: name and scale only). */
export function setLevelInfo(data: PlaceMapData | null, id: string, info: { name?: string; scale?: MapScale; plan?: string | null }): PlaceMapData {
  const base = data ?? emptyMap()
  const name = info.name === undefined ? undefined : cleanMapName(info.name)
  if (id === MAIN_LEVEL || !base.levels?.some((l) => l.id === id)) {
    const { name: _n, scale: _s, ...rest } = base
    const nextName = name === undefined ? base.name : name ?? undefined
    const nextScale = info.scale ?? base.scale
    return { ...rest, ...(nextName ? { name: nextName } : {}), ...(nextScale && nextScale !== 'town' ? { scale: nextScale } : {}) }
  }
  return {
    ...base,
    levels: base.levels.map((l) => {
      if (l.id !== id) return l
      const { plan: _p, ...rest } = l
      const plan = info.plan === undefined ? l.plan : info.plan
      return { ...rest, name: name ?? l.name, scale: info.scale ?? l.scale, ...(plan ? { plan } : {}) }
    }),
  }
}

/** Take a level away (its places stay on the other maps; a place on no map goes to the story's map again). The first map cannot be removed. */
export function removeLevel(data: PlaceMapData | null, id: string): PlaceMapData | null {
  if (!data?.levels?.some((l) => l.id === id)) return data
  const levels = data.levels.filter((l) => l.id !== id)
  const { levels: _l, ...rest } = data
  return levels.length ? { ...rest, levels } : rest
}

/**
 * Put exactly these whole places on a level (the others come off it; their rooms go with them). New ones get a free spot near the
 * middle. The roads between places that stay are kept.
 */
export function setMembers(data: PlaceMapData | null, records: WorldRecord[], id: string, wanted: readonly string[]): PlaceMapData {
  const slice = levelSlice(data, id)
  const want = new Set(wanted)
  const parentOf = new Map<string, string>()
  for (const root of buildPlaceTree(records, null).roots) for (const s of root.spots) parentOf.set(s.place.id, root.place.id)
  const nodes: Record<string, MapPos> = {}
  for (const [rid, p] of Object.entries(slice.nodes)) {
    const parent = parentOf.get(rid)
    if (want.has(rid) || (parent && want.has(parent))) nodes[rid] = p
  }
  const keptSlice: PlaceMapData = { ...slice, nodes, routes: slice.routes.filter((r) => nodes[r.a] && nodes[r.b]) }
  const adds = records.filter((r) => want.has(r.id) && !nodes[r.id] && r.kind === 'place' && r.status === 'active' && !parentOf.has(r.id))
  if (!adds.length) return putSlice(data, id, keptSlice)
  const sub = records.filter((r) => nodes[r.id] || adds.some((a) => a.id === r.id))
  const lay = layoutMap(sub, keptSlice, null)
  return putSlice(data, id, withPositions(keptSlice, lay.added))
}

/** A road drawn by hand: joins two places, or takes the road between them away when there is one. `added` says which happened. */
export function toggleRoute(data: PlaceMapData | null, a: string, b: string): { data: PlaceMapData; added: boolean } {
  const base = data ?? emptyMap()
  if (!a || !b || a === b) return { data: base, added: false }
  const key = routeKey(a, b)
  if (base.routes.some((r) => routeKey(r.a, r.b) === key)) return { data: { ...base, routes: base.routes.filter((r) => routeKey(r.a, r.b) !== key) }, added: false }
  const route = a < b ? { a, b } : { a: b, b: a }
  return { data: { ...base, routes: [...base.routes, route].slice(-MAX_ROUTES) }, added: true }
}

/** Put a place's icon in or take it off (null = back to the one the name says). */
export function setIcon(data: PlaceMapData | null, id: string, key: string | null): PlaceMapData {
  const base = data ?? emptyMap()
  const icons = { ...(base.icons ?? {}) }
  if (key && ICON_KEY.test(key)) icons[id] = key
  else delete icons[id]
  const { icons: _old, ...rest } = base
  return Object.keys(icons).length ? { ...rest, icons } : rest
}

/** The road between two places, if there is one. */
export const routeOf = (data: PlaceMapData | null, a: string, b: string): MapRoute | null => (data?.routes ?? []).find((r) => routeKey(r.a, r.b) === routeKey(a, b)) ?? null

/** Set what a road keeps (walking minutes, its name; null takes one off), making the road when there is none. */
export function setRouteInfo(data: PlaceMapData | null, a: string, b: string, info: { minutes?: number | null; via?: string | null }): PlaceMapData {
  const base = data ?? emptyMap()
  if (!a || !b || a === b) return base
  const key = routeKey(a, b)
  const old = base.routes.find((r) => routeKey(r.a, r.b) === key)
  const next: MapRoute = { ...(a < b ? { a, b } : { a: b, b: a }) }
  const minutes = info.minutes === undefined ? old?.minutes : info.minutes
  const via = info.via === undefined ? old?.via : info.via
  if (minutes) next.minutes = minutes
  if (via) next.via = via
  const routes = old ? base.routes.map((r) => (routeKey(r.a, r.b) === key ? next : r)) : [...base.routes, next].slice(-MAX_ROUTES)
  return { ...base, routes }
}

/** How many roads a place has. */
export const roadsOf = (data: PlaceMapData | null, id: string): number => (data?.routes ?? []).filter((r) => r.a === id || r.b === id).length

/** The routes whose two ends are both on the map. */
export const visibleRoutes = (data: PlaceMapData | null, nodes: readonly MapNode[]): MapRoute[] => {
  const ids = new Set(nodes.map((n) => n.id))
  return (data?.routes ?? []).filter((r) => ids.has(r.a) && ids.has(r.b))
}

// ---------- the story's place by hand, and spreading the places over the picture ----------

/** The Dashboard's place line as a hand mark remembers it: spaces squeezed, cut to HERE_SCENE_MAX. */
export const sceneLine = (scene: string | null | undefined): string => (scene ?? '').replace(/\s+/g, ' ').trim().slice(0, HERE_SCENE_MAX)

/**
 * The place the player marked as the one the story is in, when it still holds: the Dashboard named no place of the book (`hereId`
 * is null), the place line is the one the mark was made against, and the place is still an active place of the book. Else null.
 */
export function handHere(data: PlaceMapData | null, records: readonly WorldRecord[], hereId: string | null, scene: string | null | undefined): string | null {
  const h = data?.here
  if (!h || hereId) return null
  if (h.scene !== sceneLine(scene)) return null
  return records.some((r) => r.id === h.id && r.kind === 'place' && r.status === 'active') ? h.id : null
}

/** Mark a place as the one the story is in (or take the mark off with null), against the Dashboard's current place line. */
export function setHandHere(data: PlaceMapData | null, id: string | null, scene: string | null | undefined): PlaceMapData {
  const { here: _old, ...rest } = data ?? emptyMap()
  return id ? { ...rest, here: { id, scene: sceneLine(scene) } } : rest
}

/** Room around the board's edge that spreading keeps free (the margin plus a name under the icon). */
const SPREAD_EDGE = MARGIN + 50
/** At most this much stretch on one axis, so a pair of near places does not become two far ones. */
const SPREAD_MAX = 4

/**
 * New positions that spread the whole places over the board: the arrangement the player has (or the app gave) is stretched to fill the
 * board, never squeezed, so nothing that was apart comes closer. Rooms keep their distance from their place and move with it. Returns
 * null when there is nothing to do (fewer than two whole places, or they already fill the board).
 */
export function spreadPositions(nodes: readonly MapNode[]): Record<string, MapPos> | null {
  const wholes = nodes.filter((n) => !n.spot)
  if (wholes.length < 2) return null
  const xs = wholes.map((n) => n.x)
  const ys = wholes.map((n) => n.y)
  const w = Math.max(...xs) - Math.min(...xs)
  const h = Math.max(...ys) - Math.min(...ys)
  const sx = w < 1 ? 1 : Math.min(SPREAD_MAX, Math.max(1, (BOARD_W - 2 * SPREAD_EDGE) / w))
  const sy = h < 1 ? 1 : Math.min(SPREAD_MAX, Math.max(1, (BOARD_H - 2 * SPREAD_EDGE) / h))
  if (sx < 1.05 && sy < 1.05) return null
  const cx = (Math.max(...xs) + Math.min(...xs)) / 2
  const cy = (Math.max(...ys) + Math.min(...ys)) / 2
  const moved: Record<string, MapPos> = {}
  for (const n of wholes) moved[n.id] = clampPos({ x: BOARD_W / 2 + (n.x - cx) * sx, y: BOARD_H / 2 + (n.y - cy) * sy })
  for (const n of nodes) {
    if (!n.spot) continue
    const parent = nodes.find((p) => p.id === n.parentId)
    const to = parent ? moved[parent.id] : undefined
    moved[n.id] = parent && to ? clampPos({ x: to.x + (n.x - parent.x), y: to.y + (n.y - parent.y) }) : { x: n.x, y: n.y }
  }
  return moved
}
